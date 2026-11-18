import type { AgentPreview, LastTask, Task } from '@hive/shared'
import { STARTER_AGENTS } from './agents/personas'

/**
 * In-memory store, shaped to drop straight into SQLite at build step 8.
 *
 * Everything here is process-local: restart the server and lessons are gone
 * again. That is intentional until the persistence step lands.
 */

const agents = new Map<string, AgentPreview>(
  STARTER_AGENTS.map((agent) => [agent.id, structuredClone(agent)]),
)

const tasks: Task[] = []
let nextTaskId = 1

export function listAgents(): AgentPreview[] {
  return [...agents.values()]
}

export function getAgent(agentId: string): AgentPreview | undefined {
  return agents.get(agentId)
}

export function createTask(agentId: string, prompt: string): Task {
  const task: Task = {
    id: nextTaskId,
    agentId,
    prompt,
    result: null,
    status: 'queued',
    createdAt: Date.now(),
    finishedAt: null,
  }
  nextTaskId += 1
  tasks.push(task)
  return task
}

/** Most recent completed tasks for an agent, oldest first (prompt context). */
export function completedTasksFor(agentId: string, limit: number): Task[] {
  return tasks
    .filter((task) => task.agentId === agentId && task.status === 'done')
    .slice(-limit)
}

export function finishTask(task: Task, status: 'done' | 'failed', result: string | null): void {
  task.status = status
  task.result = result
  task.finishedAt = Date.now()
}

/** Keep a bounded memory: newest last, oldest evicted. */
export function rememberLesson(agent: AgentPreview, text: string): void {
  const cap = 12
  agent.lessons = [...agent.lessons, text].slice(-cap)
}

export function rememberLastTask(agent: AgentPreview, lastTask: LastTask): void {
  agent.lastTask = lastTask
}
