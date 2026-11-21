/**
 * Job file storage (brief section 12):
 *
 *   DATA_DIR/jobs/<jobId>/
 *     images/         product photos (Boss-uploaded)
 *     video/          v1.mov, v2.mp4, … (one file per QA attempt)
 *     frames/         t_001.jpg, … per second + first/last, versioned: frames/v1/
 *     covers/         cover candidates, versioned: covers/v1/
 *     exports/        normalised re-encodes
 *
 * All server-side file access goes through `safeJobPath`, which guarantees a
 * resolved path can never escape the job folder (brief section 16: "no path
 * traversal"). Uploads are streamed to disk; nothing is buffered in memory.
 */
import { createWriteStream, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'

/** Root for all job files. `DATA_DIR` defaults to `data` (relative to cwd=server). */
export function dataDir(): string {
  return resolve(process.cwd(), process.env.DATA_DIR?.trim() || 'data')
}

/** The job's owned folder, created on demand. */
export function jobDir(jobId: string, ...sub: string[]): string {
  const dir = join(dataDir(), 'jobs', sanitizeId(jobId), ...sub)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** One level of sanitisation: job ids are ours, but never trust a URL param. */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Resolve `rel` inside the job folder. Throws (400-able) on any escape
 * attempt: `..`, absolute paths, or names that resolve outside the root.
 * Only the five known subfolders are valid.
 */
export function safeJobPath(jobId: string, rel: string): string {
  const allowed = new Set(['images', 'video', 'frames', 'covers', 'exports', ''])
  const first = rel.split('/')[0] ?? ''
  if (!allowed.has(first)) {
    throw new Error(`Not a job subfolder: "${first}".`)
  }
  const root = resolve(join(dataDir(), 'jobs', sanitizeId(jobId)))
  const target = resolve(root, rel)
  if (!target.startsWith(root + sep) && target !== root) {
    throw new Error('Path escapes the job folder.')
  }
  return target
}

/** List of files inside one subfolder of the job (relative names, sorted). */
export function listJobFiles(jobId: string, sub: string): string[] {
  const dir = join(dataDir(), 'jobs', sanitizeId(jobId), sub)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort()
}

/** Strip any directory parts and control characters; keep it boring. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'upload'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload'
}

/** Stream `source` to `dest`, creating parent folders. */
export function streamToFile(source: Readable, dest: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    mkdirSync(dirname(dest), { recursive: true })
    const out = createWriteStream(dest)
    source.on('error', rejectPromise)
    out.on('error', rejectPromise)
    out.on('finish', () => resolvePromise())
    source.pipe(out)
  })
}

// ── Upload contract (brief 16: extension + MIME + FFprobe, never the name alone) ──

export const VIDEO_EXTENSIONS = new Set(['mp4', 'mov'])
export const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v'])
export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Upload size cap in bytes (MAX_UPLOAD_MB env, default 200 — brief 9.4). */
export function maxUploadBytes(): number {
  const mb = Number.parseFloat(process.env.MAX_UPLOAD_MB ?? '200')
  const value = Number.isFinite(mb) && mb > 0 ? mb : 200
  return Math.floor(value * 1024 * 1024)
}