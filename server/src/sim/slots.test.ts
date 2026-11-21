import test from 'node:test'
import assert from 'node:assert/strict'
import { reserveSlot, slotOwner, releaseSlot, releaseAgentSlots, isSlotFree } from './slots'

test('slot reservation: first claim wins, second is rejected while fresh', () => {
  const now = 1000
  assert.equal(reserveSlot('chair-1', 'meow', now), true)
  assert.equal(slotOwner('chair-1', now), 'meow')
  assert.equal(isSlotFree('chair-1', now), false)
  assert.equal(reserveSlot('chair-1', 'gugel', now), false)
  assert.equal(slotOwner('chair-1', now), 'meow')
})

test('slot reservation: same agent can re-claim idempotently', () => {
  const now = 2000
  reserveSlot('chair-2', 'meow', now)
  assert.equal(reserveSlot('chair-2', 'meow', now + 100), true)
  assert.equal(slotOwner('chair-2', now + 100), 'meow')
})

test('slot reservation: expired claim is released and a new agent can claim', () => {
  const now = 3000
  reserveSlot('chair-3', 'meow', now)
  const later = now + 6 * 60 * 1000 // past SLOT_TIMEOUT_MS
  assert.equal(slotOwner('chair-3', later), null)
  assert.equal(reserveSlot('chair-3', 'gugel', later), true)
  assert.equal(slotOwner('chair-3', later), 'gugel')
})

test('releaseAgentSlots frees every slot held by an agent', () => {
  const now = 4000
  reserveSlot('a', 'meow', now)
  reserveSlot('b', 'meow', now)
  reserveSlot('c', 'gugel', now)
  releaseAgentSlots('meow')
  assert.equal(slotOwner('a', now), null)
  assert.equal(slotOwner('b', now), null)
  assert.equal(slotOwner('c', now), 'gugel')
  releaseSlot('c')
})

test('releaseSlot frees a single slot', () => {
  const now = 5000
  reserveSlot('solo', 'aiz', now)
  releaseSlot('solo')
  assert.equal(slotOwner('solo', now), null)
  assert.equal(isSlotFree('solo', now), true)
})
