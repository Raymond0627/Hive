import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateDailyPlan,
  currentPlanBlock,
  updatePlanProgress,
  slotTypesForBlock,
  remainingPlanMinutes,
} from './plans'

test('generates valid daily plans for all starter agents', () => {
  const agents = ['meow', 'gugel', 'sikyo', 'brod', 'aiz', 'unknown']
  for (const id of agents) {
    const plan = generateDailyPlan(id, 'default', 0)
    assert.ok(plan.length >= 4, `expected at least 4 blocks for ${id}`)
    for (const block of plan) {
      assert.ok(block.id.length > 0)
      assert.ok(block.label.length > 0)
      assert.ok(block.startMinute < block.endMinute)
      assert.equal(block.done, false)
    }
  }
})

test('identifies current plan block across the day', () => {
  const plan = generateDailyPlan('meow', 'Researcher', 0)
  // 10:00 AM (600 min) should be deep research
  const morning = currentPlanBlock(plan, 600)
  assert.ok(morning)
  assert.equal(morning.activity, 'working')

  // 12:30 PM (750 min) should be lunch
  const lunch = currentPlanBlock(plan, 750)
  assert.ok(lunch)
  assert.equal(lunch.activity, 'eating')

  // 4:45 PM (1005 min) should be gym
  const gym = currentPlanBlock(plan, 1005)
  assert.ok(gym)
  assert.equal(gym.activity, 'gym')
})

test('marks completed blocks done as time advances', () => {
  const plan = generateDailyPlan('gugel', 'Analyst', 0)
  // At 8:00 AM (480 min), nothing done
  updatePlanProgress(plan, 480)
  assert.equal(plan.every((b) => !b.done), true)

  // At 1:00 PM (780 min), morning tasks and lunch are done
  updatePlanProgress(plan, 780)
  const doneBlocks = plan.filter((b) => b.done)
  assert.ok(doneBlocks.length >= 3)

  // At midnight (1440 / 0 min), all blocks for today are done
  updatePlanProgress(plan, 1439)
  assert.equal(plan.every((b) => b.done), true)
})

test('resolves slot types and remaining minutes', () => {
  const plan = generateDailyPlan('brod', 'Strategist', 0)
  const workBlock = plan.find((b) => b.activity === 'working')!
  const slots = slotTypesForBlock(workBlock)
  assert.ok(slots.length > 0)

  const rem = remainingPlanMinutes(workBlock, workBlock.startMinute + 20)
  assert.equal(rem, workBlock.endMinute - (workBlock.startMinute + 20))
})
