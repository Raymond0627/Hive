import { broadcast } from '../ws'
import { addAgent, step } from './engine'
import { DESKS } from './map'
import { allSims } from './state'

/** Seed the five agents at their desks and run the 10 Hz tick loop. */
export function startSim(intervalMs = 100): NodeJS.Timeout {
  for (const [id, desk] of Object.entries(DESKS)) addAgent(id, desk.workSpot)

  return setInterval(() => {
    step(intervalMs / 1000)
    for (const sim of allSims()) {
      broadcast({
        type: 'agent_update',
        agentId: sim.id,
        x: sim.x,
        y: sim.y,
        activity: sim.activity,
        mood: sim.mood,
      })
    }
  }, intervalMs)
}
