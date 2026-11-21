import test from 'node:test'
import assert from 'node:assert/strict'
import { addAgent, chooseGoal, step } from './engine'
import { agents } from './state'
import { DESKS } from './map'
import { seedRng } from './rng'

test('chooseGoal: every free agent gets a non-null goal with a cell', () => {
  seedRng(7)
  agents.clear()
  for (const [id, { workSpot }] of Object.entries(DESKS)) addAgent(id, workSpot)

  for (const sim of agents.values()) {
    const goal = chooseGoal(sim, Date.now())
    assert.ok(goal, `${sim.id} got no goal`)
    assert.ok(goal.cell && Number.isFinite(goal.cell.x) && Number.isFinite(goal.cell.y), `${sim.id} goal has no cell`)
  }
})

test('chooseGoal: a critically hungry agent prefers an eat slot', () => {
  seedRng(11)
  agents.clear()
  for (const [id, { workSpot }] of Object.entries(DESKS)) addAgent(id, workSpot)
  const sim = agents.get('meow')!
  sim.needs.hunger = 5
  const goal = chooseGoal(sim, Date.now())
  assert.ok(goal.slot, 'hungry agent should target a slot')
  assert.equal(goal.slot!.type, 'sit_eat')
})

test('chooseGoal: a critically tired agent prefers a drink/rest slot', () => {
  seedRng(13)
  agents.clear()
  for (const [id, { workSpot }] of Object.entries(DESKS)) addAgent(id, workSpot)
  const sim = agents.get('gugel')!
  sim.needs.energy = 5
  const goal = chooseGoal(sim, Date.now())
  assert.ok(goal.slot, 'tired agent should target a slot')
  assert.ok(['drink', 'sit_eat', 'rest'].includes(goal.slot!.type), `unexpected slot ${goal.slot!.type}`)
})
