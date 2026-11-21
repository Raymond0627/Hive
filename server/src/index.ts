import './env'

import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import multipart from '@fastify/multipart'
import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { runAgentTask, runDirectChat, geminiUsage, TaskError } from './agents/agentService'
import { GeminiError } from './agents/gemini'
import { listAgents, getChatHistory, getRelationshipNotes, addChatMessage } from './store'
import { addClient, removeClient, clientCount, broadcast } from './ws'
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
import { createJob, listJobs, getJob, transition, cancelJob, deleteCancelledJob } from './producer/stateMachine'
import { onJobEvent } from './producer/bus'
import {
  buildJobDetail,
  intakeProduct,
  storeProductImage,
  uploadVideo,
  normalizeLatestVideo,
  runQA,
  generatePostKit,
  scheduleJob,
  markJobPosted,
  afterTransitionTo,
  researchProductWithGemini,
} from './producer/stages'
import { getSettings, setSettings } from './settings'
import { jobDir, safeJobPath, streamToFile, sanitizeFileName, maxUploadBytes, VIDEO_EXTENSIONS, VIDEO_MIME_TYPES, IMAGE_EXTENSIONS, IMAGE_MIME_TYPES } from './media/storage'
import { imageInfo } from './media/imageInfo'

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
await app.register(multipart, { limits: { fileSize: maxUploadBytes(), files: 1 } })

onJobEvent((event, job) => {
  broadcast({ type: 'stage_event', event, job })
  broadcast({ type: 'job_update', job })
})

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
  steps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
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

/** TikTok Content Office: jobs. */
app.get('/api/jobs', async () => ({ jobs: listJobs() }))

app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
  const detail = buildJobDetail(request.params.id)
  if (!detail) return reply.code(404).send({ error: 'Unknown job.' })
  return detail
})

app.post<{ Body: { title?: string } }>('/api/jobs', async (request, reply) => {
  const title = request.body?.title?.trim()
  if (!title) return reply.code(400).send({ error: 'title is required.' })
  const job = createJob(title)
  return { job }
})

app.post<{ Params: { id: string }; Body: { to?: string; note?: string } }>(
  '/api/jobs/:id/transition',
  async (request, reply) => {
    const to = request.body?.to as never
    const job = getJob(request.params.id)
    if (!job) return reply.code(404).send({ error: 'Unknown job.' })
    try {
      const updated = transition(request.params.id, to, 'boss', request.body?.note)
      await afterTransitionTo(request.params.id, to)
      return { job: updated }
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message })
    }
  },
)

app.post<{ Params: { id: string }; Body: { title?: string; category?: string; sourceUrl?: string; text?: string } }>(
  '/api/jobs/:id/product', async (request, reply) => {
    try {
      const body = request.body ?? {}
      const product = intakeProduct(request.params.id, {
        title: body.title?.trim() ?? '',
        category: (body.category ?? 'other') as never,
        sourceUrl: body.sourceUrl?.trim() || null,
        text: body.text ?? '',
      })
      return { job: product }
    } catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
  },
)

app.post<{ Params: { id: string }; Body: { title?: string; sourceUrl?: string; listingText?: string } }>(
  '/api/jobs/:id/research', async (request, reply) => {
    try {
      const body = request.body ?? {}
      return await researchProductWithGemini(request.params.id, {
        title: body.title?.trim() ?? '',
        sourceUrl: body.sourceUrl?.trim() || null,
        listingText: body.listingText ?? '',
      })
    } catch (error) {
      const status = (error as { status?: number }).status
      return reply.code(status && status >= 400 ? status : 400).send({ error: (error as Error).message })
    }
  },
)

