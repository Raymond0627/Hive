/**
 * Pipeline stage orchestration (the "Producer", brief section 9.7 — mostly
 * code, light persona).
 *
 * Every function here is one pipeline action with plain-language errors: the
 * route layer turns a thrown Error into a 4xx whose body carries the message.
 * Stage outputs (Tier A: fakes, Tier B: Gemini + Zod) are written to SQLite;
 * files live under DATA_DIR/jobs/<id>/ (media/storage.ts).
 *
 * Idempotency rule (brief section 5): re-running a stage replaces its output
 * and keeps history — `products`, `briefs` and `post_kits` are 1:1 per job
 * (upsert), `videos` and `qa_reports` keep every version.
 */
import { db } from '../db'
import { readFileSync } from 'node:fs'
import type {
  Job,
  JobDetail,
  PostKit,
  ProductCard,
  ProductImage,
  ProbeResult,
  ProbeVerdict,
  QAVerdict,
  QAReport,
  VideoBrief,
} from '@hive/shared'
import {
  getJob,
  getJobEvents,
  incrementQaCycles,
  markPosted,
  recordEvent,
  setJobProduct,
  setScheduled,
  transition,
} from './stateMachine'
import { enqueueStage } from './queue'
import { fakeProductCard, type ProductIntakeInput } from './fakes'
import { getSettings } from '../settings'
import { probeMedia } from '../media/probe'
import { checksFromSettings, judgeProbe } from '../media/validation'
import { runSoftFilters } from '../media/filters'
import { extractFrames } from '../media/frames'
import { normalizeVideo } from '../media/normalize'
import { listJobFiles, safeJobPath } from '../media/storage'
import type { ImageInfo } from '../media/imageInfo'
import { researchProduct, type ScoutInput } from './scout'
import { getCheapModel } from '../agents/gemini'
import { logUsage } from '../persistence'
import { planVideo } from './planner'
import { visionQA } from './qaVision'
import { createPostKit } from './publisher'

// ── Job detail aggregate (GET /api/jobs/:id, the Drawer) ────────────────────

interface VideoRow {
  id: string
  job_id: string
  version: number
  path: string
  probe_json: string | null
  frames_dir: string | null
  created_at: number
}

function latestVideo(jobId: string): VideoRow | null {
  const row = db
    .prepare(
      `SELECT id, job_id, version, path, probe_json, frames_dir, created_at
       FROM videos WHERE job_id = ? ORDER BY version DESC LIMIT 1`,
    )
    .get(jobId) as VideoRow | undefined
  return row ?? null
}

function videoToJobVideo(jobId: string, row: VideoRow): JobDetail['video'] {
  let probe: ProbeResult | null = null
  try {
    probe = row.probe_json ? (JSON.parse(row.probe_json) as ProbeResult) : null
  } catch {
    probe = null
  }
  const verdict = probe ? judgeProbe(probe, checksFromSettings(getSettings())) : null

  // `frames_dir` is server-written (frames/vN); listJobFiles just path-joins
  // it under the job folder, so these refs stay valid across re-uploads.
  const framesDir = row.frames_dir ?? `frames/v${row.version}`
  const coversDir = `covers/v${row.version}`
  const frames = listJobFiles(jobId, framesDir).filter((f) => f.endsWith('.jpg')).map((f) => `${framesDir}/${f}`)
  const covers = listJobFiles(jobId, coversDir).filter((f) => f.endsWith('.jpg')).map((f) => `${coversDir}/${f}`)

  return {
    id: row.id,
    version: row.version,
    url: `/api/jobs/${encodeURIComponent(jobId)}/media/${row.path}`,
    probe,
    verdict,
    frames,
    covers,
    createdAt: row.created_at,
  }
}

