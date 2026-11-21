/**
 * Image dimensions + hashing without a native dependency.
 *
 * The brief lists `sharp` for "resize, dimensions, hashing"; the only things
 * Phase 1 needs are dimensions (to reject images under 800px on the short
 * side — brief 9.1) and a dedup hash. Reading a JPEG/PNG/WebP header is a few
 * dozen lines of pure JS, so Phase 1 avoids a native binary install entirely.
 * (Resizing never happens in Phase 1; Tier B downscales API payloads with the
 * same helper plus a `sharp` pass if needed.)
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export interface ImageInfo {
  width: number
  height: number
  /** md5 of the file bytes — used for de-duplication (brief 9.1). */
  hash: string
}

function be16(buf: Buffer, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1]
}
function be32(buf: Buffer, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0
}

/** JPEG: walk SOF0/SOF2 markers. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) return null
    const marker = buf[offset + 1]
    // SOF0..SOF15, excluding DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: be16(buf, offset + 7), height: be16(buf, offset + 5) }
    }
    const length = be16(buf, offset + 2)
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

/** PNG: IHDR is the first chunk right after the 8-byte signature. */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || be32(buf, 0) !== 0x89504e47) return null
  if (be32(buf, 12) !== 0x49484452) return null
  return { width: be32(buf, 16), height: be32(buf, 20) }
}

/** WebP: the dimension block depends on the fourcc chunk after "WEBP". */
function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }
  const fourcc = buf.toString('ascii', 12, 16)
  const le16 = (o: number) => buf[o] | (buf[o + 1] << 8)
  const le24 = (o: number) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16)
  if (fourcc === 'VP8 ') {
    // Bitstream: 3-byte frame tag + 3-byte start code, then 14-bit w/h (low 14 bits of 16).
    return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff }
  }
  if (fourcc === 'VP8L') {
    // 0x2F signature byte, then one 28-bit field: lower 14 bits = width-1, next 14 = height-1.
    if (buf[20] !== 0x2f) return null
    const v = (buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24)) >>> 0
    return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }
  }
  if (fourcc === 'VP8X') {
    // Extended header: 4 flag bytes, then 24-bit canvas width-1 and height-1 (little-endian).
    return { width: le24(24) + 1, height: le24(27) + 1 }
  }
  return null
}

/** Dimensions + md5 for a supported image file, or null when unreadable. */
export function imageInfo(file: string): ImageInfo | null {
  const buf = readFileSync(file)
  if (buf.length < 32) return null
  const size = jpegSize(buf) ?? pngSize(buf) ?? webpSize(buf)
  if (!size || size.width <= 0 || size.height <= 0) return null
  return { ...size, hash: createHash('md5').update(buf).digest('hex') }
}