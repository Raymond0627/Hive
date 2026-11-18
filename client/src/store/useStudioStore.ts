import { create } from 'zustand'
import type {
  ActiveConversation,
  AgentActivity,
  AgentAnimation,
  AgentNeeds,
  AgentPreview,
  AgentTrait,
  ChatMessage,
  PlanBlock,
  Relationship,
  ServerMessage,
  Task,
} from '@hive/shared'

type BackendStatus = 'connecting' | 'online' | 'offline'

export interface LiveAgent {
  x: number
  y: number
  activity: AgentActivity
  animation: AgentAnimation
  /** Three.js yaw in radians. */
  facing: number
  /** Furniture slot in use, if any. */
  slotId: string | null
  goal?: { x: number; y: number } | null
  path?: Array<{ x: number; y: number }>
  /** Daily schedule blocks (P1.2). */
  plan?: PlanBlock[]
  /** Dynamic inner needs 0-100 (P3.1). */
  needs?: AgentNeeds
  traits?: AgentTrait[]
  /** Ambient line shown in a speech bubble, if any. */
  speech: string | null
  talkingWith?: string | null
  mood: string
}

interface TaskResponse {
  task: Task
  agent: AgentPreview
}

interface StudioState {
  agents: AgentPreview[]
  selectedAgentId: string | null
  backend: BackendStatus
  loading: boolean

  /** Live simulation state, keyed by agent id. */
  live: Record<string, LiveAgent>
  socket: BackendStatus
  /** Agent currently being dragged, if any. */
  draggingId: string | null
  /** Where the pointer is while dragging: world metres + the grid cell under it. */
  dragTarget: { x: number; z: number; gx: number; gy: number; valid: boolean } | null
  setDragging: (id: string | null) => void
  setDragTarget: (target: StudioState['dragTarget']) => void

  /** Agent id with a Gemini call in flight, if any. */
  sendingTaskFor: string | null
  /** Last task error, shown in the panel until the next attempt. */
  taskError: string | null

  /** Direct chat messages keyed by agent ID (P2.3). */
  chatMessages: Record<string, ChatMessage[]>
  chatSending: boolean
  sendDirectChat: (agentId: string, message: string) => Promise<boolean>
  loadChatHistory: (agentId: string) => Promise<void>

  /** Obsidian Second Brain notes (P3). */
  vaultNotes: Record<string, { content: string; vaultPath: string }>
  loadVaultNote: (agentId: string) => Promise<void>

  /** Detailed colleague relationships (P3.2). */
  relationshipsDetailed: Record<string, Record<string, Relationship>>
  loadRelationships: (agentId: string) => Promise<void>

  /** Active two-way conversation between agents (P2.2). */
  activeConversation: ActiveConversation | null
  conversationsEnabled: boolean
  toggleConversations: () => void

  /** Fetch the starter agents; safe to call repeatedly (retry loop). */
  loadAgents: () => Promise<void>
  selectAgent: (id: string | null) => void
  /** Step 9: ask the server to run a task. Returns true on success. */
  sendTask: (agentId: string, prompt: string) => Promise<boolean>
  clearTaskError: () => void
  setSocket: (status: BackendStatus) => void

  /** Simulation speed: 0 (paused), 1 (normal), 5, 20 */
  timeScale: number
  setTimeScale: (scale: number) => void

  /** Simulated time of day in minutes (0-1440). */
  clock: number

  /** 3D Debug overlay toggle (grid, blocked cells, paths, slots) */
  debugOverlay: boolean
  toggleDebugOverlay: () => void
  debugMap: {
    blocked: Array<[number, number]>
    slots: Array<{
      id: string
      type: string
      stand: { x: number; y: number }
      facing: number
      activity: string
    }>
  } | null
  loadDebugMap: () => Promise<void>

  applyServerMessage: (message: ServerMessage) => void
}

