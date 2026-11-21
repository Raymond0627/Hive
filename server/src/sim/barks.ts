/**
 * Ambient speech and activity-tied emotes (P2.1).
 *
 * Speech pools are tagged by activity and phase.
 * Silence is the default: characters speak only occasionally, and prefer
 * ambient emote icons (💪, 🍽️, 💡) over constant text.
 */
import type { AgentActivity } from '@hive/shared'
import linesData from './lines.json'

interface LinesFile {
  emotes: Record<string, string[]>
  activities: Record<string, Record<string, string[]>>
}

const LINES = linesData as LinesFile

const COOLDOWN_MS = 22_000
const BUBBLE_MS = 4000

/** Per-agent bubble cooldown so agents don't spam the room. */
const lastBark = new Map<string, number>()

import { random } from './rng'

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)]
}

/** Determine the specific activity category for lines and emotes. */
export function activityCategory(activity: AgentActivity, slotId: string | null): string {
  if (slotId?.startsWith('treadmill')) return 'run'
  if (slotId?.startsWith('bench') || slotId?.startsWith('dumbbell')) return 'lift'
  if (slotId?.startsWith('mat-pushups')) return 'pushups'
  if (slotId?.startsWith('mat-jacks')) return 'jacks'
  if (slotId?.startsWith('yoga')) return 'stretch'
  if (slotId?.startsWith('coffee') || slotId?.startsWith('fridge')) return 'drink'
  if (slotId?.startsWith('stove')) return 'cook'
  if (slotId?.startsWith('dine')) return 'eat'
  if (slotId?.startsWith('desk') || slotId?.startsWith('meet')) return 'work'

  if (activity === 'eating') return 'eat'
  if (activity === 'gym') return 'run'
  if (activity === 'working') return 'work'
  return 'idle'
}

/** Pick an ambient emote for an activity (e.g. 💪 for gym, 🍽️ for eat). */
export function emoteForActivity(activity: AgentActivity, slotId: string | null): string {
  const cat = activityCategory(activity, slotId)
  const pool = LINES.emotes[cat] ?? LINES.emotes.idle
  return pick(pool)
}

/**
 * Activity phase tag based on progress through the activity window:
 *  - 0.0 - 0.25: starting / hungry / morning
 *  - 0.25 - 0.75: mid_run / mid_set / simmering / focused
 *  - 0.75 - 0.90: tired / struggling / stuck
 *  - 0.90 - 1.00: finishing / done / full
 */
function phaseForProgress(progress: number): string {
  if (progress < 0.25) return 'starting'
  if (progress < 0.75) return 'mid_run'
  if (progress < 0.9) return 'tired'
  return 'finishing'
}

/**
 * Speech gate:
 *  1. Checks cooldown (22s)
 *  2. 65% of the time, remains silent or shows an emote (P2.1 silence default)
 *  3. Otherwise, picks a line strictly tied to the agent's activity and phase.
 */
export function lineOrEmoteFor(
  agentId: string,
  activity: AgentActivity,
  slotId: string | null,
  progress: number,
  now = Date.now(),
): string | null {
  const last = lastBark.get(agentId) ?? 0
  if (now - last < COOLDOWN_MS) return null

  // 40% complete silence
  const roll = random()
  if (roll < 0.4) return null

  // 35% emote icon instead of text (P2.1)
  if (roll < 0.75) {
    lastBark.set(agentId, now)
    return emoteForActivity(activity, slotId)
  }

  // 25% phase-tagged spoken text
  const cat = activityCategory(activity, slotId)
  let actKey = cat
  if (cat === 'run') actKey = 'treadmill'
  else if (cat === 'lift') actKey = 'bench'

  const pool = LINES.activities[actKey]
  if (!pool) {
    lastBark.set(agentId, now)
    return emoteForActivity(activity, slotId)
  }

  const phase = phaseForProgress(progress)
  const lines = pool[phase] ?? Object.values(pool)[0]
  if (!lines || lines.length === 0) return null

  lastBark.set(agentId, now)
  return pick(lines)
}

export { BUBBLE_MS }
