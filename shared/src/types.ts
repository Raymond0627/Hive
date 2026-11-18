/**
 * Wire types shared by the Hive client and server.
 *
 * The server is the source of truth: it owns the simulation, the database and
 * the Gemini calls. The browser only renders snapshots and sends intents.
 *
 * Coordinates are grid coordinates on the simulation map (`x`, `y`), not
 * three.js world units. The client maps them to the scene.
 */

/** What an agent is doing right now. Drives animation and the status pill. */
export type AgentActivity = 'idle' | 'walking' | 'working' | 'eating' | 'gym'

/** Lifecycle of a Gemini task. */
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed'

/** Voxel colours. Plain hex strings so the DB can store one JSON blob. */
export interface Appearance {
  skin: string
  hair: string
  shirt: string
  pants: string
  shoes: string
}

/** Immutable-ish identity + defaults for an agent. */
export interface Agent {
  id: string
  name: string
  role: string
  /** One paragraph. Becomes part of the Gemini system instruction. */
  personality: string
  /** Behavioural guardrails, e.g. "You are read-only." */
  rules: string
  appearance: Appearance
  /** Desk cell on the simulation grid. */
  desk: { x: number; y: number }
}

/**
 * The most recent task an agent ran, denormalised for the side panel.
 */
export interface LastTask {
  prompt: string
  result: string | null
  status: TaskStatus
  /** Epoch ms when the task finished. */
  at: number
}

/**
 * Agent + a little read-only context, used by `GET /api/agents` before the
 * simulation owns live state. `lessons` are seed memories, newest last.
 */
export interface AgentPreview extends Agent {
  activity: AgentActivity
  mood: string
  lessons: string[]
  lastTask: LastTask | null
}

/** Per-tick mutable state of an agent. */
export interface AgentState {
  agentId: string
  activity: AgentActivity
  x: number
  y: number
  targetX: number
  targetY: number
  /** Epoch ms. When the current activity is scheduled to end. */
  activityUntil: number
  mood: string
}

export interface AgentSnapshot extends Agent, Omit<AgentState, 'agentId'> {}

export interface Task {
  id: number
  agentId: string
  prompt: string
  result: string | null
  status: TaskStatus
  createdAt: number
  finishedAt: number | null
}

export interface Lesson {
  id: number
  agentId: string
  text: string
  createdAt: number
}

/** Structured payload we ask Gemini to return for every task. */
export interface GeminiTaskResult {
  result: string
  lesson: string | null
}

// ── WebSocket protocol ─────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'world_snapshot'; agents: AgentSnapshot[] }
  | {
      type: 'agent_update'
      agentId: string
      x: number
      y: number
      activity: AgentActivity
      mood: string
    }
  | {
      type: 'task_update'
      task: Task
      /** Lessons added by this task, if any. */
      lessons: Lesson[]
    }
  | { type: 'error'; message: string }

export type ClientMessage =
  | { type: 'drag_agent'; agentId: string; x: number; y: number }
  | { type: 'send_task'; agentId: string; prompt: string }
  | { type: 'update_appearance'; agentId: string; appearance: Appearance }
  | { type: 'select_agent'; agentId: string | null }

export type ServerMessageType = ServerMessage['type']
export type ClientMessageType = ClientMessage['type']
