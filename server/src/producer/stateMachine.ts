/**
 * Job state machine for the TikTok Content Office pipeline (brief section 8).
 *
 * One job = one product video. Transitions are validated; invalid ones are
 * rejected. Every transition writes a row to `job_events` (who, when, why)
 * and fires the pipeline event bus so the office can react (Tier C) and the
 * UI can update live (Tier A: WebSocket broadcast).
 *
 * This file is pure state logic — no file I/O, no Gemini, no WS — so the
 * whole state machine is unit-testable against a scratch database.
 */
import { db } from '../db'
import { rmSync } from 'node:fs'
import { jobDir } from '../media/storage'
import type { Job, JobEvent, JobState } from '@hive/shared'
import { emitJobEvent } from './bus'

/** Allowed transitions: from -> [to] (brief section 8 table). */
const TRANSITIONS: Record<JobState, JobState[]> = {
  intake: ['researching', 'cancelled'],
  researching: ['product_ready', 'failed', 'cancelled'],
  product_ready: ['planning', 'cancelled'],
  planning: ['brief_ready', 'failed', 'cancelled'],
  brief_ready: ['awaiting_video', 'cancelled'],
  awaiting_video: ['validating', 'cancelled'],
  validating: ['qa_review', 'awaiting_video', 'failed', 'cancelled'],
  qa_review: ['qa_passed', 'qa_fixable', 'qa_rejected', 'failed', 'cancelled'],
  qa_fixable: ['awaiting_video', 'cancelled'],
  qa_passed: ['post_kit_ready', 'cancelled'],
  qa_rejected: ['cancelled'],
  post_kit_ready: ['scheduled', 'posted', 'cancelled'],
  scheduled: ['posted', 'cancelled'],
  posted: ['done'],
  done: [],
  cancelled: [],
  failed: [],
}

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function createJob(title: string): Job {
  const now = Date.now()
  const id = `job-${now}-${Math.random().toString(36).slice(2, 7)}`
  db.prepare(`INSERT INTO jobs (id, title, state, created_at, updated_at) VALUES (?, ?, 'intake', ?, ?)`).run(id, title, now, now)
  recordEvent(id, null, 'intake', 'boss', 'Job created')
  return getJob(id)!
}

export function getJob(id: string): Job | null {
  const row = db
    .prepare(
      `SELECT id, title, state, product_id, qa_cycles, scheduled_at, posted_url,
              cancelled_reason, created_at, updated_at FROM jobs WHERE id = ?`,
    )
    .get(id)
  if (!row) return null
  return rowToJob(row as JobRow)
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    productId: row.product_id,
    qaCycles: row.qa_cycles,
    scheduledAt: row.scheduled_at,
    postedUrl: row.posted_url,
    cancelledReason: row.cancelled_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface JobRow {
  id: string
  title: string
  state: JobState
  product_id: string | null
  qa_cycles: number
  scheduled_at: number | null
  posted_url: string | null
  cancelled_reason: string | null
  created_at: number
  updated_at: number
}

export function listJobs(): Job[] {
  const rows = db
    .prepare(
      `SELECT id, title, state, product_id, qa_cycles, scheduled_at, posted_url,
              cancelled_reason, created_at, updated_at FROM jobs ORDER BY created_at DESC`,
    )
    .all() as JobRow[]
  return rows.map(rowToJob)
}

/**
 * Validate + apply + record + broadcast one transition. Throws on unknown
 * jobs and on transitions not in the table (brief 8: "Invalid transitions are
 * rejected").
 */
export function transition(jobId: string, to: JobState, actor: string, note?: string): Job {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (!canTransition(job.state, to)) {
    throw new Error(`Invalid transition ${job.state} -> ${to}`)
  }
  const now = Date.now()
  db.prepare(`UPDATE jobs SET state = ?, updated_at = ? WHERE id = ?`).run(to, now, jobId)
  recordEvent(jobId, job.state, to, actor, note)
  return getJob(jobId)!
}

/**
 * Write one job_event row and fire the event bus. Returns the stored event.
 * The bus is best-effort: a listener failure never blocks the transition.
 */
export function recordEvent(jobId: string, from: JobState | null, to: JobState, actor: string, note?: string): JobEvent {
  const ts = Date.now()
  const result = db
    .prepare(`INSERT INTO job_events (job_id, from_state, to_state, actor, note, ts) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(jobId, from, to, actor, note ?? null, ts)
  const event: JobEvent = {
    id: Number(result.lastInsertRowid),
    jobId,
    fromState: from,
    toState: to,
    actor,
    note: note ?? null,
    ts,
  }
  const job = getJob(jobId)
  if (job) emitJobEvent(event, job)
  return event
}

export function cancelJob(jobId: string, reason: string): Job {
  return transition(jobId, 'cancelled', 'boss', reason)
}

/** Permanently remove a cancelled job and its owned media. */
export function deleteCancelledJob(jobId: string): void {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'cancelled') throw new Error('Only cancelled jobs can be deleted.')
  for (const table of ['job_events', 'qa_reports', 'videos', 'briefs', 'post_kits']) {
    db.prepare(`DELETE FROM ${table} WHERE job_id = ?`).run(jobId)
  }
  const product = db.prepare('SELECT id FROM products WHERE job_id = ?').get(jobId) as { id: string } | undefined
  if (product) db.prepare('DELETE FROM product_images WHERE product_id = ?').run(product.id)
  db.prepare('DELETE FROM products WHERE job_id = ?').run(jobId)
  db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId)
  try { rmSync(jobDir(jobId), { recursive: true, force: true }) } catch { /* media cleanup is best effort */ }
}

export function setJobProduct(jobId: string, productId: string): void {
  db.prepare(`UPDATE jobs SET product_id = ?, updated_at = ? WHERE id = ?`).run(productId, Date.now(), jobId)
}

/** QA cycles are consumed by a QA run, not by an upload. */
export function incrementQaCycles(jobId: string): number {
  const job = getJob(jobId)
  if (!job) return 0
  const next = job.qaCycles + 1
  db.prepare(`UPDATE jobs SET qa_cycles = ?, updated_at = ? WHERE id = ?`).run(next, Date.now(), jobId)
  return next
}

export function setScheduled(jobId: string, at: number): Job {
  db.prepare(`UPDATE jobs SET scheduled_at = ?, updated_at = ? WHERE id = ?`).run(at, Date.now(), jobId)
  return transition(jobId, 'scheduled', 'boss', `Scheduled for ${new Date(at).toISOString()}`)
}

export function markPosted(jobId: string, url: string): Job {
  db.prepare(`UPDATE jobs SET posted_url = ?, updated_at = ? WHERE id = ?`).run(url, Date.now(), jobId)
  transition(jobId, 'posted', 'boss', url)
  return transition(jobId, 'done', 'boss', 'Marked posted (G4)')
}

/** All events for a job, oldest first (the History tab). */
export function getJobEvents(jobId: string): JobEvent[] {
  const rows = db
    .prepare(`SELECT id, job_id, from_state, to_state, actor, note, ts FROM job_events WHERE job_id = ? ORDER BY ts ASC, id ASC`)
    .all(jobId) as Array<{
    id: number
    job_id: string
    from_state: JobState | null
    to_state: JobState
    actor: string
    note: string | null
    ts: number
  }>
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    fromState: r.from_state,
    toState: r.to_state,
    actor: r.actor,
    note: r.note,
    ts: r.ts,
  }))
}
