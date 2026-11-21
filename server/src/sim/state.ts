import type { AgentActivity, AgentAnimation, AgentNeeds, AgentTrait, PlanBlock } from '@hive/shared'
import type { Cell } from './layout'

/** Live per-agent simulation state. The server owns all of this. */
export interface SimState {
  id: string
  x: number
  y: number
  path: Cell[]
  activity: AgentActivity
  /** Pose the client should play, derived from activity + slot. */
  animation: AgentAnimation
  /** Three.js yaw in radians; the client smooths toward it. */
  facing: number
  /** Furniture slot currently in use or walked toward. */
  slotId: string | null
  /** Cell the agent is next heading for, kept for the panel + debug overlay. */
  goal: Cell | null
  /** Daily schedule blocks with completion checkmarks (P1.2). */
  plan: PlanBlock[]
  /** Sim day the plan was generated for; a change triggers a fresh plan. */
  planDay: number
  /** Dynamic inner needs 0-100 (P3.1). */
  needs: AgentNeeds
  /** Personality traits (P3.1). */
  traits: AgentTrait[]
  /** Text for the current speech bubble, cleared when stale. */
  speech: string | null
  speechUntil: number
  /** Agent or user currently in conversation with. */
  talkingWith: string | null
  activityUntil: number
  mood: string
  jitter: number
  busy: boolean
  /** How long the agent has been blocked by another body, in ms. */
  waitingSince: number
  /** Last time it replanned, to cap replans. */
  lastReplan: number
}

export const agents = new Map<string, SimState>()
export let clock = 11 * 60 + 30
/** Completed sim days. Plans regenerate whenever this increments. */
export let simDay = 0
export let timeScale = 1
export const setTimeScale = (scale: number) => {
  timeScale = Math.max(0, Math.min(50, Number(scale) || 0))
}
export const getTimeScale = () => timeScale

export const minutesPerSecond = () => Number(process.env.SIM_MINUTES_PER_SECOND ?? 2) * (timeScale === 0 ? 0 : timeScale)

export const clockLabel = () => {
  const m = Math.floor(clock % 1440)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const getSim = (id: string) => agents.get(id)
export const allSims = () => [...agents.values()]
export const advanceClock = (seconds: number) => {
  const next = clock + seconds * minutesPerSecond()
  if (next >= 1440) {
    simDay += Math.floor(next / 1440)
  }
  clock = next % 1440
}

/** Simulated minutes -> wall-clock milliseconds. */
export const minutesToMs = (minutes: number) => (minutes / minutesPerSecond()) * 1000
