/**
 * Needs & Mood Engine (P3.1).
 *
 * Plain code, zero AI calls.
 * Energy, hunger, social, and fun decay over time and restore when agents use
 * appropriate furniture slots or engage in conversations.
 * Personality traits adjust decay rates, restore multipliers and goal preferences.
 */
import type { AgentActivity, AgentNeeds, AgentTrait, SlotType } from '@hive/shared'

const clamp = (val: number, min = 0, max = 100) => Math.max(min, Math.min(max, val))

export function createDefaultNeeds(traits: AgentTrait[] = []): AgentNeeds {
  return {
    energy: traits.includes('workaholic') ? 95 : 85,
    hunger: 75,
    social: traits.includes('sociable') ? 85 : traits.includes('introvert') ? 45 : 65,
    fun: traits.includes('gym_lover') ? 80 : 70,
  }
}

/**
 * Advance agent needs by dtSeconds based on current activity and slot.
 */
export function tickNeeds(
  needs: AgentNeeds,
  dtSeconds: number,
  activity: AgentActivity,
  slotId: string | null,
  traits: AgentTrait[] = [],
): AgentNeeds {
  const isWorkaholic = traits.includes('workaholic')
  const isGymLover = traits.includes('gym_lover')
  const isFoodie = traits.includes('foodie')
  const isSociable = traits.includes('sociable')
  const isIntrovert = traits.includes('introvert')

  let dEnergy = 0
  let dHunger = 0
  let dSocial = 0
  let dFun = 0

  // 1. Natural passive decay
  dHunger -= (isFoodie ? 0.08 : 0.06) * dtSeconds
  dSocial -= (isSociable ? 0.05 : isIntrovert ? 0.015 : 0.03) * dtSeconds
  dFun -= 0.02 * dtSeconds

  // 2. Activity / Slot specific effects
  if (slotId?.startsWith('dine') || activity === 'eating') {
    dHunger += 2.0 * dtSeconds
    dFun += (isFoodie ? 0.6 : 0.2) * dtSeconds
    dEnergy += 0.1 * dtSeconds
  } else if (slotId?.startsWith('coffee') || slotId?.startsWith('fridge')) {
    dEnergy += 1.5 * dtSeconds
    dHunger += 0.2 * dtSeconds
    dFun += 0.2 * dtSeconds
  } else if (slotId?.startsWith('stove')) {
    dHunger += 0.3 * dtSeconds
    dFun += (isFoodie ? 1.0 : 0.3) * dtSeconds
  } else if (
    slotId?.startsWith('treadmill') ||
    slotId?.startsWith('bench') ||
    slotId?.startsWith('dumbbell') ||
    slotId?.startsWith('mat') ||
    activity === 'gym'
  ) {
    dFun += (isGymLover ? 2.0 : 0.9) * dtSeconds
    dEnergy -= 0.4 * dtSeconds
    dHunger -= 0.08 * dtSeconds
  } else if (slotId?.startsWith('yoga')) {
    dEnergy += 0.3 * dtSeconds
    dFun += 0.5 * dtSeconds
  } else if (activity === 'working' || slotId?.startsWith('desk')) {
    dEnergy -= (isWorkaholic ? 0.04 : 0.09) * dtSeconds
    dFun -= (isWorkaholic ? 0.02 : 0.07) * dtSeconds
  } else if (activity === 'walking') {
    dEnergy -= 0.03 * dtSeconds
  }

  return {
    energy: clamp(needs.energy + dEnergy),
    hunger: clamp(needs.hunger + dHunger),
    social: clamp(needs.social + dSocial),
    fun: clamp(needs.fun + dFun),
  }
}

/**
 * Restore social and fun upon completing a two-way dialogue.
 */
export function applyConversationBoost(needs: AgentNeeds, traits: AgentTrait[] = []): void {
  const boost = traits.includes('sociable') ? 35 : traits.includes('introvert') ? 18 : 25
  needs.social = clamp(needs.social + boost)
  needs.fun = clamp(needs.fun + 12)
}

/**
 * Determine dynamic mood from needs, current action, and running task state.
 */
export function deriveMood(
  needs: AgentNeeds,
  activity: AgentActivity,
  busy: boolean,
  traits: AgentTrait[] = [],
): string {
  if (busy) return 'focused'
  if (needs.hunger < 20) return 'hangry'
  if (needs.energy < 22) return 'exhausted'
  if (needs.energy < 35 && needs.fun < 30) return 'stressed'
  if (needs.fun < 25) return 'bored'
  if (needs.social < 20 && !traits.includes('introvert')) return 'restless'
  if (needs.energy > 65 && needs.fun > 60) return 'happy'
  if (activity === 'working') return 'focused'
  if (activity === 'eating') return 'content'
  if (activity === 'gym') return 'energised'
  return 'steady'
}

/**
 * Compute need urgency score bonus for a candidate slot type.
 * When needs become critical (hunger < 25, energy < 25), urgency spikes.
 */
export function scoreNeedUrgency(
  needs: AgentNeeds,
  slotType: SlotType,
  traits: AgentTrait[] = [],
): number {
  let score = 0
  const isGymLover = traits.includes('gym_lover')
  const isFoodie = traits.includes('foodie')
  const isWorkaholic = traits.includes('workaholic')

  if (slotType === 'sit_eat') {
    if (needs.hunger < 40) {
      score += (100 - needs.hunger) * 1.4
    }
    if (isFoodie) score += 15
  }

  if (slotType === 'drink') {
    if (needs.energy < 40) {
      score += (100 - needs.energy) * 1.3
    }
  }

  if (
    slotType === 'run' ||
    slotType === 'lift' ||
    slotType === 'pushups' ||
    slotType === 'jacks' ||
    slotType === 'stretch'
  ) {
    if (needs.fun < 40) {
      score += (100 - needs.fun) * 1.1
    }
    if (isGymLover) score += 20
  }

  if (slotType === 'sit_work' || slotType === 'sit_meet') {
    if (isWorkaholic) score += 18
  }

  return score
}