export const useStudioStore = create<StudioState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  backend: 'connecting',
  loading: false,
  sendingTaskFor: null,
  taskError: null,
  live: {},
  socket: 'connecting',
  draggingId: null,
  dragTarget: null,
  timeScale: 1,
  clock: 11 * 60 + 30,
  debugOverlay: false,
  debugMap: null,
  chatMessages: {},
  chatSending: false,
  activeConversation: null,
  conversationsEnabled: true,
  vaultNotes: {},
  relationshipsDetailed: {},

  loadVaultNote: async (agentId: string) => {
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(agentId)}`)
      if (!res.ok) return
      const data = (await res.json()) as { content: string; vaultPath: string }
      set((state) => ({
        vaultNotes: {
          ...state.vaultNotes,
          [agentId]: data,
        },
      }))
    } catch {
      // ignore
    }
  },

  loadRelationships: async (agentId: string) => {
    try {
      const res = await fetch(`/api/relationships/${encodeURIComponent(agentId)}`)
      if (!res.ok) return
      const data = (await res.json()) as { relationships: Record<string, Relationship> }
      set((state) => ({
        relationshipsDetailed: {
          ...state.relationshipsDetailed,
          [agentId]: data.relationships ?? {},
        },
      }))
    } catch {
      // ignore
    }
  },

  toggleConversations: () => {
    const next = !get().conversationsEnabled
    set({ conversationsEnabled: next })
    void fetch('/api/conversations/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
  },

  loadChatHistory: async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/chat`)
      if (!res.ok) return
      const data = (await res.json()) as { history: ChatMessage[]; relationships: Record<string, string> }
      set((state) => ({
        chatMessages: {
          ...state.chatMessages,
          [agentId]: data.history ?? [],
        },
        agents: state.agents.map((a) =>
          a.id === agentId ? { ...a, relationships: data.relationships ?? a.relationships } : a,
        ),
      }))
    } catch {
      // ignore
    }
  },

  sendDirectChat: async (agentId: string, message: string) => {
    if (!message.trim() || get().chatSending) return false
    set({ chatSending: true })
    const pendingMsg: ChatMessage = {
      id: `pending-${Date.now()}`,
      agentId,
      from: 'user',
      text: message.trim(),
      createdAt: Date.now(),
    }
    set((state) => ({
      chatMessages: {
        ...state.chatMessages,
        [agentId]: [...(state.chatMessages[agentId] ?? []), pendingMsg],
      },
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, message }),
      })
      if (!res.ok) {
        set({ chatSending: false })
        return false
      }
      const data = (await res.json()) as { userMsg: ChatMessage; agentMsg: ChatMessage }
      set((state) => {
        const history = (state.chatMessages[agentId] ?? []).filter((m) => m.id !== pendingMsg.id)
        return {
          chatSending: false,
          chatMessages: {
            ...state.chatMessages,
            [agentId]: [...history, data.userMsg, data.agentMsg],
          },
        }
      })
      return true
    } catch {
      set({ chatSending: false })
      return false
    }
  },

  setTimeScale: (scale: number) => {
    set({ timeScale: scale })
  },

  toggleDebugOverlay: () => {
    const next = !get().debugOverlay
    set({ debugOverlay: next })
    if (next && !get().debugMap) {
      void get().loadDebugMap()
    }
  },

  loadDebugMap: async () => {
    try {
      const res = await fetch('/api/debug/map')
      if (!res.ok) return
      const data = (await res.json()) as StudioState['debugMap']
      set({ debugMap: data })
    } catch {
      // Ignore
    }
  },

  loadAgents: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error(`GET /api/agents -> ${res.status}`)
      const data = (await res.json()) as { agents: AgentPreview[] }
      set({ agents: data.agents, backend: 'online', loading: false })
    } catch {
      set({ backend: 'offline', loading: false })
    }
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  sendTask: async (agentId, prompt) => {
    if (get().sendingTaskFor) return false
    set({ sendingTaskFor: agentId, taskError: null })
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, prompt }),
      })
      const data = (await res.json().catch(() => null)) as
        | TaskResponse
        | { error?: string }
        | null

      if (!res.ok) {
        const message =
          data && 'error' in data && typeof data.error === 'string'
            ? data.error
            : `The task failed (HTTP ${res.status}).`
        set({ sendingTaskFor: null, taskError: message })
        return false
      }

      const updated = data as TaskResponse
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === updated.agent.id ? updated.agent : agent,
        ),
        sendingTaskFor: null,
        taskError: null,
      }))
      return true
    } catch {
      set({
        sendingTaskFor: null,
        taskError: 'Could not reach the engine. Is the server running?',
      })
      return false
    }
  },

  clearTaskError: () => set({ taskError: null }),

  setSocket: (status) => set({ socket: status }),

  setDragging: (id) => set({ draggingId: id, dragTarget: id ? get().dragTarget : null }),
  setDragTarget: (target) => set({ dragTarget: target }),

  applyServerMessage: (message) => {
    if (message.type === 'world_snapshot') {
      const live: Record<string, LiveAgent> = {}
      for (const agent of message.agents) {
        live[agent.id] = {
          x: agent.x,
          y: agent.y,
          activity: agent.activity,
          animation: agent.animation,
          facing: agent.facing,
          slotId: agent.slotId,
          goal: agent.goal,
          path: agent.path,
          plan: agent.plan,
          needs: agent.needs,
          traits: agent.traits,
          speech: agent.speech,
          talkingWith: agent.talkingWith,
          mood: agent.mood,
        }
      }
      set((state) => ({
        live,
        timeScale: message.timeScale ?? state.timeScale,
        clock: message.clock ?? state.clock,
        agents: state.agents.map((agent) => {
          const current = live[agent.id]
          return current
            ? {
                ...agent,
                activity: current.activity,
                mood: current.mood,
                plan: current.plan ?? agent.plan,
                needs: current.needs ?? agent.needs,
                traits: current.traits ?? agent.traits,
              }
            : agent
        }),
      }))
      return
    }

    if (message.type === 'agent_update') {
      set((state) => {
        const nextLive: LiveAgent = {
          x: message.x,
          y: message.y,
          activity: message.activity,
          animation: message.animation,
          facing: message.facing,
          slotId: message.slotId,
          goal: message.goal,
          path: message.path,
          plan: message.plan ?? state.live[message.agentId]?.plan,
          needs: message.needs ?? state.live[message.agentId]?.needs,
          traits: state.live[message.agentId]?.traits,
          speech: message.speech,
          talkingWith: message.talkingWith ?? state.live[message.agentId]?.talkingWith,
          mood: message.mood,
        }
        return {
          clock: message.clock ?? state.clock,
          live: {
            ...state.live,
            [message.agentId]: nextLive,
          },
          agents: state.agents.map((agent) =>
            agent.id === message.agentId
              ? {
                  ...agent,
                  activity: message.activity,
                  mood: message.mood,
                  plan: message.plan ?? agent.plan,
                  needs: message.needs ?? agent.needs,
                }
              : agent,
          ),
        }
      })
      return
    }

    if (message.type === 'chat_message') {
      const history = get().chatMessages[message.agentId] ?? []
      if (!history.some((m) => m.id === message.message.id)) {
        set((state) => ({
          chatMessages: {
            ...state.chatMessages,
            [message.agentId]: [...history, message.message],
          },
        }))
      }
      return
    }

    if (message.type === 'conversation_update') {
      set({ activeConversation: message.conversation })
      return
    }

    if (message.type === 'sim_speed') {
      set({ timeScale: message.speed })
    }
  },
}))

// Dev-only handle so the scene can be inspected from the console.
;(window as unknown as { __hiveStore?: typeof useStudioStore }).__hiveStore = useStudioStore