/**
 * SQLite persistence (Phase 1, step 8).
 *
 * The simulation runs in memory; this module is the write-through cache that
 * lets identity, appearance, tasks, lessons and last positions survive a
 * restart. Every helper is defensive: a broken database must never stop the
 * office from running.
 */
import type { Agent, Appearance, Lesson, Task } from '@hive/shared'
import { db } from './db'

interface AgentRow {
  id: string
  appearance_json: string
}

interface TaskRow {
  id: number
  agent_id: string
  prompt: string
  result: string | null
  status: Task['status']
  created_at: number
  finished_at: number | null
}

interface LessonRow {
  agent_id: string
  text: string
  created_at: number
}

interface AgentStateRow {
  agent_id: string
  x: number
  y: number
}

/** Insert starter agents that are not in the database yet (idempotent). */
export function ensureAgentRows(list: Agent[]): void {
  try {
    const insert = db.prepare(
      `INSERT OR IGNORE INTO agents
         (id, name, role, personality, rules, appearance_json, desk_x, desk_y)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const tx = db.transaction(() => {
      for (const agent of list) {
        insert.run(
          agent.id,
          agent.name,
          agent.role,
          agent.personality,
          agent.rules,
          JSON.stringify(agent.appearance),
          agent.desk.x,
          agent.desk.y,
        )
      }
    })
    tx()
  } catch {
    // Persistence is best-effort.
  }
}

/** Stored appearance per agent id, if the row exists and parses. */
export function loadAppearances(): Map<string, Appearance> {
  const result = new Map<string, Appearance>()
  try {
    const rows = db.prepare('SELECT id, appearance_json FROM agents').all() as AgentRow[]
    for (const row of rows) {
      const parsed = JSON.parse(row.appearance_json) as Partial<Appearance>
      if (
        typeof parsed.skin === 'string' &&
        typeof parsed.hair === 'string' &&
        typeof parsed.shirt === 'string' &&
        typeof parsed.pants === 'string' &&
        typeof parsed.shoes === 'string'
      ) {
        result.set(row.id, {
          skin: parsed.skin,
          hair: parsed.hair,
          shirt: parsed.shirt,
          pants: parsed.pants,
          shoes: parsed.shoes,
        })
      }
    }
  } catch {
    // ignore
  }
  return result
}

export function saveAppearance(agentId: string, appearance: Appearance): void {
  try {
    db.prepare('UPDATE agents SET appearance_json = ? WHERE id = ?').run(
      JSON.stringify(appearance),
      agentId,
    )
  } catch {
    // ignore
  }
}

export function loadTasks(): Task[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, agent_id, prompt, result, status, created_at, finished_at
         FROM tasks ORDER BY id ASC`,
      )
      .all() as TaskRow[]
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      prompt: row.prompt,
      result: row.result,
      status: row.status,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    }))
  } catch {
    return []
  }
}

