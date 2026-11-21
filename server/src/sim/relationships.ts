/**
 * Agent Relationships & Social Invitations (P3.2).
 *
 * Tracks affinity (-100 to +100) between colleagues, influenced by shared meals,
 * conversations, and mutual invitations. High affinity leads to shared lunches,
 * coffee invites, and warm banter.
 */
import type { Relationship } from '@hive/shared'
import { db } from '../db'
import { getAgent } from '../store'
import { allSims, getSim } from './state'
import { random } from './rng'

const clampAffinity = (v: number) => Math.max(-100, Math.min(100, Math.round(v)))

// In-memory cache: agentId -> (otherId -> Relationship)
const relationshipsCache = new Map<string, Map<string, Relationship>>()

export function initRelationships(): void {
  try {
    const rows = db
      .prepare('SELECT agent_id, other_id, affinity, note, updated_at FROM relationships')
      .all() as Array<{
      agent_id: string
      other_id: string
      affinity: number
      note: string | null
      updated_at: number
    }>
    for (const r of rows) {
      if (!relationshipsCache.has(r.agent_id)) {
        relationshipsCache.set(r.agent_id, new Map())
      }
      relationshipsCache.get(r.agent_id)!.set(r.other_id, {
        otherId: r.other_id,
        affinity: r.affinity,
        note: r.note ?? undefined,
        lastTalk: r.updated_at,
      })
    }
  } catch {
    // optional on initial startup
  }
}

export function getAffinity(agentId: string, otherId: string): number {
  const map = relationshipsCache.get(agentId)
  if (map && map.has(otherId)) {
    return map.get(otherId)!.affinity
  }
  // Default baseline affinity between colleagues is +15 (warm office baseline)
  return 15
}

export function adjustAffinity(
  agentId: string,
  otherId: string,
  delta: number,
  note?: string,
  now = Date.now(),
): void {
  if (agentId === otherId) return

  if (!relationshipsCache.has(agentId)) {
    relationshipsCache.set(agentId, new Map())
  }
  const map = relationshipsCache.get(agentId)!
  const current = map.get(otherId)
  const newAffinity = clampAffinity((current?.affinity ?? 15) + delta)
  const newNote = note ?? current?.note

  map.set(otherId, {
    otherId,
    affinity: newAffinity,
    note: newNote,
    lastTalk: now,
  })

  try {
    db.prepare(
      `INSERT INTO relationships (agent_id, other_id, affinity, note, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, other_id) DO UPDATE SET
         affinity = excluded.affinity,
         note = COALESCE(excluded.note, relationships.note),
         updated_at = excluded.updated_at`,
    ).run(agentId, otherId, newAffinity, newNote ?? null, now)
  } catch {
    // ignore
  }
}

export function getAgentRelationships(agentId: string): Record<string, Relationship> {
  const map = relationshipsCache.get(agentId)
  if (!map) return {}
  const res: Record<string, Relationship> = {}
  for (const [k, v] of map.entries()) res[k] = v
  return res
}

export interface InvitationResult {
  invitedId: string
  accepted: boolean
  reason: string
}

const lastInviteTime = new Map<string, number>()

/**
 * When an agent decides to have lunch or coffee, they may invite an available colleague.
 */
export function maybeInviteColleague(
  inviterId: string,
  type: 'lunch' | 'coffee',
  now = Date.now(),
): InvitationResult | null {
  const last = lastInviteTime.get(inviterId) ?? 0
  if (now - last < 40_000) return null // Cooldown on issuing invitations

  const inviterSim = getSim(inviterId)
  const inviterAgent = getAgent(inviterId)
  if (!inviterSim || !inviterAgent) return null

  // Introverts with low social desire may prefer solo meals
  const isIntrovert = inviterAgent.traits?.includes('introvert')
  if (isIntrovert && random() < 0.6) return null

  // Find candidate colleagues who are free
  const candidates = allSims()
    .filter((sim) => sim.id !== inviterId && !sim.busy && !sim.talkingWith && !sim.slotId)
    .sort((a, b) => getAffinity(inviterId, b.id) - getAffinity(inviterId, a.id))

  if (candidates.length === 0) return null
  const bestCandidate = candidates[0]
  const candidateMeta = getAgent(bestCandidate.id)
  if (!candidateMeta) return null

  const affinity = getAffinity(bestCandidate.id, inviterId)
  lastInviteTime.set(inviterId, now)

  // Invitee decides
  if (bestCandidate.activity === 'working' && candidateMeta.traits?.includes('workaholic')) {
    adjustAffinity(inviterId, bestCandidate.id, -2, `Declined ${type}: deep in focus.`, now)
    return {
      invitedId: bestCandidate.id,
      accepted: false,
      reason: `${candidateMeta.name} is heads-down in focus work.`,
    }
  }

  if (affinity < 0) {
    adjustAffinity(inviterId, bestCandidate.id, -3, `Declined ${type}: not in the mood.`, now)
    return {
      invitedId: bestCandidate.id,
      accepted: false,
      reason: `${candidateMeta.name} politely passed.`,
    }
  }

  // Accepted!
  adjustAffinity(inviterId, bestCandidate.id, +8, `Accepted ${type} invite.`, now)
  adjustAffinity(bestCandidate.id, inviterId, +8, `Shared ${type} with ${inviterAgent.name}.`, now)

  return {
    invitedId: bestCandidate.id,
    accepted: true,
    reason: `${candidateMeta.name} accepted!`,
  }
}
