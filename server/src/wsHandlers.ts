import type { ClientMessage } from '@hive/shared'
import { broadcast } from './ws'
import { getSim, setTimeScale, getTimeScale } from './sim/state'
import { nearestFreeCell } from './sim/occupancy'
import { releaseAgentSlots } from './sim/slots'
import { setConversationsEnabled } from './sim/conversation'
import { runDirectChat } from './agents/agentService'
import { addChatMessage } from './store'

export function handleClientMessage(raw: string): void {
  let message: ClientMessage
  try {
    message = JSON.parse(raw) as ClientMessage
  } catch {
    return
  }

  if (message.type === 'set_speed') {
    setTimeScale(message.speed)
    broadcast({ type: 'sim_speed', speed: getTimeScale() })
    return
  }

  if (message.type === 'toggle_conversations') {
    setConversationsEnabled(message.enabled)
    return
  }

  if (message.type === 'send_chat') {
    const { agentId, text } = message
    const userMsg = addChatMessage(agentId, 'user', text)
    broadcast({ type: 'chat_message', agentId, message: userMsg })

    void (async () => {
      try {
        const reply = await runDirectChat(agentId, text)
        const agentMsg = addChatMessage(agentId, 'agent', reply)
        broadcast({ type: 'chat_message', agentId, message: agentMsg })

        // Show in-scene bubble above the agent
        const sim = getSim(agentId)
        if (sim) {
          sim.speech = reply
          sim.speechUntil = Date.now() + 4500
          if (sim.activity !== 'walking') {
            sim.animation = 'talk'
            setTimeout(() => {
              if (sim.animation === 'talk') {
                sim.animation = sim.activity === 'walking' ? 'walk' : 'idle'
              }
            }, 3000)
          }
        }
      } catch (err) {
        // Fallback message
        const fallback = addChatMessage(
          agentId,
          'agent',
          "Sorry, got distracted by something in the office. What's up?",
        )
        broadcast({ type: 'chat_message', agentId, message: fallback })
      }
    })()
    return
  }

  if (message.type === 'drag_agent') {
    const sim = getSim(message.agentId)
    if (!sim) return

    // Snap to a walkable cell nobody is standing on, so drops never land inside
    // furniture or on top of another agent.
    const cell = nearestFreeCell({ x: Math.round(message.x), y: Math.round(message.y) }, sim.id)
    releaseAgentSlots(sim.id)
    sim.x = cell.x
    sim.y = cell.y
    sim.path = []
    sim.slotId = null
    sim.goal = null
    sim.activity = 'idle'
    sim.animation = 'idle'
    sim.speech = null
    sim.speechUntil = 0
    sim.activityUntil = Date.now() + 8_000
    broadcast({
      type: 'agent_update',
      agentId: sim.id,
      x: sim.x,
      y: sim.y,
      activity: sim.activity,
      animation: sim.animation,
      facing: sim.facing,
      slotId: sim.slotId,
      speech: sim.speech,
      mood: sim.mood,
    })
  }
}
