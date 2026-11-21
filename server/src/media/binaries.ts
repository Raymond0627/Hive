/**
 * FFmpeg / FFprobe binary resolution (brief section 6: "Media tools (code)").
 *
 * Binaries are resolved in this order:
 *   1. explicit env override (FFMPEG_PATH / FFPROBE_PATH)
 *   2. the bundled static builds (ffmpeg-static / ffprobe-static packages)
 *
 * The static packages ship real binaries per platform, so no system-wide
 * FFmpeg install is required. A missing binary is a hard, plain-language
 * error — never a crash deep in validation.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let cachedFfmpeg: string | null = null
let cachedFfprobe: string | null = null

function resolveBinary(envName: string, fallback: () => string | null): string {
  const fromEnv = process.env[envName]?.trim()
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(`${envName} is set to "${fromEnv}" but that file does not exist.`)
    }
    return fromEnv
  }
  const fallbackPath = fallback()
  if (!fallbackPath || !existsSync(fallbackPath)) {
    throw new Error(
      `No ${envName.replace('_PATH', '').toLowerCase()} binary found. Set ${envName} in .env, ` +
        'or run `npm install` in the server workspace so the bundled static build is available.',
    )
  }
  return fallbackPath
}

/** Absolute path to the ffmpeg executable. */
export function ffmpegPath(): string {
  if (cachedFfmpeg) return cachedFfmpeg
  cachedFfmpeg = resolveBinary('FFMPEG_PATH', () => {
    try {
      // ffmpeg-static exports the absolute path to the bundled binary.
      const mod = require('ffmpeg-static') as unknown
      return typeof mod === 'string' ? mod : null
    } catch {
      return null
    }
  })
  return cachedFfmpeg
}

/** Absolute path to the ffprobe executable. */
export function ffprobePath(): string {
  if (cachedFfprobe) return cachedFfprobe
  cachedFfprobe = resolveBinary('FFPROBE_PATH', () => {
    try {
      // ffprobe-static exports { path } pointing at the bundled binary.
      const mod = require('ffprobe-static') as unknown as { path?: string } | string
      return typeof mod === 'string' ? mod : (mod.path ?? null)
    } catch {
      return null
    }
  })
  return cachedFfprobe
}

/** For diagnostics (health endpoint): both binaries resolvable? */
export function mediaBinariesOk(): boolean {
  try {
    ffmpegPath()
    ffprobePath()
    return true
  } catch {
    return false
  }
}