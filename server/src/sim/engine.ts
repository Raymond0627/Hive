/**
 * The simulation brain. Runs at 10 Hz on the server and owns every decision:
 *
 *  - what each agent wants to do (schedule + tasks + furniture),
 *  - where it walks (A* with soft avoidance of other agents),
 *  - when it sits down, uses an object, and stands up again,
 *  - which ambient line it says.
 *
 * The client only renders the state this file produces. No AI calls here.
 */
import type { AgentActivity, AgentAnimation } from '@hive/shared'
import { getAgent } from '../store'
import {
  tickNeeds,
  deriveMood,
  scoreNeedUrgency,
  createDefaultNeeds,
} from './needs'
import { maybeInviteColleague } from './relationships'
import { syncAgentToVault } from '../vault'
import { lineOrEmoteFor, BUBBLE_MS } from './barks'
import { updateConversations } from './conversation'
import { DESK_SLOT_FOR, SLOTS_BY_ID, slotsOfType, type InteractionSlot } from './furniture'
import { DESKS, nearestWalkable, randomCellIn, isWalkable, type Cell } from './map'
import { agentCell, isCellFree, isSeatTaken, nearestFreeCell, separateAgents } from './occupancy'
import { findPath } from './pathfinding'
import {
  generateDailyPlan,
  currentPlanBlock,
  updatePlanProgress,
  slotTypesForBlock,
  remainingPlanMinutes,
} from './plans'
import { releaseAgentSlots, reserveSlot, slotOwner } from './slots'
import {
  advanceClock,
  agents,
  clock,
  minutesToMs,
  simDay,
  type SimState,
} from './state'

/** Grid cells per second. The client interpolates between 10 Hz snapshots. */
const SPEED = 3.2
/** How long an agent tolerates a blocked next cell before sidestepping. */
const WAIT_BEFORE_SIDESTEP = 900
/** Give up and teleport after this long without progress. */
const WAIT_BEFORE_TELEPORT = 9000

const MOODS: Record<AgentActivity, string[]> = {
  idle: ['restless', 'curious', 'steady'],
  walking: ['focused', 'busy'],
  working: ['focused', 'in the zone', 'determined'],
  eating: ['content', 'recharged'],
  gym: ['energised', 'sweaty'],
}

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

export function addAgent(id: string, start: Cell): SimState {
  const home = nearestFreeCell(start, id)
  const agentMeta = getAgent(id)
  const role = agentMeta?.role ?? 'default'
  const traits = agentMeta?.traits ?? ['workaholic']
  const needs = agentMeta?.needs ? structuredClone(agentMeta.needs) : createDefaultNeeds(traits)
  const state: SimState = {
    id,
    x: home.x,
    y: home.y,
    path: [],
    activity: 'idle',
    animation: 'idle',
    facing: Math.PI,
    slotId: null,
    goal: null,
    plan: generateDailyPlan(id, role, simDay),
    planDay: simDay,
    needs,
    traits,
    speech: null,
    speechUntil: 0,
    talkingWith: null,
    activityUntil: 0,
    mood: deriveMood(needs, 'idle', false, traits),
    jitter: Math.floor(Math.random() * 40) - 20,
    busy: false,
    waitingSince: 0,
    lastReplan: 0,
  }
  agents.set(id, state)
  return state
}

// ── Goals ──────────────────────────────────────────────────────────────────

interface Goal {
  cell: Cell
  activity: AgentActivity
  animation: AgentAnimation
  slot: InteractionSlot | null
  minutes: number
  facing?: number
}

/** Live occupancy is a soft cost, so agents prefer open routes but can squeeze. */
function crowded(cell: Cell, selfId: string): boolean {
  return !isCellFree(cell, selfId)
}

function slotGoal(state: SimState, slots: InteractionSlot[], now: number): Goal | null {
  const ordered = [...slots].sort(
    (a, b) => Math.hypot(a.stand.x - state.x, a.stand.y - state.y) - Math.hypot(b.stand.x - state.x, b.stand.y - state.y),
  )
  for (const slot of ordered) {
    if (isSeatTaken(slot.stand, slot.id, state.id, now)) continue
    return {
      cell: slot.stand,
      activity: 'walking',
      animation: 'walk',
      slot,
      minutes: slot.minutes,
      facing: slot.facing,
    }
  }
  return null
}

