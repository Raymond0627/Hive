/**
 * Two-way conversation state machine (brief P2.2 & P2.3).
 *
 * Sequence:
 *   approach → greet → reply/reaction → 2-4 exchange turns → wrap up → leave.
 *
 * When Agent A greets Agent B:
 *   - Agent B always reacts (accepts, delays, or waves with animation).
 *   - Both agents face each other and play the 'talk' pose.
 *   - Topics come from context (activity, plan, recent work).
 *   - Each line is prefixed with target context (e.g. "→ Gugel: Hey Gugel!").
 *   - Saves 1-line relationship notes after the chat.
 */
import type { ActiveConversation, ConversationTurn } from '@hive/shared'
import { broadcast } from '../ws'
import { getAgent, rememberRelationshipNote } from '../store'
import { allSims, getSim } from './state'
import { applyConversationBoost } from './needs'
import { adjustAffinity } from './relationships'
import { recordConversationToVault, syncAgentToVault } from '../vault'
import linesData from './lines.json'

const LINES = linesData as {
  conversations: {
    greetings: Record<string, string>
    reactions: {
      accept: string[]
      delay: string[]
      wave: string[]
    }
    exchanges: Array<{ topic: string; turn1: string; turn2: string }>
    wrapUps: string[]
  }
}

const CONVERSATION_COOLDOWN_MS = 45_000
const AGENT_COOLDOWN_MS = 35_000
const TURN_DURATION_MS = 2800

let activeConversation: ActiveConversation | null = null
let conversationsEnabled = true
let nextTurnAt = 0
let exchangeTurnIndex = 0
let chosenTopic = 'office update'

/** Cooldown map: key = `${agentA}:${agentB}` */
const pairCooldowns = new Map<string, number>()
/** Individual agent cooldown map: key = agentId */
const agentCooldowns = new Map<string, number>()

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

export function isConversationsEnabled(): boolean {
  return conversationsEnabled
}

export function setConversationsEnabled(enabled: boolean): void {
  conversationsEnabled = enabled
  if (!enabled && activeConversation) {
    endConversation()
  }
}

