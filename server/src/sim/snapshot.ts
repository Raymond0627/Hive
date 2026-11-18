import type { AgentSnapshot } from '@hive/shared'
import { getAgent } from '../store'
import { allSims } from './state'

/** Identity from the store + live position and activity from the simulation. */
export function snapshots(): AgentSnapshot[] {
  const result: AgentSnapshot[] = []
  for (const sim of allSims()) {
    const agent = getAgent(sim.id)
    if (!agent) continue
    const next = sim.path[0]
    result.push({
      ...agent,
      activity: sim.activity,
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
