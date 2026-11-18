/**
 * Slot reservation manager.
 *
 * Only one agent may use a furniture slot at a time. Reservations are made when
 * the agent *starts walking* to the slot (so two agents never race for the same
 * chair) and expire on a timeout, so a stalled agent can never lock a seat
 * forever.
 */

export const SLOT_TIMEOUT_MS = 5 * 60 * 1000

interface Reservation {
  agentId: string
  until: number
}

const reservations = new Map<string, Reservation>()

/** Try to claim a slot. Returns false when someone else holds it. */
export function reserveSlot(slotId: string, agentId: string, now = Date.now()): boolean {
  const current = reservations.get(slotId)
  if (current && current.agentId !== agentId) {
    if (now < current.until) return false
    reservations.delete(slotId)
  }
  reservations.set(slotId, { agentId, until: now + SLOT_TIMEOUT_MS })
  return true
}

export function releaseSlot(slotId: string): void {
  reservations.delete(slotId)
}

/** Drop every reservation held by an agent (task end, drag, leaving a slot). */
export function releaseAgentSlots(agentId: string): void {
  for (const [slotId, reservation] of reservations) {
    if (reservation.agentId === agentId) reservations.delete(slotId)
  }
}

/** Agent id currently holding the slot, ignoring expired claims. */
export function slotOwner(slotId: string, now = Date.now()): string | null {
  const current = reservations.get(slotId)
  if (!current) return null
  if (now >= current.until) {
    reservations.delete(slotId)
    return null
  }
  return current.agentId
}

export function isSlotFree(slotId: string, now = Date.now()): boolean {
  return slotOwner(slotId, now) === null
}

/** Debug helper for the headless checks. */
export function reservationCount(): number {
  return reservations.size
}