/** Desk slot for this agent, or the nearest free desk when its own is taken. */
function deskGoal(state: SimState, now: number): Goal | null {
  const own = DESK_SLOT_FOR.get(state.id)
  const ownSlot = own ? SLOTS_BY_ID.get(own) : undefined
  if (ownSlot && !isSeatTaken(ownSlot.stand, ownSlot.id, state.id, now)) {
    return {
      cell: ownSlot.stand,
      activity: 'walking',
      animation: 'walk',
      slot: ownSlot,
      minutes: ownSlot.minutes,
      facing: ownSlot.facing,
    }
  }
  return slotGoal(state, slotsOfType('sit_work'), now)
}

/**
 * Daily plan-driven goal picker (P1.2).
 *
 * Checks if the agent has a running Gemini task first (override).
 * Otherwise, finds the current schedule block from the agent's plan,
 * reserves an appropriate slot, and sets duration according to the block.
 * Outside schedule hours or when slots are taken, agents fall back gracefully.
 */
function chooseGoal(state: SimState, now: number): Goal {
  if (state.busy) {
    const desk = deskGoal(state, now)
    if (desk) return desk
  }

  // Critical needs override normal routine (P3.1)
  if (state.needs.hunger < 22) {
    const eatGoal = slotGoal(state, slotsOfType('sit_eat'), now)
    if (eatGoal) {
      maybeInviteColleague(state.id, 'lunch', now)
      return eatGoal
    }
  }

  if (state.needs.energy < 20) {
    const drinkGoal = slotGoal(state, slotsOfType('drink'), now)
    if (drinkGoal) {
      maybeInviteColleague(state.id, 'coffee', now)
      return drinkGoal
    }
  }

  const minute = (clock + state.jitter + 1440) % 1440
  const block = currentPlanBlock(state.plan, minute)

  if (block) {
    const types = slotTypesForBlock(block)
    const remMinutes = remainingPlanMinutes(block, minute)

    // For desk work, prefer own desk
    if (types.includes('sit_work')) {
      const desk = deskGoal(state, now)
      if (desk) {
        desk.minutes = Math.min(desk.minutes, remMinutes)
        return desk
      }
    }

    // Try any slot that satisfies the block, ranked by need urgency (P3.1)
    const candidates = types.flatMap((t) => slotsOfType(t))
    if (candidates.length > 0) {
      candidates.sort(
        (a, b) =>
          scoreNeedUrgency(state.needs, b.type, state.traits) -
          scoreNeedUrgency(state.needs, a.type, state.traits),
      )
      const goal = slotGoal(state, candidates, now)
      if (goal) {
        goal.minutes = Math.min(goal.minutes, remMinutes)
        if (goal.slot?.type === 'sit_eat') {
          maybeInviteColleague(state.id, 'lunch', now)
        } else if (goal.slot?.type === 'drink') {
          maybeInviteColleague(state.id, 'coffee', now)
        }
        return goal
      }
    }
  }

  // Fallback: outside plan hours or slots are full.
  // During core hours (8:30am - 6pm), fall back to desk or meeting table
  if (minute >= 510 && minute < 1080) {
    const desk = deskGoal(state, now)
    if (desk) return desk
  }

  const wander = randomCellIn('work')
  return {
    cell: wander,
    activity: 'idle',
    animation: 'idle',
    slot: null,
    minutes: 15,
  }
}

function goalAlreadyThere(state: SimState, goal: Goal): boolean {
  return Math.abs(state.x - goal.cell.x) < 0.15 && Math.abs(state.y - goal.cell.y) < 0.15
}

