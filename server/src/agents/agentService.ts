import type { AgentPreview } from '@hive/shared'
import { generateJson, generateText, parseTaskResult, GeminiError, getTaskModel, getCheapModel } from './gemini'
import { getSim } from '../sim/state'
import { beginTask, endTask } from '../sim/engine'
import { recordTaskToVault } from '../vault'
import { logUsage } from '../persistence'
import { broadcast } from '../ws'
import {
  addChatMessage,
  completedTasksFor,
  createTask,
  finishTask,
  getAgent,
  getChatHistory,
  rememberLastTask,
  rememberLesson,
} from '../store'

/** A request the API can safely describe to the browser. */
export class TaskError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'TaskError'
    this.statusCode = statusCode
  }
}

/** One running task per agent (brief section 8). */
const running = new Set<string>()

/** Process-local daily budget. Reset rolls over at UTC midnight. */
const day = () => new Date().toISOString().slice(0, 10)
let usageDay = day()
let usageCount = 0

function dailyLimit(): number {
  const parsed = Number(process.env.DAILY_REQUEST_LIMIT ?? 200)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200
}

function rollUsageDay(): void {
  const today = day()
  if (today !== usageDay) {
    usageDay = today
    usageCount = 0
  }
}

export function geminiUsage(): { day: string; used: number; limit: number } {
  rollUsageDay()
  return { day: usageDay, used: usageCount, limit: dailyLimit() }
}

function buildSystemPrompt(agent: AgentPreview): string {
  return [
    `You are ${agent.name}, the ${agent.role} at Hive — a small office staffed by AI agents.`,
    `Personality: ${agent.personality}`,
    `Rules: ${agent.rules}`,
    '',
    'Stay in character. Be concrete and brief: at most 120 words.',
    'You cannot browse, send, schedule or change anything; you only produce text.',
    'Reply with a JSON object containing exactly two fields:',
    '"result": your answer, written for a teammate reading it in the UI.',
    '"lesson": one short sentence of durable knowledge you gained, or null if there is nothing worth keeping.',
  ].join('\n')
}

function buildUserPrompt(agent: AgentPreview, prompt: string): string {
  const lessons = agent.lessons.slice(-5)
  const recent = completedTasksFor(agent.id, 3)
  const parts: string[] = []

  if (lessons.length > 0) {
    parts.push('Lessons you have already learned:', ...lessons.map((lesson) => `- ${lesson}`), '')
  }

  if (recent.length > 0) {
    parts.push(
      'Your last completed tasks:',
      ...recent.map(
        (task) => `- Asked: ${task.prompt}\n  Answered: ${task.result?.slice(0, 240) ?? ''}`,
      ),
      '',
    )
  }

  parts.push('New task from a teammate:', prompt)
  return parts.join('\n')
}

export interface RunTaskResult {
  task: ReturnType<typeof createTask>
  agent: AgentPreview
}

/**
 * Queue a task, call Gemini, then store the answer and the lesson it produced.
 * The simulation (step 6) will also walk the agent to its desk around this call.
 *
 * Step 8 safeguard: one running task per agent — extra requests are queued and
 * drained in order instead of being rejected.
 */
const queues = new Map<string, Array<{ task: ReturnType<typeof createTask>; prompt: string }>>()

export async function runAgentTask(agentId: string, prompt: string): Promise<RunTaskResult> {
  const agent = getAgent(agentId)
  if (!agent) throw new TaskError(404, 'Unknown agent.')

  rollUsageDay()
  const limit = dailyLimit()
  if (usageCount >= limit) {
    throw new TaskError(429, `Daily Gemini limit reached (${limit} requests). Try again tomorrow.`)
  }

  if (running.has(agentId)) {
    const task = createTask(agentId, prompt)
    const queue = queues.get(agentId) ?? []
    queue.push({ task, prompt })
    queues.set(agentId, queue)
    broadcast({ type: 'task_update', task, lessons: [] })
    return { task, agent }
  }

  const task = createTask(agentId, prompt)
  return executeTask(agent, task, prompt)
}

async function executeTask(
  agent: AgentPreview,
  task: ReturnType<typeof createTask>,
  prompt: string,
): Promise<RunTaskResult> {
  const agentId = agent.id
  running.add(agentId)
  usageCount += 1
  agent.activity = 'working'
  beginTask(agentId)

  try {
    const raw = await generateJson({
      system: buildSystemPrompt(agent),
      user: buildUserPrompt(agent, prompt),
      maxOutputTokens: 420,
    })
    logUsage('task', getTaskModel())

    const parsed = parseTaskResult(raw)
    finishTask(task, 'done', parsed.result)
    if (parsed.lesson) rememberLesson(agent, parsed.lesson)
    rememberLastTask(agent, {
      prompt,
      result: parsed.result,
      status: 'done',
      at: task.finishedAt ?? Date.now(),
    })

    // Record to Obsidian Second Brain vault (P3.3)
    recordTaskToVault(agent.name, prompt, parsed.result, parsed.lesson)
    endTask(agentId, true)
    broadcast({ type: 'task_update', task, lessons: [] })

    return { task, agent }
  } catch (error) {
    finishTask(task, 'failed', null)
    rememberLastTask(agent, {
      prompt,
      result: null,
      status: 'failed',
      at: task.finishedAt ?? Date.now(),
    })
    endTask(agentId, false)
    broadcast({ type: 'task_update', task, lessons: [] })
    throw error
  } finally {
    running.delete(agentId)
    agent.activity = 'idle'
    drainQueue(agentId)
  }
}