app.post<{ Params: { id: string } }>('/api/jobs/:id/images', async (request, reply) => {
  try {
    const part = await request.file()
    if (!part) return reply.code(400).send({ error: 'An image file is required.' })
    const ext = extname(part.filename).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext) || !IMAGE_MIME_TYPES.has(part.mimetype)) return reply.code(400).send({ error: 'Image must be JPG, PNG or WebP with a matching MIME type.' })
    const name = `${Date.now()}-${sanitizeFileName(part.filename)}`
    const relative = `images/${name}`
    const target = safeJobPath(request.params.id, relative)
    await streamToFile(part.file, target)
    const info = imageInfo(target)
    if (!info) return reply.code(400).send({ error: 'The uploaded file is not a readable JPG, PNG or WebP image.' })
    const sourceField = part.fields.source
    const source = sourceField && !Array.isArray(sourceField) && typeof sourceField.value === 'string'
      ? sourceField.value
      : 'boss-upload'
    const image = storeProductImage(request.params.id, name, info, source)
    return { image }
  } catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string } }>('/api/jobs/:id/video', async (request, reply) => {
  try {
    const part = await request.file()
    if (!part) return reply.code(400).send({ error: 'A video file is required.' })
    const ext = extname(part.filename).slice(1).toLowerCase()
    if (!VIDEO_EXTENSIONS.has(ext) || !VIDEO_MIME_TYPES.has(part.mimetype)) return reply.code(400).send({ error: 'Video must be MP4 or MOV with a matching MIME type.' })
    const existing = buildJobDetail(request.params.id)?.video?.version ?? 0
    const version = existing + 1
    const name = `v${version}.${ext}`
    const relative = `video/${name}`
    await streamToFile(part.file, safeJobPath(request.params.id, relative))
    const result = await uploadVideo(request.params.id, relative, part.filename, version)
    return result
  } catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string } }>('/api/jobs/:id/normalize', async (request, reply) => {
  try { return await normalizeLatestVideo(request.params.id) }
  catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string }; Body: { verdict?: 'pass' | 'fixable' | 'reject' } }>('/api/jobs/:id/qa', async (request, reply) => {
  try { return await runQA(request.params.id, request.body?.verdict) }
  catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string } }>('/api/jobs/:id/approve-product', async (request, reply) => {
  try { return { job: transition(request.params.id, 'product_ready', 'boss', 'Product approved (G1)') } }
  catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string } }>('/api/jobs/:id/post-kit', async (request, reply) => {
  try { return { job: await generatePostKit(request.params.id) } }
  catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string }; Body: { at?: number } }>('/api/jobs/:id/schedule', async (request, reply) => {
  try { return { job: scheduleJob(request.params.id, Number(request.body?.at)) } }
  catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.post<{ Params: { id: string }; Body: { url?: string } }>('/api/jobs/:id/mark-posted', async (request, reply) => {
  try { return { job: markJobPosted(request.params.id, request.body?.url ?? '') } }
  catch (error) { return reply.code(400).send({ error: (error as Error).message }) }
})

app.get<{ Params: { id: string; '*': string } }>('/api/jobs/:id/media/*', async (request, reply) => {
  try {
    const rel = request.params['*']
    const path = safeJobPath(request.params.id, rel)
    return reply.type('application/octet-stream').send(createReadStream(path))
  } catch { return reply.code(404).send({ error: 'Media file not found.' }) }
})

app.get('/api/settings', async () => getSettings())
app.put<{ Body: Record<string, unknown> }>('/api/settings', async (request) => setSettings(request.body ?? {}))

app.post<{ Params: { id: string }; Body: { reason?: string } }>(
  '/api/jobs/:id/cancel',
  async (request, reply) => {
    const job = getJob(request.params.id)
    if (!job) return reply.code(404).send({ error: 'Unknown job.' })
    try {
      const updated = cancelJob(request.params.id, request.body?.reason ?? 'cancelled')
      return { job: updated }
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message })
    }
  },
)

app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
  try {
    deleteCancelledJob(request.params.id)
    return { ok: true }
  } catch (error) {
    return reply.code(400).send({ error: (error as Error).message })
  }
})

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
