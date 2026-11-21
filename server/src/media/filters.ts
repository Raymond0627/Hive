/**
 * Soft ffmpeg filters (brief section 9.4): loudness (ebur128), black frames
 * (blackdetect), frozen frames (freezedetect).
 *
 * These ONLY add warnings to the verdict — they can never fail an upload.
 * Each filter is a short-lived ffmpeg process over the whole file; a failed
 * filter (e.g. no audio stream) is skipped silently rather than reported.
 */
import { execFile } from 'node:child_process'
import type { ProbeWarning } from '@hive/shared'
import { ffmpegPath } from './binaries'

function runFilter(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve) => {
    execFile(ffmpegPath(), args, { maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs }, (error, _stdout, stderr) => {
      // ffmpeg writes filter output to stderr; errors just mean "no data".
      void error
      resolve(stderr ?? '')
    })
  })
}

/** Integrated loudness in LUFS, or null when the file has no decodable audio. */
async function loudness(file: string): Promise<number | null> {
  const out = await runFilter(['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'])
  const match = out.match(/I:\s+(-?\d+(?:\.\d+)?)\s*dB/)
  return match ? Number.parseFloat(match[1]) : null
}

/** Total seconds of detected black frames. */
async function blackSeconds(file: string): Promise<number> {
  const out = await runFilter(['-hide_banner', '-i', file, '-vf', 'blackdetect=d=0.5:pix_thr=0.10', '-an', '-f', 'null', '-'])
  const durations = [...out.matchAll(/black_duration:(\d+(?:\.\d*)?)/g)].map((m) => Number.parseFloat(m[1]))
  return durations.reduce((sum, d) => sum + d, 0)
}

/** Total seconds of detected frozen frames. */
async function frozenSeconds(file: string): Promise<number> {
  const out = await runFilter(['-hide_banner', '-i', file, '-vf', 'freezedetect=n=0.003:d=1', '-an', '-f', 'null', '-'])
  const durations = [...out.matchAll(/freeze_duration:(\d+(?:\.\d*)?)/g)].map((m) => Number.parseFloat(m[1]))
  return durations.reduce((sum, d) => sum + d, 0)
}

/**
 * Loudness + black + freeze scan. Returns zero, one or more warnings;
 * never throws. `hasAudio` lets the caller skip the loudness scan entirely
 * when the probe already knows there is no audio track.
 */
export async function runSoftFilters(file: string, hasAudio: boolean): Promise<ProbeWarning[]> {
  const [loudnessResult, blackResult, frozenResult] = await Promise.allSettled([
    hasAudio ? loudness(file) : Promise.resolve<number | null>(null),
    blackSeconds(file),
    frozenSeconds(file),
  ])

  const warnings: ProbeWarning[] = []

  const loud = loudnessResult.status === 'fulfilled' ? loudnessResult.value : null
  if (loud != null && (loud < -24 || loud > -8)) {
    warnings.push({
      id: 'soft-loudness',
      message: `Integrated loudness is ${loud.toFixed(1)} LUFS; a typical TikTok video sits around -14. It may sound off on phones.`,
    })
  }

  if (blackResult.status === 'fulfilled' && blackResult.value > 1) {
    warnings.push({ id: 'soft-black', message: `About ${blackResult.value.toFixed(1)}s of black frames detected.` })
  }

  if (frozenResult.status === 'fulfilled' && frozenResult.value >= 1) {
    warnings.push({ id: 'soft-freeze', message: `About ${frozenResult.value.toFixed(1)}s of frozen frames detected.` })
  }

  return warnings
}
