import type { AgentPreview } from '@hive/shared'
import { generateJson, parseTaskResult } from './gemini'
import {
  completedTasksFor,
  createTask,
  finishTask,
  getAgent,
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
 */
export async function runAgentTask(agentId: string, prompt: string): Promise<RunTaskResult> {
  const agent = getAgent(agentId)
  if (!agent) throw new TaskError(404, 'Unknown agent.')

  if (running.has(agentId)) {
    throw new TaskError(409, `${agent.name} is already working on a task.`)
  }

  rollUsageDay()
  const limit = dailyLimit()
  if (usageCount >= limit) {
    throw new TaskError(429, `Daily Gemini limit reached (${limit} requests). Try again tomorrow.`)
  }

  const task = createTask(agentId, prompt)
  running.add(agentId)
  usageCount += 1
  agent.activity = 'working'

  try {
    const raw = await generateJson({
      system: buildSystemPrompt(agent),
      user: buildUserPrompt(agent, prompt),
      maxOutputTokens: 420,
    })

    const parsed = parseTaskResult(raw)
    finishTask(task, 'done', parsed.result)
    if (parsed.lesson) rememberLesson(agent, parsed.lesson)
    rememberLastTask(agent, {
      prompt,
      result: parsed.result,
      status: 'done',
      at: task.finishedAt ?? Date.now(),
    })

    return { task, agent }
  } catch (error) {
    finishTask(task, 'failed', null)
    rememberLastTask(agent, {
      prompt,
      result: null,
      status: 'failed',
      at: task.finishedAt ?? Date.now(),
    })
    throw error
  } finally {
    running.delete(agentId)
    agent.activity = 'idle'
  }
}
