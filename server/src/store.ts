import type { AgentPreview, ChatMessage, LastTask, Task } from '@hive/shared'
import { ROSTER } from './agents/roster'
import { DESKS } from '@hive/shared'
import { db } from './db'
import {
  ensureAgentRows,
  insertLesson,
  insertTask,
  loadAppearances,
  loadLessons,
  loadNeeds,
  loadPlans,
  loadTasks,
  loadTraits,
  saveAppearance,
  updateTask,
} from './persistence'

/**
 * Store with in-memory fast access and SQLite backing.
 */

const ROSTER_AGENTS: AgentPreview[] = ROSTER.map((agent) => {
  const desk = DESKS[agent.id] ?? { desk: { x: 2, y: 2 }, workSpot: { x: 2, y: 3 } }
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    personality: agent.personality,
    rules: agent.rules,
    appearance: agent.appearance,
    desk: desk.desk,
    activity: agent.status === 'sleeping' ? 'idle' : 'idle',
    mood: agent.status === 'sleeping' ? 'sleeping' : 'steady',
    traits: [],
    needs: { energy: 80, hunger: 70, social: 60, fun: 70 },
    lessons: [],
    lastTask: null,
    status: agent.status,
    pendingDesk: !DESKS[agent.id],
    roleNote: agent.role === 'Producer' ? 'mostly code' : undefined,
  }
})

const agents = new Map<string, AgentPreview>(
  ROSTER_AGENTS.map((agent) => [
    agent.id,
    {
      ...structuredClone(agent),
      relationships: {},
      chatHistory: [],
    },
  ]),
)

const tasks: Task[] = []
let nextTaskId = 1

// Hydrate SQLite into memory on boot (step 8). The database is the long-term
// memory: identities/appearance, task history, lessons, positions, chats.
try {
  ensureAgentRows(ROSTER_AGENTS)

  for (const [id, appearance] of loadAppearances()) {
    const agent = agents.get(id)
    if (agent) agent.appearance = appearance
  }

  const storedNeeds = loadNeeds()
  for (const [id, needs] of storedNeeds) {
    const agent = agents.get(id)
    if (agent) agent.needs = needs
  }

  const storedTraits = loadTraits()
  for (const [id, traits] of storedTraits) {
    const agent = agents.get(id)
    if (agent && Array.isArray(traits) && traits.length > 0) agent.traits = traits as AgentPreview['traits']
  }

  for (const lesson of loadLessons()) {
    const agent = agents.get(lesson.agentId)
    if (!agent || agent.lessons.includes(lesson.text)) continue
    agent.lessons = [...agent.lessons, lesson.text].slice(-12)
  }

  const storedTasks = loadTasks()
  tasks.push(...storedTasks)
  nextTaskId = storedTasks.reduce((max, task) => Math.max(max, task.id), 0) + 1

  const relRows = db
    .prepare('SELECT agent_id, other_id, note FROM relationships')
    .all() as Array<{ agent_id: string; other_id: string; note: string }>
  for (const row of relRows) {
    const a = agents.get(row.agent_id)
    if (a) {
      a.relationships ||= {}
      a.relationships[row.other_id] = row.note
    }
  }

  const chatRows = db
    .prepare(
      'SELECT id, agent_id, sender, text, created_at FROM direct_chats ORDER BY created_at ASC',
    )
    .all() as Array<{
    id: string
    agent_id: string
    sender: 'user' | 'agent'
    text: string
    created_at: number
  }>
  for (const row of chatRows) {
    const a = agents.get(row.agent_id)
    if (a) {
      a.chatHistory ||= []
      a.chatHistory.push({
        id: row.id,
        agentId: row.agent_id,
        from: row.sender,
        text: row.text,
        createdAt: row.created_at,
      })
    }
  }
} catch {
  // DB hydration is optional on fresh starts
}

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
  insertTask(task)
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
  updateTask(task)
}

/** Keep a bounded memory: newest last, oldest evicted. Writes through to SQLite. */
export function rememberLesson(agent: AgentPreview, text: string): void {
  const cap = 12
  agent.lessons = [...agent.lessons, text].slice(-cap)
  insertLesson(agent.id, text, Date.now())
}

/** Customizer write-through: the model, the panel and the database agree. */
export function setAgentAppearance(agentId: string, appearance: AgentPreview['appearance']): boolean {
  const agent = agents.get(agentId)
  if (!agent) return false
  agent.appearance = appearance
  saveAppearance(agentId, appearance)
  return true
}

export function rememberLastTask(agent: AgentPreview, lastTask: LastTask): void {
  agent.lastTask = lastTask
}

export function rememberRelationshipNote(agentId: string, otherId: string, note: string): void {
  const agent = agents.get(agentId)
  if (agent) {
    agent.relationships ||= {}
    agent.relationships[otherId] = note
  }
  try {
    db.prepare(
      `INSERT INTO relationships (agent_id, other_id, note, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(agent_id, other_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    ).run(agentId, otherId, note, Date.now())
  } catch {
    // ignore
  }
}

export function getRelationshipNotes(agentId: string): Record<string, string> {
  return agents.get(agentId)?.relationships ?? {}
}

export function addChatMessage(
  agentId: string,
  from: 'user' | 'agent',
  text: string,
): ChatMessage {
  const message: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agentId,
    from,
    text,
    createdAt: Date.now(),
  }
  const agent = agents.get(agentId)
  if (agent) {
    agent.chatHistory ||= []
    agent.chatHistory.push(message)
    if (agent.chatHistory.length > 50) agent.chatHistory.shift()
  }
  try {
    db.prepare(
      `INSERT INTO direct_chats (id, agent_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(message.id, message.agentId, message.from, message.text, message.createdAt)
  } catch {
    // ignore
  }
  return message
}

export function getChatHistory(agentId: string): ChatMessage[] {
  return agents.get(agentId)?.chatHistory ?? []
}