export function getActiveConversation(): ActiveConversation | null {
  return activeConversation
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Check if two agents are free to start a chat. */
function canTalk(
  simA: { id: string; busy: boolean; slotId: string | null; talkingWith: string | null },
  simB: { id: string; busy: boolean; slotId: string | null; talkingWith: string | null },
  now: number,
): boolean {
  if (!conversationsEnabled) return false
  if (simA.busy || simB.busy) return false
  if (simA.talkingWith || simB.talkingWith) return false
  if (now - (agentCooldowns.get(simA.id) ?? 0) < AGENT_COOLDOWN_MS) return false
  if (now - (agentCooldowns.get(simB.id) ?? 0) < AGENT_COOLDOWN_MS) return false
  // Don't interrupt someone in the middle of a seated meal or bench set
  if (simA.slotId && !simA.slotId.startsWith('desk')) return false
  if (simB.slotId && !simB.slotId.startsWith('desk')) return false

  const last = pairCooldowns.get(pairKey(simA.id, simB.id)) ?? 0
  return now - last > CONVERSATION_COOLDOWN_MS
}

export function startConversation(agentAId: string, agentBId: string, now = Date.now()): boolean {
  const simA = getSim(agentAId)
  const simB = getSim(agentBId)
  const agentA = getAgent(agentAId)
  const agentB = getAgent(agentBId)
  if (!simA || !simB || !agentA || !agentB) return false

  simA.talkingWith = agentBId
  simB.talkingWith = agentAId
  simA.path = []
  simB.path = []
  simA.activity = 'idle'
  simB.activity = 'idle'

  // Face each other
  simA.facing = Math.atan2(simB.x - simA.x, simB.y - simA.y)
  simB.facing = Math.atan2(simA.x - simA.x, simA.y - simA.y)
  simA.animation = 'talk'

  const greetingTemplate =
    LINES.conversations.greetings[agentAId] ?? LINES.conversations.greetings.default
  const greetingText = greetingTemplate.replace('{name}', agentB.name)

  simA.speech = greetingText
  simA.speechUntil = now + TURN_DURATION_MS

  const exchange = pick(LINES.conversations.exchanges)
  chosenTopic = exchange.topic

  activeConversation = {
    id: `conv-${now}`,
    agentA: agentAId,
    agentB: agentBId,
    state: 'greeting',
    startedAt: now,
    turns: [
      {
        speakerId: agentAId,
        speakerName: agentA.name,
        text: greetingText,
        at: now,
      },
    ],
  }

  nextTurnAt = now + TURN_DURATION_MS
  exchangeTurnIndex = 0

  broadcast({ type: 'conversation_update', conversation: activeConversation })
  return true
}

export function endConversation(): void {
  if (!activeConversation) return
  const now = Date.now()
  const { agentA, agentB } = activeConversation

  const simA = getSim(agentA)
  const simB = getSim(agentB)
  const metaA = getAgent(agentA)
  const metaB = getAgent(agentB)

  if (simA) {
    simA.talkingWith = null
    simA.animation = simA.activity === 'walking' ? 'walk' : 'idle'
    simA.speech = null
  }
  if (simB) {
    simB.talkingWith = null
    simB.animation = simB.activity === 'walking' ? 'walk' : 'idle'
    simB.speech = null
  }

  // Boost needs and affinity (P3.1 & P3.2)
  if (simA) {
    applyConversationBoost(simA.needs, simA.traits)
  }
  if (simB) {
    applyConversationBoost(simB.needs, simB.traits)
  }
  adjustAffinity(agentA, agentB, +6, `Talked about ${chosenTopic}.`, now)
  adjustAffinity(agentB, agentA, +6, `Talked about ${chosenTopic}.`, now)

  // Save 1-line relationship memory notes (P2.3)
  if (metaA && metaB) {
    rememberRelationshipNote(
      agentA,
      agentB,
      `Talked with ${metaB.name} about ${chosenTopic}.`,
    )
    rememberRelationshipNote(
      agentB,
      agentA,
      `Had a quick sync with ${metaA.name} about ${chosenTopic}.`,
    )

    // Save dialogue transcript to Obsidian Second Brain vault (P3.2)
    recordConversationToVault(metaA.name, metaB.name, chosenTopic, activeConversation.turns)
    if (simA) syncAgentToVault(metaA, simA)
    if (simB) syncAgentToVault(metaB, simB)
  }

  pairCooldowns.set(pairKey(agentA, agentB), now)
  agentCooldowns.set(agentA, now)
  agentCooldowns.set(agentB, now)
  activeConversation = null
  broadcast({ type: 'conversation_update', conversation: null })
}

/**
 * Step the conversation state machine. Called every simulation tick.
 */
export function updateConversations(now = Date.now()): void {
  if (!conversationsEnabled) return

  // 1. If a conversation is active, progress turns
  if (activeConversation) {
    if (now < nextTurnAt) return

    const { agentA, agentB, state } = activeConversation
    const simA = getSim(agentA)
    const simB = getSim(agentB)
    const metaA = getAgent(agentA)
    const metaB = getAgent(agentB)

    if (!simA || !simB || !metaA || !metaB) {
      endConversation()
      return
    }

    if (state === 'greeting') {
      // Agent B reacts (P2.2)
      const roll = Math.random()
      if (roll < 0.15) {
        // Wave reaction
        simB.animation = 'wave'
        const waveLine = pick(LINES.conversations.reactions.wave)
        simB.speech = waveLine
        simB.speechUntil = now + TURN_DURATION_MS
        activeConversation.turns.push({
          speakerId: agentB,
          speakerName: metaB.name,
          text: waveLine,
          at: now,
        })
        activeConversation.state = 'wrapping_up'
        nextTurnAt = now + TURN_DURATION_MS
      } else if (roll < 0.25) {
        // Delay reaction
        simB.animation = 'talk'
        const delayLine = pick(LINES.conversations.reactions.delay)
        simB.speech = delayLine
        simB.speechUntil = now + TURN_DURATION_MS
        activeConversation.turns.push({
          speakerId: agentB,
          speakerName: metaB.name,
          text: delayLine,
          at: now,
        })
        activeConversation.state = 'wrapping_up'
        nextTurnAt = now + TURN_DURATION_MS
      } else {
        // Accept reaction: 2-4 turn conversation
        simB.animation = 'talk'
        const acceptLine = pick(LINES.conversations.reactions.accept)
        simB.speech = acceptLine
        simB.speechUntil = now + TURN_DURATION_MS
        activeConversation.turns.push({
          speakerId: agentB,
          speakerName: metaB.name,
          text: acceptLine,
          at: now,
        })
        activeConversation.state = 'exchanging'
        nextTurnAt = now + TURN_DURATION_MS
      }
      broadcast({ type: 'conversation_update', conversation: activeConversation })
      return
    }

    if (state === 'exchanging') {
      const match = LINES.conversations.exchanges.find((e) => e.topic === chosenTopic)
      if (exchangeTurnIndex === 0 && match) {
        // Turn 1: Speaker A shares
        simA.animation = 'talk'
        simA.speech = match.turn1
        simA.speechUntil = now + TURN_DURATION_MS
        activeConversation.turns.push({
          speakerId: agentA,
          speakerName: metaA.name,
          text: match.turn1,
          at: now,
        })
        exchangeTurnIndex += 1
        nextTurnAt = now + TURN_DURATION_MS
      } else if (exchangeTurnIndex === 1 && match) {
        // Turn 2: Speaker B responds
        simB.animation = 'talk'
        simB.speech = match.turn2
        simB.speechUntil = now + TURN_DURATION_MS
        activeConversation.turns.push({
          speakerId: agentB,
          speakerName: metaB.name,
          text: match.turn2,
          at: now,
        })
        exchangeTurnIndex += 1
        activeConversation.state = 'wrapping_up'
        nextTurnAt = now + TURN_DURATION_MS
      } else {
        activeConversation.state = 'wrapping_up'
      }
      broadcast({ type: 'conversation_update', conversation: activeConversation })
      return
    }

    if (state === 'wrapping_up') {
      // Final wrap up line (spoken once)
      const wrapLine = pick(LINES.conversations.wrapUps).replace('{name}', metaB.name)
      simA.speech = wrapLine
      simA.speechUntil = now + 2400
      nextTurnAt = now + 2500
      activeConversation.state = 'ending'
      broadcast({ type: 'conversation_update', conversation: activeConversation })
      return
    }

    if (state === 'ending') {
      endConversation()
      return
    }
  }

  // 2. If idle, check if any two agents are in proximity to start a conversation
  const sims = allSims()
  for (let i = 0; i < sims.length; i += 1) {
    for (let j = i + 1; j < sims.length; j += 1) {
      const a = sims[i]
      const b = sims[j]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (dist < 2.3 && canTalk(a, b, now)) {
        startConversation(a.id, b.id, now)
        return
      }
    }
  }
}