/** Start the next queued task for an agent, if any. */
function drainQueue(agentId: string): void {
  const queue = queues.get(agentId)
  if (!queue || queue.length === 0) return
  const next = queue.shift()
  if (!next) return
  if (queue.length === 0) queues.delete(agentId)

  const agent = getAgent(agentId)
  if (!agent) return

  rollUsageDay()
  if (usageCount >= dailyLimit()) {
    finishTask(next.task, 'failed', 'Daily Gemini limit reached.')
    broadcast({ type: 'task_update', task: next.task, lessons: [] })
    return
  }

  void executeTask(agent, next.task, next.prompt).catch(() => {
    // executeTask already marked the task failed and broadcast the update.
  })
}

/**
 * Direct chat from the user to an agent in character (P2.3).
 */
export async function runDirectChat(agentId: string, message: string): Promise<string> {
  const agent = getAgent(agentId)
  if (!agent) throw new TaskError(404, 'Unknown agent.')

  rollUsageDay()
  const limit = dailyLimit()
  if (usageCount >= limit) {
    throw new TaskError(429, `Daily Gemini limit reached (${limit} requests). Try again tomorrow.`)
  }

  const sim = getSim(agentId)
  const currentActivity = sim ? sim.activity : agent.activity
  const currentMood = sim ? sim.mood : agent.mood

  const system = [
    `You are ${agent.name}, the ${agent.role} at Hive — an office where AI agents live and work.`,
    `Personality: ${agent.personality}`,
    `Rules: ${agent.rules}`,
    `Context right now: You are currently ${currentActivity} and feeling ${currentMood}.`,
    '',
    'A visitor or teammate in the office is speaking to you directly.',
    'Stay strictly in character. Respond naturally, helpfully, and briefly (at most 28 words).',
    'Acknowledge what you are doing right now if relevant.',
  ].join('\n')

  const history = getChatHistory(agentId).slice(-4)
  const conversationLines: string[] = []
  for (const h of history) {
    conversationLines.push(`${h.from === 'user' ? 'Visitor' : agent.name}: ${h.text}`)
  }
  conversationLines.push(`Visitor: ${message}`)

  usageCount += 1
  try {
    const reply = await generateText({
      system,
      user: conversationLines.join('\n'),
      maxOutputTokens: 60,
      temperature: 0.85,
    })
    logUsage('direct_chat', getCheapModel())

    const cleaned = reply.replace(/^["']|["']$/g, '').trim()
    addChatMessage(agentId, 'user', message)
    addChatMessage(agentId, 'agent', cleaned)
    return cleaned
  } catch (error) {
    if (error instanceof GeminiError) throw error
    throw new TaskError(502, 'Failed to get a response from Gemini.')
  }
}

/**
 * Single turn in an agent-to-agent conversation using context cards (P2.2 & P2.3).
 */
export async function runConversationTurn(
  speakerId: string,
  listenerId: string,
  history: Array<{ speakerName: string; text: string }>,
  topic: string,
): Promise<string> {
  const speaker = getAgent(speakerId)
  const listener = getAgent(listenerId)
  if (!speaker || !listener) return ''

  rollUsageDay()
  if (usageCount >= dailyLimit()) return ''

  const speakerSim = getSim(speakerId)
  const listenerSim = getSim(listenerId)
  const note = speaker.relationships?.[listenerId] ?? 'First conversation today.'

  const system = [
    `You are ${speaker.name}, the ${speaker.role} at Hive.`,
    `Personality: ${speaker.personality}`,
    `You are having a casual in-office exchange with ${listener.name}, the ${listener.role}.`,
    `Your current activity: ${speakerSim?.activity ?? speaker.activity}.`,
    `Their current activity: ${listenerSim?.activity ?? listener.activity}.`,
    `Relationship memory: ${note}`,
    `Topic: ${topic}`,
    '',
    `Rules: Address ${listener.name} naturally. Max 14 words. Stay in character. Produce only the line spoken.`,
  ].join('\n')

  const userPrompt =
    history.length === 0
      ? `Greet ${listener.name} and bring up the topic.`
      : history.map((h) => `${h.speakerName}: ${h.text}`).join('\n') + `\n${speaker.name}:`

  usageCount += 1
  try {
    const raw = await generateText({
      system,
      user: userPrompt,
      maxOutputTokens: 35,
      temperature: 0.85,
    })
    return raw
      .replace(/^["']|["']$/g, '')
      .replace(/^[A-Za-z]+:\s*/, '')
      .trim()
  } catch {
    return ''
  }
}
