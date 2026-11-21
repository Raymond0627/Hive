/**
 * Frame extraction (brief section 9.4):
 *   - one frame every second  → frames/vN/t_001.jpg, t_002.jpg, …
 *   - first and last frame    → frames/vN/first.jpg, last.jpg
 *   - 3 cover candidates      → covers/vN/c1.jpg (25%), c2.jpg (50%), c3.jpg (75%)
 *
 * Per-video version folders: a job's QA retry loop keeps v1, v2, … so old QA
 * evidence (frame refs) stays valid across re-uploads.
 */
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ffmpegPath } from './binaries'
import { jobDir } from './storage'

function run(input: string, output: string, vfArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, ...vfArgs, output], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 180_000,
    }, (error) => (error ? reject(error) : resolve()))
  })
}

export interface ExtractedFrames {
  /** Relative to the job folder, e.g. `frames/v1/t_003.jpg`. */
  frames: string[]
  covers: string[]
}

/**
 * Extract all frames for one video. `version` is the 1-based video version,
 * `duration` its length in seconds (≤0.5s → first/last only).
 */
export async function extractFrames(jobId: string, videoPath: string, version: number, duration: number): Promise<ExtractedFrames> {
  const framesDir = join(jobDir(jobId, 'frames', `v${version}`))
  const coversDir = join(jobDir(jobId, 'covers', `v${version}`))
  mkdirSync(framesDir, { recursive: true })
  mkdirSync(coversDir, { recursive: true })

  const frameRel = (name: string) => `frames/v${version}/${name}`
  const coverRel = (name: string) => `covers/v${version}/${name}`

  // One frame per second, then first and last.
  await run(videoPath, join(framesDir, 't_%03d.jpg'), ['-vf', 'fps=1'])
  const count = Math.max(0, Math.round(Math.max(0, duration)))
  const frames = Array.from({ length: count }, (_, i) => frameRel(`t_${String(i + 1).padStart(3, '0')}.jpg`))

  await run(videoPath, join(framesDir, 'first.jpg'), ['-frames:v', '1'])
  frames.push(frameRel('first.jpg'))
  if (duration > 0.5) {
    await run(videoPath, join(framesDir, 'last.jpg'), ['-ss', String(Math.max(0, duration - 0.1)), '-frames:v', '1'])
    frames.push(frameRel('last.jpg'))
  }

  // Three cover candidates at 25 / 50 / 75% of the timeline.
  const covers: string[] = []
  if (duration > 0.5) {
    let i = 1
    for (const fraction of [0.25, 0.5, 0.75]) {
      const name = `c${i++}.jpg`
      await run(videoPath, join(coversDir, name), ['-ss', String(duration * fraction), '-frames:v', '1'])
      covers.push(coverRel(name))
    }
  }

  return { frames, covers }
}