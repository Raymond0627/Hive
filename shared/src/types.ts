/**
 * Wire types shared by the Hive client and server.
 *
 * The server is the source of truth: it owns the simulation, the database and
 * the Gemini calls. The browser only renders snapshots and sends intents.
 *
 * Coordinates are grid coordinates on the simulation map (`x`, `y`), not
 * three.js world units. The client maps them to the scene.
 */

/** What an agent is doing right now. Drives the status pill and the default 3D pose. */
export type AgentActivity = 'idle' | 'walking' | 'working' | 'eating' | 'gym'

/**
 * Which procedural animation the client should play. Chosen by the server from
 * the activity plus the furniture slot being used, so the client never guesses.
 *
 * The character is Minecraft-style: a rigid body with straight limbs that only
 * rotate at the hip and shoulder, so every pose below is built from whole-body
 * motion plus four rigid limbs.
 */
export type AgentAnimation =
  | 'idle'
  | 'walk'
  | 'run'
  | 'type'
  | 'eat'
  | 'drink'
  | 'cook'
  | 'lift'
  | 'pushups'
  | 'jacks'
  | 'stretch'
  | 'rest'
  | 'play'
  | 'talk'
  | 'wave'
  | 'celebrate'
  | 'frustrated'

/** Personality traits influencing needs decay, behavior and break habits (P3.1). */
export type AgentTrait = 'sociable' | 'workaholic' | 'gym_lover' | 'foodie' | 'introvert'

/** Dynamic inner needs from 0 to 100, restored by matching activities (P3.1). */
export interface AgentNeeds {
  energy: number
  hunger: number
  social: number
  fun: number
}

/** Directed relationship record between colleagues with affinity score (P3.2). */
export interface Relationship {
  otherId: string
  /** -100 (hostile/cold) to +100 (best friends). */
  affinity: number
  lastTalk?: number
  note?: string
}

/** What kind of furniture slot an agent can occupy. */
export type SlotType =
  | 'sit_work'
  | 'sit_eat'
  | 'sit_meet'
  | 'drink'
  | 'cook'
  | 'lift'
  | 'run'
  | 'pushups'
  | 'jacks'
  | 'stretch'
  | 'rest'
  | 'play'

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
  /** Behavioural traits influencing needs and breaks (P3.1). */
  traits?: AgentTrait[]
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

/** One scheduled block in an agent's daily plan (P1.2). */
export interface PlanBlock {
  id: string
  label: string
  /** Minutes from midnight, e.g. 540 = 9:00 AM, 720 = 12:00 PM */
  startMinute: number
  endMinute: number
  activity: AgentActivity
  slotType?: SlotType
  done: boolean
}

export interface ChatMessage {
  id: string
  agentId: string
  from: 'user' | 'agent'
  text: string
  createdAt: number
}

export interface ConversationTurn {
  speakerId: string
  speakerName: string
  text: string
  at: number
}

export interface ActiveConversation {
  id: string
  agentA: string
  agentB: string
  turns: ConversationTurn[]
  state: 'greeting' | 'reacting' | 'exchanging' | 'wrapping_up' | 'ending'
  startedAt: number
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
  plan?: PlanBlock[]
  /** Dynamic inner needs from 0 to 100 (P3.1). */
  needs?: AgentNeeds
  traits?: AgentTrait[]
  /** 1-line relationship notes with colleagues (P2.3). */
  relationships?: Record<string, string>
  /** Detailed relationship affinity and notes (P3.2). */
  relationshipsDetailed?: Record<string, Relationship>
  /** In-character direct chat history (P2.3). */
  chatHistory?: ChatMessage[]
}

/** Per-tick mutable state of an agent. */
export interface AgentState {
  agentId: string
  activity: AgentActivity
  /** Procedural animation the client should play. */
  animation: AgentAnimation
  x: number
  y: number
  targetX: number
  targetY: number
  /** Radians, three.js yaw. */
  facing: number
  /** Furniture slot in use, e.g. `desk-meow` or `dine-2`. */
  slotId: string | null
  /** Current destination cell, for inspector & debug overlay. */
  goal: { x: number; y: number } | null
  /** Next path steps, for debug overlay. */
  path?: Array<{ x: number; y: number }>
  /** Daily schedule blocks (P1.2) */
  plan?: PlanBlock[]
  /** Dynamic inner needs from 0 to 100 (P3.1). */
  needs?: AgentNeeds
  traits?: AgentTrait[]
  /** Ambient line currently shown in a speech bubble, if any. */
  speech: string | null
  /** Conversational partner ID, e.g. 'gugel' or 'user' (P2.2/P2.3). */
  talkingWith?: string | null
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
  | {
      type: 'world_snapshot'
      agents: AgentSnapshot[]
      timeScale?: number
      /** Simulated minutes from midnight, 0-1440. */
      clock?: number
    }
  | {
      type: 'agent_update'
      agentId: string
      x: number
      y: number
      activity: AgentActivity
      animation: AgentAnimation
      facing: number
      slotId: string | null
      goal?: { x: number; y: number } | null
      path?: Array<{ x: number; y: number }>
      plan?: PlanBlock[]
      needs?: AgentNeeds
      speech: string | null
      talkingWith?: string | null
      mood: string
      /** Simulated minutes from midnight, so the panel can highlight the plan. */
      clock?: number
    }
  | {
      type: 'task_update'
      task: Task
      /** Lessons added by this task, if any. */
      lessons: Lesson[]
    }
  | {
      type: 'chat_message'
      agentId: string
      message: ChatMessage
    }
  | {
      type: 'conversation_update'
      conversation: ActiveConversation | null
    }
  | { type: 'sim_speed'; speed: number }
  | { type: 'error'; message: string }

export type ClientMessage =
  | { type: 'drag_agent'; agentId: string; x: number; y: number }
  | { type: 'send_task'; agentId: string; prompt: string }
  | { type: 'send_chat'; agentId: string; text: string }
  | { type: 'toggle_conversations'; enabled: boolean }
  | { type: 'update_appearance'; agentId: string; appearance: Appearance }
  | { type: 'select_agent'; agentId: string | null }
  | { type: 'set_speed'; speed: number }

export type ServerMessageType = ServerMessage['type']
export type ClientMessageType = ClientMessage['type']
