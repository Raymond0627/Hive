/**
 * TikTok Content Office pipeline types (Phase 1 brief, sections 8-9).
 *
 * One job = one product video. The server owns the state machine; the client
 * renders job state. Agent outputs (ProductCard, VideoBrief, QAReport,
 * PostKit) are structured JSON validated on the server (Zod) in Tier B.
 */

export type JobState =
  | 'intake'
  | 'researching'
  | 'product_ready'
  | 'planning'
  | 'brief_ready'
  | 'awaiting_video'
  | 'validating'
  | 'qa_review'
  | 'qa_fixable'
  | 'qa_passed'
  | 'qa_rejected'
  | 'post_kit_ready'
  | 'scheduled'
  | 'posted'
  | 'done'
  | 'cancelled'
  | 'failed'

/** A single job and its mutable fields (persisted in `jobs`). */
export interface Job {
  id: string
  title: string
  state: JobState
  productId: string | null
  /** How many QA cycles this job has used (max 3). */
  qaCycles: number
  scheduledAt: number | null
  postedUrl: string | null
  cancelledReason: string | null
  createdAt: number
  updatedAt: number
}

/** One row in `job_events`: who, when, why. Every transition writes one. */
export interface JobEvent {
  id: number
  jobId: string
  fromState: JobState | null
  toState: JobState
  /** 'boss' | 'pipeline' | 'producer' or an agent id. */
  actor: string
  note: string | null
  ts: number
}

// ── Scout: Product Card (brief 9.1) ──────────────────────────────────────────

export type ProductCategory = 'shorts' | 'dress' | 'top' | 'skirt' | 'set' | 'other'

export interface ProductImage {
  id: string
  path: string
  /** Where the image came from (rights tracking). */
  source: string
  hash: string
  width: number
  height: number
  angle: string | null
  quality: number
}

export interface ProductScores {
  visualAppeal: number
  priceFit: number
  demandSignal: number
  risk: number
}

export interface ProductCard {
  productId: string
  title: string
  category: ProductCategory
  sourceUrl: string | null
  affiliateUrl: string | null
  price: number | null
  currency: string | null
  colors: string[]
  sizes: string[]
  materialsListed: string[]
  /** Copied verbatim from the listing, never invented. */
  listingClaims: string[]
  sellingPoints: string[]
  targetAudience: string
  season: string | null
  /** No unsupported claims. */
  hookIdeas: string[]
  riskFlags: string[]
  scores: ProductScores | null
  /** 'listing' | 'inferred' — Tier A intake is always 'listing'. */
  dataConfidence: 'listing' | 'inferred'
  notes: string
}

// ── Planner: Video Brief (brief 9.2) ─────────────────────────────────────────

export interface BriefShot {
  shotId: string
  sourceImage: string | null
  description: string
  /** slow push-in, pan, orbit, fabric close-up … */
  cameraMotion: string
  /** No people: hanger, mannequin, rail, flat lay. */
  setting: string
  imageToVideoPrompt: string
  textToVideoPrompt: string
  /** no faces, no invented text, keep exact garment color … */
  negativeHints: string[]
  onScreenText: string | null
  transition: string | null
}

export interface VideoBrief {
  durationTarget: number
  aspect: '9:16'
  resolution: '1080x1920'
  concept: string
  style: string
  palette: string
  shots: BriefShot[]
  /** Max 7 words, no unsupported claims. */
  hookText: string
  musicMood: string
  bpmRange: [number, number]
  doNotDo: string[]
  /** What QA will look for. */
  qaChecklist: string[]
}

// ── Media validation (brief 9.4) ─────────────────────────────────────────────

/** Parsed subset of `ffprobe -show_format -show_streams` output. */
export interface ProbeResult {
  ok: boolean
  error: string | null
  format: {
    duration: number | null
    sizeBytes: number | null
    formatName: string | null
  }
  video: {
    present: boolean
    codec: string | null
    width: number | null
    height: number | null
    fps: number | null
    rotate: number | null
  } | null
  audio: {
    present: boolean
    codec: string | null
    sampleRate: number | null
  } | null
}

export interface HardFailure {
  id: string
  message: string
}

export interface ProbeWarning {
  id: string
  message: string
}

/** Result of the deterministic hard/soft checks. Gemini cannot override these. */
export interface ProbeVerdict {
  ok: boolean
  hardFailures: HardFailure[]
  warnings: ProbeWarning[]
  /** Human-readable summary line for the job event log. */
  summary: string
}

// ── QA report (brief 9.5) ────────────────────────────────────────────────────

export type QAVerdict = 'pass' | 'fixable' | 'reject'

export interface QACheck {
  id: string
  result: 'pass' | 'fail' | 'warn'
  severity: 'critical' | 'major' | 'warning' | 'info'
  /** Frame refs, e.g. `frames/t_04.jpg`. */
  evidence: string[]
  note: string
}

export interface QAReport {
  verdict: QAVerdict
  /** 0-100. Pass needs >= 80 and no critical failure. */
  score: number
  checks: QACheck[]
  /** Plain steps, plus a revised prompt per affected shot. */
  fixInstructions: string[]
  aiLabelRecommended: boolean
  confidence: number
}

// ── Publisher: Post Kit (brief 9.6) ──────────────────────────────────────────

export interface PostKit {
  /** Hook first, short, under 2200 chars hard limit. */
  caption: string
  altCaptions: string[]
  /** 3-5, niche plus broad, relevant only. */
  hashtags: string[]
  basket: {
    productTitle: string
    searchKeyword: string
    productLink: string
    commissionNote: string
  }
  music: {
    mood: string
    bpmRange: [number, number]
    searchKeywords: string[]
    localTrackId: string | null
  }
  /** Chosen timestamp (seconds) for the cover frame. */
  coverFrame: number
  schedule: {
    recommendedSlots: string[]
    timezone: string
  }
  /** AI label, commercial disclosure, basket, sound, privacy. */
  checklist: string[]
}

// ── Job detail aggregate (GET /api/jobs/:id) ─────────────────────────────────

export interface JobVideo {
  id: string
  version: number
  /** Served URL, e.g. /api/jobs/<id>/media/video/v1.mp4 */
  url: string
  probe: ProbeResult | null
  verdict: ProbeVerdict | null
  frames: string[]
  covers: string[]
  createdAt: number
}

export interface JobDetail {
  job: Job
  product: {
    card: ProductCard | null
    images: ProductImage[]
  } | null
  brief: { brief: VideoBrief | null; version: number; createdAt: number } | null
  video: JobVideo | null
  qa: { report: QAReport | null; verdict: string | null; score: number | null; createdAt: number } | null
  postKit: { kit: PostKit | null; adapter: string; approvedAt: number | null } | null
  events: JobEvent[]
}