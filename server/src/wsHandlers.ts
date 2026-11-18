import type { ClientMessage } from '@hive/shared'
import { broadcast } from './ws'
import { getSim } from './sim/state'
import { nearestWalkable } from './sim/map'

export function handleClientMessage(raw: string): void {
  let message: ClientMessage
  try {
    message = JSON.parse(raw) as ClientMessage
  } catch {
    return
  }

  if (message.type === 'drag_agent') {
    const sim = getSim(message.agentId)
    if (!sim) return
    const cell = nearestWalkable({ x: Math.round(message.x), y: Math.round(message.y) })
    sim.x = cell.x
    sim.y = cell.y
    sim.path = []
    sim.activity = 'idle'
    sim.activityUntil = Date.now() + 10_000
    broadcast({
      type: 'agent_update',
      agentId: sim.id,
      x: sim.x,
      y: sim.y,
      activity: 'idle',
      mood: sim.mood,
    })
  }
}
