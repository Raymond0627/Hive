import { DESKS, type Cell, nearestWalkable, randomCellIn } from './map'
import { findPath } from './pathfinding'
import { advanceClock, agents, clock, minutesPerSecond, type Activity, type SimState } from './state'

const SPEED = 3.2
const MOODS: Record<Activity, string[]> = {
  idle: ['restless', 'curious', 'steady'],
  walking: ['focused', 'busy'],
  working: ['focused', 'in the zone', 'determined'],
  eating: ['content', 'recharged'],
  gym: ['energised', 'sweaty'],
}
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

export function addAgent(id: string, start: Cell): SimState {
  const state: SimState = {
    id,
    x: start.x,
    y: start.y,
    path: [],
    activity: 'idle',
    activityUntil: 0,
    mood: pick(MOODS.idle),
    jitter: Math.floor(Math.random() * 40) - 20,
    busy: false,
  }
  agents.set(id, state)
  return state
}

/** Where this agent should be right now, from the daily schedule. */
function destination(state: SimState): { cell: Cell; activity: Activity; minutes: number } {
  const desk = DESKS[state.id]
  if (state.busy && desk) return { cell: desk.workSpot, activity: 'working', minutes: 40 }

  const minute = (clock + state.jitter + 1440) % 1440
  if (minute >= 720 && minute < 780) {
    return { cell: nearestWalkable({ x: 10, y: 31 }), activity: 'eating', minutes: 35 }
  }
  if (minute >= 900 && minute < 930) {
    return { cell: randomCellIn('gym'), activity: 'gym', minutes: 30 }
  }
  const coffee = (minute >= 600 && minute < 630) || (minute >= 840 && minute < 870)
  if (coffee) {
    return { cell: randomCellIn('pantry'), activity: 'idle', minutes: 15 }
  }  if (minute >= 540 && minute < 1020) {
    return { cell: desk?.workSpot ?? randomCellIn('work'), activity: 'working', minutes: 45 }
  }
  return { cell: randomCellIn('work'), activity: 'idle', minutes: 20 }
}

function goTo(state: SimState, target: Cell): void {
  const path = findPath(nearestWalkable({ x: Math.round(state.x), y: Math.round(state.y) }), nearestWalkable(target))
  if (path && path.length > 1) {
    state.path = path.slice(1)
    state.activity = 'walking'
    state.mood = pick(MOODS.walking)
  }
}

export function beginTask(id: string): void {
  const state = agents.get(id)
  if (!state) return
  state.busy = true
  state.path = []
  state.activityUntil = 0
}

export function endTask(id: string): void {
  const state = agents.get(id)
  if (!state) return
  state.busy = false
  state.activityUntil = 0
}

export function step(dtSeconds: number, now = Date.now()): void {
  advanceClock(dtSeconds)
  for (const state of agents.values()) {
    if (state.path.length > 0) {
      const next = state.path[0]
      const dx = next.x - state.x
      const dy = next.y - state.y
      const distance = Math.hypot(dx, dy)
      const move = SPEED * dtSeconds
      if (distance <= move) {
        state.x = next.x
        state.y = next.y
        state.path.shift()
      } else {
        state.x += (dx / distance) * move
        state.y += (dy / distance) * move
      }
      continue
    }
    if (now < state.activityUntil) continue
    const target = destination(state)
    const atTarget =
      Math.round(state.x) === target.cell.x && Math.round(state.y) === target.cell.y
    if (atTarget) {
      state.activity = target.activity
      state.activityUntil = now + (target.minutes / minutesPerSecond()) * 1000
    } else {
      goTo(state, target.cell)
      state.activityUntil = now + 10_000
    }
  }
}
