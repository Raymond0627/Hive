import type { AgentSnapshot } from '@hive/shared'
import { getAgent } from '../store'
import { allSims } from './state'

/** Identity from the store + live position, pose and interaction from the sim. */
export function snapshots(): AgentSnapshot[] {
  const result: AgentSnapshot[] = []
  for (const sim of allSims()) {
    const agent = getAgent(sim.id)
    if (!agent) continue
    const next = sim.path[0]
    result.push({
      ...agent,
      activity: sim.activity,
      animation: sim.animation,
      facing: sim.facing,
      slotId: sim.slotId,
      goal: sim.goal,
      path: sim.path.slice(0, 5),
      plan: sim.plan,
      needs: sim.needs,
      traits: sim.traits,
      speech: sim.speech,
      talkingWith: sim.talkingWith,
      mood: sim.mood,
      x: sim.x,
      y: sim.y,
      targetX: next ? next.x : Math.round(sim.x),
      targetY: next ? next.y : Math.round(sim.y),
      activityUntil: sim.activityUntil,
    })
  }
  return result
}
