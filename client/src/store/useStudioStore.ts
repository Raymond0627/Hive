import { create } from 'zustand'
import type { AgentPreview, Task } from '@hive/shared'

type BackendStatus = 'connecting' | 'online' | 'offline'

interface TaskResponse {
  task: Task
  agent: AgentPreview
}

interface StudioState {
  agents: AgentPreview[]
  selectedAgentId: string | null
  backend: BackendStatus
  loading: boolean

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
}

export const useStudioStore = create<StudioState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  backend: 'connecting',
  loading: false,
  sendingTaskFor: null,
  taskError: null,

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
}))
