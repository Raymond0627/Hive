/**
 * Optional normalise step (brief 9.4): re-encode to H.264 1080x1920.
 *
 * "Never done automatically" — this is only ever called from the explicit
 * POST /jobs/:id/normalize button. The output is a new file in `exports/`;
 * the original upload is never touched.
 *
 * The 9:16 crop keeps the centre; if the source is not close to 9:16 the
 * result is still correct because validation runs again on the output.
 */
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { ffmpegPath } from './binaries'
import { jobDir } from './storage'

/** Re-encode `input` (absolute path) into the job's exports folder. */
export async function normalizeVideo(jobId: string, input: string, outName: string): Promise<string> {
  const outPath = join(jobDir(jobId, 'exports'), outName)
  mkdirSync(dirname(outPath), { recursive: true })

  await new Promise<void>((resolve, reject) => {
    execFile(
      ffmpegPath(),
      [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', input,
        '-vf', "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-an', // Phase 1 music is added in the TikTok app; never re-mux audio in.
        '-movflags', '+faststart',
        outPath,
      ],
      { maxBuffer: 4 * 1024 * 1024, timeout: 600_000 },
      (error) => (error ? reject(new Error(`Normalise failed: ${error.message.split('\n').slice(-2).join(' ')}`)) : resolve()),
    )
  })

  return outPath
}