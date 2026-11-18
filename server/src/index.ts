import './env'

import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { runAgentTask, runDirectChat, geminiUsage, TaskError } from './agents/agentService'
import { GeminiError } from './agents/gemini'
import { listAgents, getChatHistory, getRelationshipNotes, addChatMessage } from './store'
import { addClient, removeClient, clientCount } from './ws'
import { snapshots } from './sim/snapshot'
import { startSim } from './sim/loop'
import { handleClientMessage } from './wsHandlers'
import { clock, clockLabel, getSim } from './sim/state'
import {
  setConversationsEnabled,
  isConversationsEnabled,
  getActiveConversation,
} from './sim/conversation'
import { initVault, getAgentVaultNote, getVaultPath } from './vault'
import { initRelationships, getAgentRelationships } from './sim/relationships'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest'

const app = Fastify({
  logger: { level: 'info' },
})

await app.register(cors, {
  // Dev only: the browser talks through the Vite proxy, but allow direct calls too.
  origin: true,
})

await app.register(websocket)

/** Live channel: snapshot on connect, then 10 Hz agent updates. */
app.get('/ws', { websocket: true }, (socket) => {
  addClient(socket)
  socket.send(JSON.stringify({ type: 'world_snapshot', agents: snapshots(), clock }))
  socket.on('message', (raw: Buffer) => handleClientMessage(raw.toString()))
  socket.on('close', () => removeClient(socket))
})

/** Liveness + what the backend currently knows how to do. */
app.get('/api/health', async () => ({
  ok: true,
  name: 'hive',
  phase: 1,
  steps: [1, 2, 3, 9],
  geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  model: MODEL,
  usage: geminiUsage(),
  uptime: Math.round(process.uptime()),
}))

/**
 * Step 3 preview / step 9 memory: the five starter agents. Once the simulation
 * and SQLite land (steps 5-8) this reads from the database instead of the seed.
 */
app.get('/api/agents', async () => ({ agents: listAgents() }))

/** How much of the daily Gemini budget is left. */
app.get('/api/usage', async () => geminiUsage())

/** Debug map: blocked cells and furniture slots for the 3D debug overlay. */
app.get('/api/debug/map', async () => {
  const { isWalkable, GRID_SIZE } = await import('./sim/map')
  const { SLOTS } = await import('./sim/furniture')
  const blocked: Array<[number, number]> = []
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!isWalkable({ x, y })) blocked.push([x, y])
    }
  }
  return {
    blocked,
    slots: SLOTS.map((s) => ({
      id: s.id,
      type: s.type,
      stand: s.stand,
      facing: s.facing,
      activity: s.activity,
    })),
  }
})

interface TaskBody {
  agentId?: string
  prompt?: string
}

/**
 * Step 9: give an agent a task. The server builds the persona prompt, calls
 * Gemini, stores the answer and returns the updated agent so the panel can
 * re-render without a second round trip.
 */
app.post<{ Body: TaskBody }>('/api/tasks', async (request, reply) => {
  const agentId = request.body?.agentId
  const prompt = request.body?.prompt

  if (typeof agentId !== 'string' || !agentId.trim()) {
    return reply.code(400).send({ error: 'agentId is required.' })
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return reply.code(400).send({ error: 'prompt is required.' })
  }
  if (prompt.length > 2000) {
    return reply.code(400).send({ error: 'prompt must be 2000 characters or fewer.' })
  }

  try {
    const result = await runAgentTask(agentId.trim(), prompt.trim())
    return result
  } catch (error) {
    if (error instanceof TaskError) {
      return reply.code(error.statusCode).send({ error: error.message })
    }
    if (error instanceof GeminiError) {
      request.log.warn({ status: error.status }, 'gemini request failed')
      return reply.code(error.status >= 400 ? error.status : 502).send({ error: error.message })
    }
    request.log.error({ err: error }, 'task failed')
    return reply.code(502).send({ error: 'The task failed before Gemini answered.' })
  }
})

interface ChatBody {
  agentId?: string
  message?: string
}

/**
 * Direct in-character chat with an agent (P2.3).
 */
app.post<{ Body: ChatBody }>('/api/chat', async (request, reply) => {
  const agentId = request.body?.agentId
  const message = request.body?.message

  if (typeof agentId !== 'string' || !agentId.trim()) {
    return reply.code(400).send({ error: 'agentId is required.' })
  }
  if (typeof message !== 'string' || !message.trim()) {
    return reply.code(400).send({ error: 'message is required.' })
  }

  try {
    const userMsg = addChatMessage(agentId.trim(), 'user', message.trim())
    const replyText = await runDirectChat(agentId.trim(), message.trim())
    const agentMsg = addChatMessage(agentId.trim(), 'agent', replyText)

    // Show speech bubble in the 3D scene
    const sim = getSim(agentId.trim())
    if (sim) {
      sim.speech = replyText
      sim.speechUntil = Date.now() + 4500
      if (sim.activity !== 'walking') {
        sim.animation = 'talk'
        setTimeout(() => {
          if (sim.animation === 'talk') {
            sim.animation = sim.activity === 'walking' ? 'walk' : 'idle'
          }
        }, 3200)
      }
    }

    return { userMsg, agentMsg }
  } catch (error) {
    if (error instanceof TaskError) {
      return reply.code(error.statusCode).send({ error: error.message })
    }
    if (error instanceof GeminiError) {
      return reply.code(error.status >= 400 ? error.status : 502).send({ error: error.message })
    }
    return reply.code(502).send({ error: 'Direct chat failed.' })
  }
})

app.get<{ Params: { id: string } }>('/api/agents/:id/chat', async (request) => {
  const agentId = request.params.id
  return {
    history: getChatHistory(agentId),
    relationships: getRelationshipNotes(agentId),
  }
})

app.post<{ Body: { enabled?: boolean } }>('/api/conversations/toggle', async (request) => {
  const enabled = Boolean(request.body?.enabled)
  setConversationsEnabled(enabled)
  return { enabled: isConversationsEnabled(), active: getActiveConversation() }
})

/**
 * Obsidian Second Brain API (P3).
 */
app.get<{ Params: { id: string } }>('/api/vault/:id', async (request, reply) => {
  const agent = listAgents().find((a) => a.id === request.params.id)
  if (!agent) return reply.code(404).send({ error: 'Agent not found' })
  const note = getAgentVaultNote(agent.name)
  return {
    agentId: agent.id,
    agentName: agent.name,
    vaultPath: `${getVaultPath()}/Agents/${agent.name}.md`,
    content: note ?? '# Note not found',
  }
})

app.get<{ Params: { id: string } }>('/api/relationships/:id', async (request) => {
  const agentId = request.params.id
  return { relationships: getAgentRelationships(agentId) }
})

initVault()
initRelationships()

await app.listen({ port: PORT, host: HOST })
startSim()
app.log.info(`hive server listening on http://localhost:${PORT} (model: ${MODEL})`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}
