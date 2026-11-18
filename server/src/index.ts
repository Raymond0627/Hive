import './env'

import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { runAgentTask, geminiUsage, TaskError } from './agents/agentService'
import { GeminiError } from './agents/gemini'
import { listAgents } from './store'
import { addClient, removeClient, clientCount } from './ws'
import { snapshots } from './sim/snapshot'
import { startSim } from './sim/loop'
import { handleClientMessage } from './wsHandlers'
import { clockLabel } from './sim/state'

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
  socket.send(JSON.stringify({ type: 'world_snapshot', agents: snapshots() }))
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

await app.listen({ port: PORT, host: HOST })
startSim()
app.log.info(`hive server listening on http://localhost:${PORT} (model: ${MODEL})`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}