/** Walk (or walk first) toward a goal, reserving its slot up front. */
function pursue(state: SimState, goal: Goal, now: number): void {
  if (goal.slot) {
    releaseAgentSlots(state.id)
    if (!reserveSlot(goal.slot.id, state.id, now)) {
      // Somebody beat us to the seat: idle for a beat, then pick again.
      state.slotId = null
      state.activity = 'idle'
      state.animation = 'idle'
      state.activityUntil = now + 700
      return
    }
    state.slotId = goal.slot.id
  } else {
    releaseAgentSlots(state.id)
    state.slotId = null
  }

  const path = findPath(agentCell(state), nearestWalkable(goal.cell), {
    isCrowded: (cell) => crowded(cell, state.id),
  })

  state.goal = goal.cell
  if (!path) {
    state.path = []
    state.activity = 'idle'
    state.animation = 'idle'
    state.activityUntil = now + 1500
    return
  }

  state.path = path.slice(1)
  if (state.path.length === 0) {
    arrive(state, goal, now)
    return
  }

  state.activity = 'walking'
  state.animation = 'walk'
  state.mood = pick(MOODS.walking)
  state.activityUntil = now + 20_000
}

/** Play the slot's animation (or idle) once the agent is standing on the goal. */
function arrive(state: SimState, goal: Goal, now: number): void {
  state.activity = goal.slot ? goal.slot.activity : goal.activity
  state.animation = goal.slot ? goal.slot.animation : goal.animation
  state.facing = goal.facing ?? state.facing
  state.activityUntil = now + minutesToMs(goal.minutes)
  state.waitingSince = 0

  // Ambient line or emote when starting something visible (P2.1).
  const line = lineOrEmoteFor(state.id, state.activity, state.slotId, 0.1, now)
  if (line) {
    state.speech = line
    state.speechUntil = now + BUBBLE_MS
  }
}

function stopUsingSlot(state: SimState): void {
  if (!state.slotId) return
  releaseAgentSlots(state.id)
  state.slotId = null
}

// ── Movement ───────────────────────────────────────────────────────────────

function freeNeighbour(state: SimState): Cell | null {
  const here = agentCell(state)
  const orthogonal: Cell[] = [
    { x: here.x + 1, y: here.y },
    { x: here.x - 1, y: here.y },
    { x: here.x, y: here.y + 1 },
    { x: here.x, y: here.y - 1 },
  ]
  const free = orthogonal.filter((cell) => isCellFree(cell, state.id))
  return free.length > 0 ? pick(free) : null
}

/**
 * Move to a candidate point, sliding along a wall instead of clipping a corner.
 * Long sidesteps can otherwise cut diagonally across blocked furniture.
 */
function tryStep(state: SimState, nx: number, ny: number): boolean {
  const currentBlocked = !isWalkable(agentCell(state))
  if (currentBlocked || isWalkable(agentCell({ x: nx, y: ny }))) {
    state.x = nx
    state.y = ny
    return true
  }
  if (isWalkable(agentCell({ x: nx, y: state.y }))) {
    state.x = nx
    return true
  }
  if (isWalkable(agentCell({ x: state.x, y: ny }))) {
    state.y = ny
    return true
  }
  return false
}

/** Replan toward the stored goal when a body blocks the way. */
function replan(state: SimState, now: number): void {
  if (!state.goal) return
  if (now - state.lastReplan < 700) return
  state.lastReplan = now
  const path = findPath(agentCell(state), nearestWalkable(state.goal), {
    isCrowded: (cell) => crowded(cell, state.id),
  })
  state.path = path ? path.slice(1) : []
}

function move(state: SimState, dt: number, now: number): void {
  if (state.path.length === 0) return

  const next = state.path[0]
  const dx = next.x - state.x
  const dy = next.y - state.y
  const dist = Math.hypot(dx, dy)

  if (dist > 0.01) state.facing = Math.atan2(dx, dy)

  const step = SPEED * dt
  if (dist <= step) {
    state.x = next.x
    state.y = next.y
    state.path.shift()
    state.waitingSince = 0
    return
  }

  const blockedByAgent = !isCellFree(next, state.id) && dist < 1.3
  if (blockedByAgent) {
    state.waitingSince ||= now
  }

  if (state.waitingSince) {
    const waited = now - state.waitingSince
    if (waited > WAIT_BEFORE_SIDESTEP) {
      replan(state, now)
    }
    if (waited > 3500) {
      // Yield politely: pause in place, let the other person pass, then re-route
      state.path = []
      state.activity = 'idle'
      state.animation = 'idle'
      state.activityUntil = now + 1000
      state.waitingSince = 0
      return
    }
    if (blockedByAgent) return
  }

  state.x += (dx / dist) * step
  state.y += (dy / dist) * step
  state.waitingSince = 0
}

