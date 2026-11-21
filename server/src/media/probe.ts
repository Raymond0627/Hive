/**
 * FFprobe wrapper (brief section 9.4: "never trust the filename").
 *
 * Runs `ffprobe -v error -print_format json -show_format -show_streams` on a
 * file and parses the result into the `ProbeResult` shape. A file that
 * ffprobe cannot read at all (corrupt, fake extension, non-video) comes back
 * with `ok: false` and the ffprobe error text — the rest of the pipeline
 * turns that into a plain-language rejection.
 */
import { execFile } from 'node:child_process'
import type { ProbeResult } from '@hive/shared'
import { ffprobePath } from './binaries'

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  sample_aspect_ratio?: string
  display_aspect_ratio?: string
  r_frame_rate?: string
  avg_frame_rate?: string
  rotate?: string
  side_data?: Array<{ rotate?: number }>
  sample_rate?: string
}

interface ProbeJson {
  format?: { duration?: string; size?: string; format_name?: string }
  streams?: ProbeStream[]
}

/** ffprobe is useless on files over this size for our purposes (200MB cap is enforced upstream). */
function parseFrameRate(raw: string | undefined): number | null {
  if (!raw) return null
  const [num, den] = raw.split('/')
  const n = Number.parseFloat(num)
  const d = Number.parseFloat(den ?? '1')
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  const fps = n / d
  return Number.isFinite(fps) ? fps : null
}

/** Run ffprobe on `file`. Never throws; failures are data. */
export async function probeMedia(file: string): Promise<ProbeResult> {
  const fail = (error: string): ProbeResult => ({
    ok: false,
    error,
    format: { duration: null, sizeBytes: null, formatName: null },
    video: null,
    audio: null,
  })

  let stdout: string
  try {
    ;({ stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      execFile(
        ffprobePath(),
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
        { maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
        (error, out) => (error ? reject(error) : resolve({ stdout: out })),
      )
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n').slice(-2).join(' ') : String(error)
    return fail(`ffprobe could not read this file: ${message}`)
  }

  let json: ProbeJson
  try {
    json = JSON.parse(stdout) as ProbeJson
  } catch {
    return fail('ffprobe returned no readable output; the file is not a valid media container.')
  }

  if (!json.format?.duration || !json.streams?.length) {
    return fail('No media streams found — the file is empty or not a video container.')
  }

  const duration = Number.parseFloat(json.format.duration)
  const size = json.format.size ? Number.parseInt(json.format.size, 10) : null

  const videoStream = json.streams.find((s) => s.codec_type === 'video')
  const audioStream = json.streams.find((s) => s.codec_type === 'audio')

  let rotate: number | null = null
  if (videoStream) {
    const fromSide = videoStream.side_data?.find((d) => typeof d.rotate === 'number')?.rotate
    if (typeof fromSide === 'number') rotate = fromSide
    else if (videoStream.rotate) {
      const parsed = Number.parseInt(videoStream.rotate, 10)
      rotate = Number.isFinite(parsed) ? parsed : null
    }
  }

  const result: ProbeResult = {
    ok: true,
    error: null,
    format: {
      duration: Number.isFinite(duration) ? duration : null,
      sizeBytes: size ?? null,
      formatName: json.format.format_name ?? null,
    },
    video: videoStream
      ? {
          present: true,
          codec: videoStream.codec_name ?? null,
          width: videoStream.width ?? null,
          height: videoStream.height ?? null,
          fps: parseFrameRate(videoStream.avg_frame_rate) ?? parseFrameRate(videoStream.r_frame_rate),
          rotate,
        }
      : null,
    audio: audioStream
      ? {
          present: true,
          codec: audioStream.codec_name ?? null,
          sampleRate: audioStream.sample_rate
            ? Number.parseInt(audioStream.sample_rate, 10)
            : null,
        }
      : { present: false, codec: null, sampleRate: null },
  }

  if (!videoStream) {
    result.ok = false
    result.error = 'No video stream found — the file contains no picture.'
  }

  return result
}