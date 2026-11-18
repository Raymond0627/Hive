import { type Cell } from './map'

export type Activity = 'idle' | 'walking' | 'working' | 'eating' | 'gym'

export interface SimState {
  id: string
  x: number
  y: number
  path: Cell[]
  activity: Activity
  activityUntil: number
  mood: string
  jitter: number
  busy: boolean
}

export const agents = new Map<string, SimState>()
export let clock = 11 * 60 + 30

export const minutesPerSecond = () => Number(process.env.SIM_MINUTES_PER_SECOND ?? 4)

export const clockLabel = () => {
  const m = Math.floor(clock % 1440)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export const getSim = (id: string) => agents.get(id)
export const allSims = () => [...agents.values()]
export const advanceClock = (seconds: number) => {
  clock = (clock + seconds * minutesPerSecond()) % 1440
}