function latestProduct(jobId: string): { id: string; card: ProductCard } | null {
  const row = db
    .prepare(`SELECT id, card_json FROM products WHERE job_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(jobId) as { id: string; card_json: string } | undefined
  if (!row) return null
  try {
    return { id: row.id, card: JSON.parse(row.card_json) as ProductCard }
  } catch {
    return null
  }
}

function latestBrief(jobId: string): { brief: VideoBrief; version: number; createdAt: number } | null {
  const row = db
    .prepare(`SELECT version, brief_json, created_at FROM briefs WHERE job_id = ? ORDER BY version DESC LIMIT 1`)
    .get(jobId) as { version: number; brief_json: string; created_at: number } | undefined
  if (!row) return null
  try {
    return { brief: JSON.parse(row.brief_json) as VideoBrief, version: row.version, createdAt: row.created_at }
  } catch {
    return null
  }
}

function latestQA(jobId: string): JobDetail['qa'] {
  const row = db
    .prepare(`SELECT report_json, verdict, score, created_at FROM qa_reports WHERE job_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(jobId) as { report_json: string; verdict: string; score: number; created_at: number } | undefined
  if (!row) return null
  try {
    return { report: JSON.parse(row.report_json) as QAReport, verdict: row.verdict, score: row.score, createdAt: row.created_at }
  } catch {
    return null
  }
}

function latestPostKit(jobId: string): JobDetail['postKit'] {
  const row = db
    .prepare(`SELECT kit_json, approved_at, adapter FROM post_kits WHERE job_id = ? ORDER BY rowid DESC LIMIT 1`)
    .get(jobId) as { kit_json: string; approved_at: number | null; adapter: string } | undefined
  if (!row) return null
  try {
    return { kit: JSON.parse(row.kit_json) as PostKit, approvedAt: row.approved_at, adapter: row.adapter }
  } catch {
    return null
  }
}

export function buildJobDetail(jobId: string): JobDetail | null {
  const job = getJob(jobId)
  if (!job) return null
  const product = latestProduct(jobId)
  const images = product
    ? (
        db
          .prepare(
            `SELECT id, product_id, path, source, hash, width, height, angle, quality
             FROM product_images WHERE product_id = ? ORDER BY rowid`,
          )
          .all(product.id) as Array<{
          id: string
          product_id: string
          path: string
          source: string
          hash: string
          width: number
          height: number
          angle: string | null
          quality: number
        }>
      ).map<ProductImage>((r) => ({
        id: r.id,
        path: r.path,
        source: r.source,
        hash: r.hash,
        width: r.width,
        height: r.height,
        angle: r.angle,
        quality: r.quality,
      }))
    : []
  const videoRow = latestVideo(jobId)
  return {
    job,
    product: product || images.length > 0 ? { card: product?.card ?? null, images } : null,
    brief: latestBrief(jobId),
    video: videoRow ? videoToJobVideo(jobId, videoRow) : null,
    qa: latestQA(jobId),
    postKit: latestPostKit(jobId),
    events: getJobEvents(jobId),
  }
}

// ── Stage actions ───────────────────────────────────────────────────────────

/** Scout intake: store (fake) product card; job intake → researching. */
export function intakeProduct(jobId: string, input: ProductIntakeInput): Job {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'intake' && job.state !== 'researching') {
    throw new Error(`Product intake is only possible from intake or researching (job is ${job.state}).`)
  }
  const from = job.state
  if (job.state === 'intake') {
    transition(jobId, 'researching', 'boss', 'Product intake started (G0)')
  }
  const now = Date.now()
  const productId = `prod-${jobId}`
  const card = fakeProductCard(productId, job.title, input)
  db.prepare(
    `INSERT INTO products (id, job_id, card_json, source_url, affiliate_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET card_json = excluded.card_json, source_url = excluded.source_url`,
  ).run(productId, jobId, JSON.stringify(card), card.sourceUrl, card.affiliateUrl, now)
  setJobProduct(jobId, productId)
  recordEvent(jobId, from, 'researching', 'meow', 'Product card saved (FAKE Scout output, Tier A)')
  return getJob(jobId)!
}

/** Tier B Scout: real Gemini analysis of Boss-supplied listing data. */
export async function researchProductWithGemini(jobId: string, input: ScoutInput): Promise<{ job: Job; product: ProductCard }> {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'intake' && job.state !== 'researching') {
    throw new Error(`Scout research is only possible from intake or researching (job is ${job.state}).`)
  }
  if (!input.title.trim() || !input.listingText.trim()) throw new Error('Scout needs a product title and listing text.')
  if (job.state === 'intake') transition(jobId, 'researching', 'boss', 'Scout research started')

  const productId = `prod-${jobId}`
  const product = await enqueueStage('scout', async () => {
    const result = await researchProduct(productId, input)
    logUsage('scout_analyze', getCheapModel())
    db.prepare(
      `INSERT INTO products (id, job_id, card_json, source_url, affiliate_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET card_json = excluded.card_json,
         source_url = excluded.source_url, affiliate_url = excluded.affiliate_url`,
    ).run(productId, jobId, JSON.stringify(result), result.sourceUrl, result.affiliateUrl, Date.now())
    setJobProduct(jobId, productId)
    recordEvent(jobId, 'researching', 'researching', 'scout', 'Product Card generated by Gemini (Scout)')
    return result
  })
  return { job: getJob(jobId)!, product }
}

