/**
 * Daily plans (brief P1.2).
 *
 * Each agent gets a block schedule from `plans.json`: role/agent templates plus
 * a small deterministic per-agent, per-day shift so the office never moves in
 * lockstep. The engine follows the current block, and the panel renders the
 * same list with items checked off as the simulated clock advances.
 */
import type { AgentActivity, PlanBlock, SlotType } from '@hive/shared'
import planJson from './plans.json'

interface PlanTemplate {
  id: string
  label: string
  startMinute: number
  endMinute: number
  activity: AgentActivity
  slotType?: SlotType
}

interface PlanFile {
  version: number
  byAgent: Record<string, PlanTemplate[]>
  byRole: Record<string, PlanTemplate[]>
  default: PlanTemplate[]
}

const PLANS = planJson as PlanFile
const DAY_MINUTES = 1440

/** FNV-1a; tiny and stable across runs, unlike Math.random. */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/** ±8 minute personal offset so early birds and late starters differ. */
function planShift(agentId: string, day: number): number {
  return (hash(`${agentId}:${day}`) % 17) - 8
}

export function generateDailyPlan(agentId: string, role: string, day = 0): PlanBlock[] {
  const template =
    PLANS.byAgent[agentId] ?? PLANS.byRole[role] ?? PLANS.default
  const shift = planShift(agentId, day)

  return template.map((block) => {
    const start = Math.max(0, Math.min(DAY_MINUTES - 10, block.startMinute + shift))
    const end = Math.max(start + 10, Math.min(DAY_MINUTES, block.endMinute + shift))
    return {
      ...block,
      id: `${block.id}-d${day}`,
      startMinute: start,
      endMinute: end,
      done: false,
    }
  })
}

/** The block covering `minute`, or null during an off-plan gap. */
export function currentPlanBlock(plan: PlanBlock[], minute: number): PlanBlock | null {
  const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  for (const block of plan) {
    if (m >= block.startMinute && m < block.endMinute) return block
  }
  return null
}

/** Tick-time bookkeeping: a block is done once the clock has passed its end. */
export function updatePlanProgress(plan: PlanBlock[], minute: number): void {
  const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  for (const block of plan) {
    block.done = m >= block.endMinute
  }
}

/** Minutes left in the current block, at least one. */
export function remainingPlanMinutes(block: PlanBlock, minute: number): number {
  const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return Math.max(1, block.endMinute - m)
}

/**
 * Which furniture slot types satisfy a plan block. The slot type is explicit in
 * the plan; the activity is the fallback for hand-written/future plans.
 */
export function slotTypesForBlock(block: PlanBlock): SlotType[] {
  if (block.slotType) {
    // A gym block can use any machine when its first choice is taken.
    if (block.slotType === 'run' || block.slotType === 'lift') {
      return [block.slotType, 'pushups', 'jacks', 'stretch']
    }
    return [block.slotType]
  }

  switch (block.activity) {
    case 'working':
      return ['sit_work', 'sit_meet']
    case 'eating':
      return ['sit_eat']
    case 'gym':
      return ['run', 'lift', 'pushups', 'jacks', 'stretch']
    case 'idle':
      return ['drink', 'stretch']
    default:
      return []
  }
}

/** Debug/verification helper: how much of today's plan is complete. */
export function planProgress(plan: PlanBlock[]): { done: number; total: number } {
  return {
    done: plan.filter((block) => block.done).length,
    total: plan.length,
  }
}
