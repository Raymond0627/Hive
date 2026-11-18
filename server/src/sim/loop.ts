import { broadcast } from '../ws'
import { addAgent, step } from './engine'
import { DESKS } from './layout'
import { allSims, clock, timeScale } from './state'

/** Seed the five agents at their desks and run the 10 Hz tick loop. */
export function startSim(intervalMs = 100): NodeJS.Timeout {
  for (const [id, { workSpot }] of Object.entries(DESKS)) addAgent(id, workSpot)

  return setInterval(() => {
    step((intervalMs / 1000) * timeScale)
    for (const sim of allSims()) {
      broadcast({
        type: 'agent_update',
        agentId: sim.id,
        x: sim.x,
        y: sim.y,
        activity: sim.activity,
        animation: sim.animation,
        facing: sim.facing,
        slotId: sim.slotId,
        goal: sim.goal,
        path: sim.path.slice(0, 5),
        speech: sim.speech,
        talkingWith: sim.talkingWith,
        mood: sim.mood,
        plan: sim.plan,
        needs: sim.needs,
        clock,
      })
    }
  }, intervalMs)
}
