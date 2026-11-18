import { create } from 'zustand'
import type { AgentActivity, AgentPreview, ServerMessage, Task } from '@hive/shared'

type BackendStatus = 'connecting' | 'online' | 'offline'

export interface LiveAgent {
  x: number
  y: number
  activity: AgentActivity
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
  setDragging: (id: string | null) => void

  /** Agent id with a Gemini call in flight, if any. */
  sendingTaskFor: string | null
  /** Last task error, shown in the panel until the next attempt. */
  taskError: string | null

  /** Fetch the starter agents; safe to call repeatedly (retry loop). */
  loadAgents: () => Promise<void>
  selectAgent: (id: string | null) => void
  /** Step 9: ask the server to run a task. Returns true on success. */
  sendTask: (agentId: string, prompt: string) => Promise<boolean>
  clearTaskError: () => void
  setSocket: (status: BackendStatus) => void
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

  setDragging: (id) => set({ draggingId: id }),

  applyServerMessage: (message) => {
    if (message.type === 'world_snapshot') {
      const live: Record<string, LiveAgent> = {}
      for (const agent of message.agents) {
        live[agent.id] = {
          x: agent.x,
          y: agent.y,
          activity: agent.activity,
          mood: agent.mood,
        }
      }
      set((state) => ({
        live,
        agents: state.agents.map((agent) => {
          const current = live[agent.id]
          return current
            ? { ...agent, activity: current.activity, mood: current.mood }
            : agent
        }),
      }))
      return
    }

    if (message.type === 'agent_update') {
      set((state) => {
        const changed = state.agents.some(
          (agent) =>
            agent.id === message.agentId &&
            (agent.activity !== message.activity || agent.mood !== message.mood),
        )
        return {
          live: {
            ...state.live,
            [message.agentId]: {
              x: message.x,
              y: message.y,
              activity: message.activity,
              mood: message.mood,
            },
          },
          agents: changed
            ? state.agents.map((agent) =>
                agent.id === message.agentId
                  ? { ...agent, activity: message.activity, mood: message.mood }
                  : agent,
              )
            : state.agents,
        }
      })
    }
  },
}))