// ── Tick ───────────────────────────────────────────────────────────────────

export function beginTask(id: string): void {
  const state = agents.get(id)
  if (!state) return
  stopUsingSlot(state)
  state.busy = true
  state.path = []
  state.activityUntil = 0
  state.goal = null
  state.mood = 'focused'
  state.speech = '💡 On it. Focusing...'
  state.speechUntil = Date.now() + 3000
}

export function endTask(id: string, success = true): void {
  const state = agents.get(id)
  if (!state) return
  state.busy = false
  stopUsingSlot(state)
  const now = Date.now()
  state.animation = success ? 'celebrate' : 'frustrated'
  state.mood = success ? 'happy' : 'stressed'
  state.speech = success ? '🎉 Finished the task!' : '⚠️ Hit a snag on that.'
  state.speechUntil = now + 3500
  state.activityUntil = now + 3500
  state.path = []
  state.goal = null
}

export function step(dtSeconds: number, now = Date.now()): void {
  advanceClock(dtSeconds)

  for (const state of agents.values()) {
    // Regenerate daily plan when the simulated day rolls over
    if (state.planDay !== simDay) {
      const role = getAgent(state.id)?.role ?? 'default'
      state.plan = generateDailyPlan(state.id, role, simDay)
      state.planDay = simDay
    }
    updatePlanProgress(state.plan, clock)

    // Advance dynamic inner needs (P3.1)
    state.needs = tickNeeds(state.needs, dtSeconds, state.activity, state.slotId, state.traits)
    if (state.animation !== 'celebrate' && state.animation !== 'frustrated') {
      state.mood = deriveMood(state.needs, state.activity, state.busy, state.traits)
    }

    // Periodic Obsidian Second Brain vault sync (P3.1)
    if (Math.random() < 0.005) {
      const meta = getAgent(state.id)
      if (meta) syncAgentToVault(meta, state)
    }

    // Expire speech bubbles.
    if (state.speech && now > state.speechUntil) state.speech = null

    // In active two-way conversation (P2.2): freeze in place.
    if (state.talkingWith) {
      state.path = []
      if (state.activity === 'walking') state.activity = 'idle'
      continue
    }

    if (state.path.length > 0) {
      state.activity = 'walking'
      state.animation = 'walk'
      move(state, dtSeconds, now)
      continue
    }

    // No path left. Either we are standing on our goal, or the path vanished
    // (teleport / blocked) and we should fall back to idle and re-decide.
    if (state.activity === 'walking') {
      const slot = state.slotId ? SLOTS_BY_ID.get(state.slotId) : null
      const atStand =
        slot !== null &&
        slot !== undefined &&
        Math.abs(state.x - slot.stand.x) < 0.15 &&
        Math.abs(state.y - slot.stand.y) < 0.15 &&
        slotOwner(slot.id, now) === state.id

      if (slot && atStand) {
        arrive(
          state,
          {
            cell: slot.stand,
            activity: slot.activity,
            animation: slot.animation,
            slot,
            minutes: slot.minutes,
            facing: slot.facing,
          },
          now,
        )
      } else {
        state.activity = 'idle'
        state.animation = 'idle'
        state.activityUntil = now
      }
    }

    if (now < state.activityUntil) continue

    // Activity over: stand up, free the seat, pick the next thing to do.
    stopUsingSlot(state)
    state.goal = null
    const goal = chooseGoal(state, now)
    if (goalAlreadyThere(state, goal) && !goal.slot) {
      state.activity = goal.activity
      state.animation = goal.animation
      state.activityUntil = now + minutesToMs(goal.minutes)
      continue
    }
    pursue(state, goal, now)
  }

  separateAgents()
  updateConversations(now)
}
