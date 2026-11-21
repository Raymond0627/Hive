/**
 * Deterministic video checks (brief section 9.4, principle: "Deterministic
 * code decides hard failures. Gemini can warn, but it cannot override a
 * failed technical check.").
 *
 * `judgeProbe` is a pure function over the parsed probe result so it can be
 * unit-tested without a single media file or binary. The soft ffmpeg filters
 * (loudness/black/freeze) live in `filters.ts` and only ever add warnings.
 */
import type { HardFailure, ProbeResult, ProbeWarning, ProbeVerdict } from '@hive/shared'

/** The technical bar for an accepted video. All values come from settings. */
export interface VideoChecks {
  /** Inclusive duration window, seconds (brief default 15-20). */
  minDuration: number
  maxDuration: number
  /** Seconds of slack on each duration boundary (configurable, brief 9.4). */
  durationTolerance: number
  /** Relative slack on the 9:16 ratio, e.g. 0.03 = ±3%. */
  aspectTolerance: number
  minWidth: number
  minHeight: number
  /** Preferred output (1080x1920) — below this is a warning, not a failure. */
  preferredWidth: number
  preferredHeight: number
  minFps: number
  /** fps below `minFps` - this slack fails (23.97 must pass when min is 24). */
  fpsSlack: number
}

/** Built-in defaults; settings (env + DB) override these. */
export const DEFAULT_VIDEO_CHECKS: VideoChecks = {
  minDuration: 15,
  maxDuration: 20,
  durationTolerance: 0.5,
  aspectTolerance: 0.03,
  minWidth: 720,
  minHeight: 1280,
  preferredWidth: 1080,
  preferredHeight: 1920,
  minFps: 24,
  fpsSlack: 0.5,
}

const TARGET_RATIO = 9 / 16

/** Codecs we do not flag as "unusual" (still container-wrapped H.264 etc.). */
const COMMON_VIDEO_CODECS = new Set(['h264', 'avc1', 'avc', 'hevc', 'h265'])

/** Width×height after a 90/270° rotation tag is applied. */
export function effectiveDimensions(probe: ProbeResult): { w: number | null; h: number | null } {
  const v = probe.video
  if (!v || v.width == null || v.height == null) return { w: null, h: null }
  const rotated = v.rotate != null && (v.rotate % 180 === 90)
  return rotated ? { w: v.height, h: v.width } : { w: v.width, h: v.height }
}

/** The deterministic hard/soft verdict for a probed video. Pure; no I/O. */
export function judgeProbe(probe: ProbeResult, checks: VideoChecks = DEFAULT_VIDEO_CHECKS): ProbeVerdict {
  const hardFailures: HardFailure[] = []
  const warnings: ProbeWarning[] = []
  let n = 0
  const fail = (message: string) => hardFailures.push({ id: `hard-${++n}`, message })
  const warn = (message: string) => warnings.push({ id: `warn-${n}`, message })

  if (!probe.ok) {
    fail(probe.error ?? 'The video file could not be read (corrupt or not a real video).')
    return { ok: false, hardFailures, warnings, summary: 'Video unreadable: ' + (probe.error ?? 'unknown error') }
  }

  if (!probe.video) {
    fail('No video stream found — the file contains no picture.')
    return { ok: false, hardFailures, warnings, summary: 'No video stream.' }
  }

  // Duration
  const duration = probe.format.duration
  if (duration == null) {
    fail('Could not read the video duration.')
  } else {
    const lo = checks.minDuration - checks.durationTolerance
    const hi = checks.maxDuration + checks.durationTolerance
    if (duration < lo || duration > hi) {
      fail(
        `Duration is ${duration.toFixed(1)}s; required ${checks.minDuration}-${checks.maxDuration}s ` +
          `(±${checks.durationTolerance}s).`,
      )
    }
  }

  // Aspect + resolution (rotation-aware)
  const { w, h } = effectiveDimensions(probe)
  if (w == null || h == null) {
    fail('Could not read the video resolution.')
  } else {
    const ratio = w / h
    if (Math.abs(ratio - TARGET_RATIO) > TARGET_RATIO * checks.aspectTolerance) {
      fail(`Aspect ratio is ${ratio.toFixed(3)}; required 9:16 (within ${Math.round(checks.aspectTolerance * 100)}%).`)
    }
    if (w < checks.minWidth || h < checks.minHeight) {
      fail(`Resolution is ${w}x${h}; minimum is ${checks.minWidth}x${checks.minHeight}.`)
    }
    if (w < checks.preferredWidth || h < checks.preferredHeight) {
      warn(`Prefer ${checks.preferredWidth}x${checks.preferredHeight}; got ${w}x${h}.`)
    }
  }

  // Frame rate
  const fps = probe.video.fps
  if (fps == null) {
    fail('Could not determine the frame rate.')
  } else if (fps < checks.minFps - checks.fpsSlack) {
    fail(`Frame rate is ${fps.toFixed(2)} fps; minimum is ${checks.minFps} fps.`)
  }

  // Soft checks (warnings only)
  if (!probe.audio?.present) {
    warn('No audio track. Phase 1 expects music added in the TikTok app, so this is fine.')
  }
  const codec = probe.video.codec
  if (codec && !COMMON_VIDEO_CODECS.has(codec.toLowerCase())) {
    warn(`Unusual video codec "${codec}" — expect players to handle it, but prefer H.264.`)
  }

  const ok = hardFailures.length === 0
  const summary = ok
    ? warnings.length
      ? `Video accepted with ${warnings.length} warning(s).`
      : 'Video passed all technical checks.'
    : `Video rejected: ${hardFailures.map((f) => f.message).join(' ')}`

  return { ok, hardFailures, warnings, summary }
}

/** Merge settings values over the built-in defaults. */
export function checksFromSettings(settings: object): VideoChecks {
  const values = settings as Record<string, unknown>
  const num = (key: string, fallback: number) => {
    const value = values[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  return {
    minDuration: num('videoMinDuration', DEFAULT_VIDEO_CHECKS.minDuration),
    maxDuration: num('videoMaxDuration', DEFAULT_VIDEO_CHECKS.maxDuration),
    durationTolerance: num('durationTolerance', DEFAULT_VIDEO_CHECKS.durationTolerance),
    aspectTolerance: num('aspectTolerance', DEFAULT_VIDEO_CHECKS.aspectTolerance),
    minWidth: num('videoMinWidth', DEFAULT_VIDEO_CHECKS.minWidth),
    minHeight: num('videoMinHeight', DEFAULT_VIDEO_CHECKS.minHeight),
    preferredWidth: num('videoPreferredWidth', DEFAULT_VIDEO_CHECKS.preferredWidth),
    preferredHeight: num('videoPreferredHeight', DEFAULT_VIDEO_CHECKS.preferredHeight),
    minFps: num('videoMinFps', DEFAULT_VIDEO_CHECKS.minFps),
    fpsSlack: DEFAULT_VIDEO_CHECKS.fpsSlack,
  }
}
