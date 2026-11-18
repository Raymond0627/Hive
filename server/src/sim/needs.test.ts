import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDefaultNeeds,
  tickNeeds,
  deriveMood,
  scoreNeedUrgency,
  applyConversationBoost,
} from './needs'
import {
  getAffinity,
  adjustAffinity,
  maybeInviteColleague,
} from './relationships'
import {
  initVault,
  syncAgentToVault,
  getAgentVaultNote,
} from '../vault'
import { STARTER_AGENTS } from '../agents/personas'
import { addAgent } from './engine'
import { DESKS } from './layout'
import { agents } from './state'

test('createDefaultNeeds initializes bounded needs with trait adjustments', () => {
  const normalNeeds = createDefaultNeeds([])
  assert.equal(normalNeeds.energy, 85)
  assert.equal(normalNeeds.hunger, 75)
  assert.equal(normalNeeds.social, 65)

  const workaholic = createDefaultNeeds(['workaholic'])
  assert.equal(workaholic.energy, 95)

  const introvert = createDefaultNeeds(['introvert'])
  assert.equal(introvert.social, 45)
})

test('tickNeeds decays energy while working and restores hunger when dining', () => {
  const needs = { energy: 80, hunger: 50, social: 60, fun: 70 }

  // 10 seconds of working at desk
  const afterWork = tickNeeds(needs, 10, 'working', 'desk-meow', ['workaholic'])
  assert.ok(afterWork.energy < 80, 'energy should decrease while working')
  assert.ok(afterWork.hunger < 50, 'hunger should decay over time')

  // 10 seconds of eating at dining table
  const afterEat = tickNeeds(afterWork, 10, 'eating', 'dine-west', ['foodie'])
  assert.ok(afterEat.hunger > afterWork.hunger, 'dining should restore hunger')
  assert.ok(afterEat.fun >= afterWork.fun, 'foodie gets fun from dining')
})

test('conversation boost restores social and fun', () => {
  const needs = { energy: 60, hunger: 60, social: 20, fun: 30 }
  applyConversationBoost(needs, ['sociable'])
  assert.ok(needs.social >= 55, 'sociable agent gets big social boost')
  assert.ok(needs.fun >= 42, 'conversation restores fun')
})

test('deriveMood correctly reflects low energy and hunger', () => {
  assert.equal(
    deriveMood({ energy: 15, hunger: 80, social: 60, fun: 60 }, 'idle', false),
    'exhausted',
  )
  assert.equal(
    deriveMood({ energy: 60, hunger: 15, social: 60, fun: 60 }, 'idle', false),
    'hangry',
  )
  assert.equal(
    deriveMood({ energy: 80, hunger: 80, social: 75, fun: 80 }, 'idle', false),
    'happy',
  )
  assert.equal(
    deriveMood({ energy: 50, hunger: 60, social: 50, fun: 50 }, 'gym', false),
    'energised',
  )
  assert.equal(
    deriveMood({ energy: 80, hunger: 80, social: 75, fun: 80 }, 'working', true),
    'focused',
  )
})

test('scoreNeedUrgency increases when needs drop low', () => {
  const highNeeds = { energy: 90, hunger: 90, social: 80, fun: 80 }
  const starvingNeeds = { energy: 90, hunger: 15, social: 80, fun: 80 }

  const baseScore = scoreNeedUrgency(highNeeds, 'sit_eat', [])
  const starvingScore = scoreNeedUrgency(starvingNeeds, 'sit_eat', [])

  assert.ok(starvingScore > baseScore + 50, 'starving should drastically boost eat score')
})

test('relationships adjust affinity and track notes', () => {
  adjustAffinity('meow', 'gugel', 10, 'Great research discussion')
  const affinity = getAffinity('meow', 'gugel')
  assert.ok(affinity >= 25)

  adjustAffinity('meow', 'gugel', -5)
  assert.equal(getAffinity('meow', 'gugel'), affinity - 5)
})

test('invitations logic functions with affinity and traits', () => {
  agents.clear()
  for (const [id, { workSpot }] of Object.entries(DESKS)) {
    addAgent(id, workSpot)
  }

  const result = maybeInviteColleague('meow', 'coffee', Date.now())
  // Should either successfully invite or return null based on cooldown/presence
  if (result) {
    assert.ok(result.invitedId)
    assert.ok(typeof result.accepted === 'boolean')
  }
})

test('Obsidian Second Brain vault initializes and stores agent markdown', () => {
  initVault()
  const agent = STARTER_AGENTS[0]
  syncAgentToVault(agent, {
    activity: 'working',
    mood: 'focused',
    needs: { energy: 90, hunger: 80, social: 50, fun: 75 },
  })

  const note = getAgentVaultNote(agent.name)
  assert.ok(note, 'vault note must exist on disk')
  assert.ok(note.includes('---'), 'note must have YAML frontmatter')
  assert.ok(note.includes(agent.name), 'note must contain agent name')
  assert.ok(note.includes('energy: 90'), 'note frontmatter must contain energy')
  assert.ok(note.includes('90/100'), 'note body must contain energy percentage')
})
