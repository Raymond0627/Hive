import { broadcast } from '../ws'
import { addAgent, step } from './engine'
import { DESKS } from './layout'
import { allSims, clock, timeScale } from './state'
import { nearestFreeCell } from './occupancy'
import { loadAgentStates, saveAgentStates, saveNeeds, savePlan } from '../persistence'

/** Persist positions every 5 seconds (10 Hz tick loop). */
const STATE_SAVE_TICKS = 50

/** Seed the five agents at their desks and run the 10 Hz tick loop. */
export function startSim(intervalMs = 100): NodeJS.Timeout {
  const savedStates = loadAgentStates()

  for (const [id, { workSpot }] of Object.entries(DESKS)) {
    const sim = addAgent(id, workSpot)
    // Step 8: resume where the last run left off, snapped to a free cell so a
    // stale coordinate can never drop a body inside furniture.
    const saved = savedStates.get(id)
    if (saved) {
      const cell = nearestFreeCell({ x: Math.round(saved.x), y: Math.round(saved.y) }, id)
      sim.x = cell.x
      sim.y = cell.y
    }
  }

  let tick = 0

  return setInterval(() => {
    step((intervalMs / 1000) * timeScale)

    tick += 1
    if (tick % STATE_SAVE_TICKS === 0) {
      saveAgentStates(
        allSims().map((sim) => ({
          id: sim.id,
          x: sim.x,
          y: sim.y,
          activity: sim.activity,
          activityUntil: sim.activityUntil,
          mood: sim.mood,
        })),
      )
      for (const sim of allSims()) {
        saveNeeds(sim.id, sim.needs)
        savePlan(sim.id, sim.planDay, sim.plan)
      }
    }

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