/** Rejected product card helper: the fake Scout has nothing to invent. */
export function emptyProductCard(jobId: string, title: string): ProductCard {
  return {
    productId: `prod-${jobId}`,
    title,
    category: 'other',
    sourceUrl: null,
    affiliateUrl: null,
    price: null,
    currency: null,
    colors: [],
    sizes: [],
    materialsListed: [],
    listingClaims: [],
    sellingPoints: [],
    targetAudience: 'No product card stored yet',
    season: null,
    hookIdeas: [],
    riskFlags: [],
    scores: null,
    dataConfidence: 'inferred',
    notes: 'No product card stored yet',
  }
}

/**
 * Store one uploaded product image. The caller already saved the file into
 * the job's images/ folder and read it with imageInfo(); this enforces the
 * Scout rules (brief 9.1): short side >= 800px, de-duplicate by hash,
 * store the source for rights tracking.
 */
export function storeProductImage(jobId: string, fileName: string, info: ImageInfo, source: string): ProductImage {
  const shortSide = Math.min(info.width, info.height)
  if (shortSide < 800) {
    throw new Error(`Image rejected: ${info.width}x${info.height} — the short side must be at least 800px.`)
  }
  const existing = db.prepare(`SELECT hash FROM product_images WHERE path = ?`).get(`images/${fileName}`) as
    | { hash: string }
    | undefined
  if (existing && existing.hash === info.hash) {
    throw new Error('Image rejected: an identical image is already attached (duplicate hash).')
  }
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const quality = Math.min(100, Math.round((shortSide / 2000) * 100))
  db.prepare(
    `INSERT INTO product_images (id, product_id, path, source, hash, width, height, angle, quality)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(id, `prod-${jobId}`, `images/${fileName}`, source || 'boss-upload', info.hash, info.width, info.height, quality)
  recordEvent(jobId, getJob(jobId)!.state, getJob(jobId)!.state, 'meow', `Product image stored: ${fileName} (${info.width}x${info.height})`)
  return {
    id,
    path: `images/${fileName}`,
    source: source || 'boss-upload',
    hash: info.hash,
    width: info.width,
    height: info.height,
    angle: null,
    quality,
  }
}

export interface UploadResult {
  job: Job
  version: number
  verdict: ProbeVerdict
  ok: boolean
}

/** Summarize the verdict AFTER soft-filter warnings were appended. */
function withSoftWarnings(verdict: ProbeVerdict, warnings: ProbeVerdict['warnings']): ProbeVerdict {
  const all = [...verdict.warnings, ...warnings]
  if (verdict.ok) {
    return {
      ...verdict,
      warnings: all,
      summary: all.length ? `Video accepted with ${all.length} warning(s).` : 'Video passed all technical checks.',
    }
  }
  return { ...verdict, warnings: all }
}

/**
 * G2: the boss uploads the finished video. Runs the full deterministic
 * pipeline (probe → hard/soft checks → frame extraction) and drives the
 * machine: awaiting_video → validating → qa_review (ok) or back to
 * awaiting_video (failed — the file is kept as evidence and job_events says
 * why, per brief 9.4 "Failures return a plain-language message, and the job
 * stays in awaiting_video").
 */
export async function uploadVideo(jobId: string, savedRelativePath: string, originalName: string, version: number): Promise<UploadResult> {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'awaiting_video' && job.state !== 'validating') {
    throw new Error(`A video can only be uploaded from awaiting_video (job is ${job.state}).`)
  }
  const checks = checksFromSettings(getSettings())
  const absolute = safeJobPath(jobId, savedRelativePath)

  return enqueueStage('validate', async () => {
    const probe = await probeMedia(absolute)
    let verdict = judgeProbe(probe, checks)
    if (verdict.ok) {
      verdict = withSoftWarnings(verdict, await runSoftFilters(absolute, probe.audio?.present ?? false))
      await extractFrames(jobId, absolute, version, probe.format.duration ?? 0)
      db.prepare(
        `INSERT INTO videos (id, job_id, version, path, probe_json, frames_dir, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(`vid-${jobId}-${version}`, jobId, version, savedRelativePath, JSON.stringify(probe), `frames/v${version}`, Date.now())
      if (getJob(jobId)?.state === 'awaiting_video') {
        transition(jobId, 'validating', 'boss', `Video v${version} uploaded (${originalName})`)
      }
      transition(jobId, 'qa_review', 'producer', verdict.summary)
    } else {
      db.prepare(
        `INSERT INTO videos (id, job_id, version, path, probe_json, frames_dir, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(`vid-${jobId}-${version}`, jobId, version, savedRelativePath, JSON.stringify(probe), null, Date.now())
      if (getJob(jobId)?.state === 'awaiting_video') {
        transition(jobId, 'validating', 'boss', `Video v${version} uploaded (${originalName})`)
      }
      transition(jobId, 'awaiting_video', 'producer', `Validation failed: ${verdict.summary}`)
    }
    return { job: getJob(jobId)!, version, verdict, ok: verdict.ok }
  })
}

/**
 * Optional normalize (brief 9.4): re-encode the latest video to H.264
 * 1080x1920, re-validate, keep history. Never automatic — reachable only
 * from the explicit button.
 */
export async function normalizeLatestVideo(jobId: string): Promise<UploadResult> {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  const latest = latestVideo(jobId)
  if (!latest) throw new Error('No video to normalise yet.')
  const version = latest.version + 1
  const input = safeJobPath(jobId, latest.path)
  const outName = `normalized-v${version}.mp4`
  const relative = `exports/${outName}`
  const checks = checksFromSettings(getSettings())

  return enqueueStage('normalize', async () => {
    const outPath = await normalizeVideo(jobId, input, outName)
    const probe = await probeMedia(outPath)
    let verdict = judgeProbe(probe, checks)
    if (verdict.ok) {
      verdict = withSoftWarnings(verdict, await runSoftFilters(outPath, probe.audio?.present ?? false))
      verdict = { ...verdict, summary: `Normalised to v${version}: ${verdict.summary}` }
      await extractFrames(jobId, outPath, version, probe.format.duration ?? 0)
      db.prepare(
        `INSERT INTO videos (id, job_id, version, path, probe_json, frames_dir, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(`vid-${jobId}-${version}`, jobId, version, relative, JSON.stringify(probe), `frames/v${version}`, Date.now())
    } else {
      verdict = { ...verdict, summary: `Normalised to v${version}, still fails: ${verdict.summary}` }
      db.prepare(
        `INSERT INTO videos (id, job_id, version, path, probe_json, frames_dir, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(`vid-${jobId}-${version}`, jobId, version, relative, JSON.stringify(probe), null, Date.now())
    }

    if (job.state === 'awaiting_video' || job.state === 'validating') {
      transition(jobId, 'validating', 'boss', `Normalised video v${version} (H.264 1080x1920)`)
      transition(jobId, verdict.ok ? 'qa_review' : 'awaiting_video', 'producer', verdict.summary)
    } else {
      // Job already past validation: a new video version simply replaces the
      // one QA will look at; the log explains what happened.
      recordEvent(jobId, job.state, job.state, 'producer', verdict.summary)
    }
    return { job: getJob(jobId)!, version, verdict, ok: verdict.ok }
  })
}

/**
 * QA stage. Deterministic technical checks are REAL and Gemini reviews the
 * extracted frames. Hard technical failures can never be overridden.
 */
export async function runQA(
  jobId: string,
  _requested?: QAVerdict,
): Promise<{ job: Job; report: QAReport; cycle: number; forced: boolean }> {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'qa_review') {
    throw new Error(`QA can only run from qa_review (job is ${job.state}).`)
  }
  const videoRow = latestVideo(jobId)
  if (!videoRow) throw new Error('No validated video to QA yet.')

  let probe: ProbeResult | null = null
  try {
    probe = videoRow.probe_json ? (JSON.parse(videoRow.probe_json) as ProbeResult) : null
  } catch {
    probe = null
  }
  if (!probe) throw new Error('Stored probe result is missing or unreadable.')
  const verdict = judgeProbe(probe, checksFromSettings(getSettings()))

  const framesDir = videoRow.frames_dir ?? `frames/v${videoRow.version}`
  const frames = listJobFiles(jobId, framesDir)
    .filter((f) => f.endsWith('.jpg'))
    .map((f) => `${framesDir}/${f}`)
    .slice(0, 20) // brief section 10: max 20 frames per call

  return enqueueStage('qa', async () => {
    const imageRefs = frames.slice(0, 8)
    const images = imageRefs.map((ref) => ({ mimeType: 'image/jpeg' as const, data: readFileSync(safeJobPath(jobId, ref)).toString('base64') }))
    const report = await visionQA(verdict, images, imageRefs)
    logUsage('qa_vision', getCheapModel())
    const cycle = incrementQaCycles(jobId)
    const limit = getSettings().maxQaCycles
    const overLimit = cycle >= limit && report.verdict !== 'pass'
    const to: Job['state'] = overLimit
      ? 'qa_rejected'
      : report.verdict === 'pass'
        ? 'qa_passed'
        : report.verdict === 'fixable'
          ? 'qa_fixable'
          : 'qa_rejected'
    const note = overLimit
      ? `QA cycle ${cycle}/${limit} used — limit reached, flagged for Boss (Gemini vision)`
      : `QA v${videoRow.version}: ${report.verdict}, score ${report.score}${verdict.hardFailures.length ? ' — technical failure enforced' : ''} (Gemini vision)`
    transition(jobId, to, 'qa', note)
    db.prepare(
      `INSERT INTO qa_reports (id, job_id, video_id, report_json, verdict, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      jobId,
      videoRow.id,
      JSON.stringify(report),
      report.verdict,
      report.score,
      Date.now(),
    )
    return { job: getJob(jobId)!, report, cycle, forced: verdict.hardFailures.length > 0 }
  })
}

/** Publisher stage (Gemini Post Kit). Posting remains manual. */
export async function generatePostKit(jobId: string): Promise<Job> {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'qa_passed' && job.state !== 'post_kit_ready') {
    throw new Error(`Post Kit is only produced from qa_passed or post_kit_ready (job is ${job.state}).`)
  }
  if (latestPostKit(jobId)?.kit) {
    recordEvent(jobId, job.state, job.state, 'aiz', 'Post Kit already exists — kept, not regenerated')
    return job
  }
  const product = latestProduct(jobId)?.card ?? emptyProductCard(jobId, job.title)
  const brief = latestBrief(jobId)?.brief ?? null
  let duration = 6
  const video = latestVideo(jobId)
  try {
    if (video?.probe_json) duration = (JSON.parse(video.probe_json) as ProbeResult).format?.duration ?? 6
  } catch {
    // keep default
  }
  const settings = getSettings()
  const kit = await createPostKit(product, brief, duration, settings.postingWindows, settings.timezone)
  logUsage('publish_copy', getCheapModel())
  db.prepare(`INSERT INTO post_kits (id, job_id, kit_json, approved_at, adapter) VALUES (?, ?, ?, NULL, 'manual')`).run(
    `pk-${jobId}-${Date.now()}`,
    jobId,
    JSON.stringify(kit),
  )
  recordEvent(jobId, job.state, job.state, 'publisher', 'Post Kit generated by Gemini. Human-in-the-loop: Boss posts, never the office')
  return getJob(jobId)!
}

/**
 * Transition hooks: entering a stage produces its first output if none
 * exists yet (keep-history rule: existing outputs are never overwritten by a
 * state change).
 */
export async function afterTransitionTo(jobId: string, to: string): Promise<void> {
  if (to === 'brief_ready' && !latestBrief(jobId)) {
    const job = getJob(jobId)
    const product = latestProduct(jobId)?.card ?? (job ? emptyProductCard(jobId, job.title) : emptyProductCard(jobId, 'product'))
    const brief = await planVideo(product)
    logUsage('scene_plan', getCheapModel())
    const version = ((db.prepare(`SELECT MAX(version) AS v FROM briefs WHERE job_id = ?`).get(jobId) as { v: number | null })?.v ?? 0) + 1
    db.prepare(
      `INSERT INTO briefs (id, job_id, version, brief_json, prompt_version, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(`brief-${jobId}-${version}`, jobId, version, JSON.stringify(brief), 'gemini-v1', Date.now())
    const currentState = job?.state ?? 'brief_ready'
    recordEvent(jobId, currentState, currentState, 'planner', `Video Brief v${version} generated by Gemini`)
    return
  }
  if (to === 'post_kit_ready') {
    // G3 boundary: the Publisher prepares the kit the moment the boss moves
    // the job here. generatePostKit is idempotent.
    try {
        await generatePostKit(jobId)
    } catch {
      // not in a kit-able state (e.g. called from a weird state); the
      // explicit button in the Drawer still works
    }
  }
}

/** G3 follow-up: pick a post time (the scheduler itself is Tier B). */
export function scheduleJob(jobId: string, at: number): Job {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (!Number.isFinite(at) || at <= Date.now()) {
    throw new Error('Schedule time must be in the future.')
  }
  return setScheduled(jobId, at)
}

/** G4: the boss pastes the live URL after posting manually. */
export function markJobPosted(jobId: string, url: string): Job {
  const job = getJob(jobId)
  if (!job) throw new Error(`Unknown job ${jobId}`)
  if (job.state !== 'post_kit_ready' && job.state !== 'scheduled') {
    throw new Error(`A job can only be marked posted from post_kit_ready or scheduled (job is ${job.state}).`)
  }
  return markPosted(jobId, url.trim())
}
