import test from 'node:test'
import assert from 'node:assert/strict'
import { addAgent, step } from './engine'
import { DESKS, isWalkable } from './map'
import { SLOTS_BY_ID } from './furniture'
import { allSims, agents } from './state'
import { nearestFreeCell } from './occupancy'

/**
 * Headless stress run: 20 agents, one simulated day, virtual time.
 *
 * Fails if anyone clips into furniture, overlaps another body or stays stuck.
 * The real tick loop is 10 Hz, so one tick = 0.1 s = 0.4 simulated minutes.
 */
test('20 agents survive a simulated day without clipping or sticking', () => {
  // Determinism keeps the assertions meaningful between runs.
  let seed = 42
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  const original = Math.random
  Math.random = random

  agents.clear()
  for (const [id, { workSpot }] of Object.entries(DESKS)) addAgent(id, workSpot)
  const extras = Array.from({ length: 15 }, (_, i) => `extra-${i + 1}`)
  extras.forEach((id, index) => {
    addAgent(id, nearestFreeCell({ x: 3 + (index % 8), y: 21 + Math.floor(index / 8) }))
  })

  let now = 1_700_000_000_000
  const TICKS = 3600 // 360 s wall clock = one simulated day at 4 min/s
  const lastCell = new Map<string, { cell: string; since: number }>()
  let worstStuck = 0
  let usedSlot = false

  for (let tick = 0; tick < TICKS; tick += 1) {
    now += 100
    step(0.1, now)
    if (tick % 50 === 0) {
      for (const sim of allSims()) {
        const cell = `${Math.round(sim.x)},${Math.round(sim.y)}`
        const cx = Math.round(sim.x)
        const cy = Math.round(sim.y)
        // An interpolated position can round into a blocked cell while sliding
        // past its corner; only fail when the body is actually deep inside it.
        if (!isWalkable({ x: cx, y: cy })) {
          const depth = Math.hypot(sim.x - cx, sim.y - cy)
          assert.ok(
            depth > 0.34,
            `${sim.id} inside blocked cell ${cell} (depth ${depth.toFixed(2)}) at tick ${tick}`,
          )
        }

        if (sim.activity === 'walking') {
          const previous = lastCell.get(sim.id)
          if (!previous || previous.cell !== cell) {
            lastCell.set(sim.id, { cell, since: now })
          } else {
            const stuckFor = now - previous.since
            worstStuck = Math.max(worstStuck, stuckFor)
            assert.ok(stuckFor < 15_000, `${sim.id} stuck on ${cell} for ${stuckFor} ms`)
          }
        } else {
          lastCell.delete(sim.id)
        }

        if (sim.slotId && sim.activity !== 'walking') {
          assert.ok(SLOTS_BY_ID.has(sim.slotId), `${sim.id} holds unknown slot ${sim.slotId}`)
          usedSlot = true
        }
      }

      // Two bodies may never share a spot. 0.45 cells is well inside the voxel body.
      for (let i = 0; i < allSims().length; i += 1) {
        for (let j = i + 1; j < allSims().length; j += 1) {
          const a = allSims()[i]
          const b = allSims()[j]
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          assert.ok(
            distance > 0.45,
            `${a.id} and ${b.id} overlap (${distance.toFixed(2)}) at tick ${tick}`,
          )
        }
      }
    }
  }

  Math.random = original
  assert.ok(usedSlot, 'no agent ever used a furniture slot')
  assert.ok(worstStuck < 15_000, `worst stuck time ${worstStuck} ms`)
})