export function insertTask(task: Task): void {
  try {
    db.prepare(
      `INSERT OR REPLACE INTO tasks
         (id, agent_id, prompt, result, status, created_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      task.id,
      task.agentId,
      task.prompt,
      task.result,
      task.status,
      task.createdAt,
      task.finishedAt,
    )
  } catch {
    // ignore
  }
}

export function updateTask(task: Task): void {
  insertTask(task)
}

export function loadLessons(): Lesson[] {
  try {
    const rows = db
      .prepare('SELECT agent_id, text, created_at FROM lessons ORDER BY id ASC')
      .all() as LessonRow[]
    return rows.map((row, index) => ({
      id: index + 1,
      agentId: row.agent_id,
      text: row.text,
      createdAt: row.created_at,
    }))
  } catch {
    return []
  }
}

export function insertLesson(agentId: string, text: string, createdAt: number): void {
  try {
    db.prepare('INSERT INTO lessons (agent_id, text, created_at) VALUES (?, ?, ?)').run(
      agentId,
      text,
      createdAt,
    )
  } catch {
    // ignore
  }
}

/** Last known position per agent, so a restart does not teleport everyone home. */
export function loadAgentStates(): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  try {
    const rows = db.prepare('SELECT agent_id, x, y FROM agent_state').all() as AgentStateRow[]
    for (const row of rows) {
      if (Number.isFinite(row.x) && Number.isFinite(row.y)) {
        result.set(row.agent_id, { x: row.x, y: row.y })
      }
    }
  } catch {
    // ignore
  }
  return result
}

export function saveNeeds(agentId: string, needs: { energy: number; hunger: number; social: number; fun: number }): void {
  try {
    db.prepare(
      `INSERT INTO agent_needs (agent_id, energy, hunger, social, fun, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         energy = excluded.energy, hunger = excluded.hunger,
         social = excluded.social, fun = excluded.fun, updated_at = excluded.updated_at`,
    ).run(agentId, needs.energy, needs.hunger, needs.social, needs.fun, Date.now())
  } catch {
    // ignore
  }
}

export function loadNeeds(): Map<string, { energy: number; hunger: number; social: number; fun: number }> {
  const result = new Map()
  try {
    const rows = db
      .prepare('SELECT agent_id, energy, hunger, social, fun FROM agent_needs')
      .all() as Array<{ agent_id: string; energy: number; hunger: number; social: number; fun: number }>
    for (const r of rows) {
      result.set(r.agent_id, { energy: r.energy, hunger: r.hunger, social: r.social, fun: r.fun })
    }
  } catch {
    // ignore
  }
  return result
}

export function saveTraits(agentId: string, traits: string[]): void {
  try {
    db.prepare(
      `INSERT INTO agent_traits (agent_id, traits_json) VALUES (?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET traits_json = excluded.traits_json`,
    ).run(agentId, JSON.stringify(traits))
  } catch {
    // ignore
  }
}

export function loadTraits(): Map<string, string[]> {
  const result = new Map<string, string[]>()
  try {
    const rows = db.prepare('SELECT agent_id, traits_json FROM agent_traits').all() as Array<{
      agent_id: string
      traits_json: string
    }>
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.traits_json)
        if (Array.isArray(parsed)) result.set(r.agent_id, parsed.map(String))
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return result
}

export function savePlan(agentId: string, day: number, blocks: unknown): void {
  try {
    db.prepare(
      `INSERT INTO agent_plans (agent_id, day, blocks_json) VALUES (?, ?, ?)
       ON CONFLICT(agent_id, day) DO UPDATE SET blocks_json = excluded.blocks_json`,
    ).run(agentId, day, JSON.stringify(blocks))
  } catch {
    // ignore
  }
}

export function loadPlans(): Map<string, { day: number; blocks: unknown }> {
  const result = new Map<string, { day: number; blocks: unknown }>()
  try {
    const rows = db
      .prepare('SELECT agent_id, day, blocks_json FROM agent_plans ORDER BY day DESC')
      .all() as Array<{ agent_id: string; day: number; blocks_json: string }>
    for (const r of rows) {
      if (result.has(r.agent_id)) continue // keep newest day
      try {
        result.set(r.agent_id, { day: r.day, blocks: JSON.parse(r.blocks_json) })
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return result
}

export function saveConversation(
  id: string,
  agentA: string,
  agentB: string,
  transcript: unknown,
  ts: number,
): void {
  try {
    db.prepare(
      `INSERT OR REPLACE INTO conversations (id, agent_a, agent_b, transcript_json, ts)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, agentA, agentB, JSON.stringify(transcript), ts)
  } catch {
    // ignore
  }
}

export function logUsage(
  callType: string,
  model: string,
  tokensIn = 0,
  tokensOut = 0,
): void {
  try {
    db.prepare(
      `INSERT INTO usage (call_type, model, tokens_in, tokens_out, ts) VALUES (?, ?, ?, ?, ?)`,
    ).run(callType, model, tokensIn, tokensOut, Date.now())
  } catch {
    // ignore
  }
}
export function saveAgentStates(
  states: Array<{ id: string; x: number; y: number; activity: string; activityUntil: number; mood: string }>,
): void {
  try {
    const upsert = db.prepare(
      `INSERT INTO agent_state
         (agent_id, activity, x, y, target_x, target_y, activity_until, mood)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET
         activity = excluded.activity,
         x = excluded.x,
         y = excluded.y,
         activity_until = excluded.activity_until,
         mood = excluded.mood`,
    )
    const tx = db.transaction(() => {
      for (const state of states) {
        upsert.run(
          state.id,
          state.activity,
          state.x,
          state.y,
          Math.round(state.x),
          Math.round(state.y),
          state.activityUntil,
          state.mood,
        )
      }
    })
    tx()
  } catch {
    // ignore
  }
}
