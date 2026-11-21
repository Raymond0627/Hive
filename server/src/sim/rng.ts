/**
 * Seeded pseudo-random number generator (Mulberry32).
 *
 * The simulation uses this instead of `Math.random` so a run can be reproduced
 * bit-for-bit when `SIM_SEED` is set. With no seed, a random seed is picked at
 * module load so normal runs still vary.
 */
let state = (Number(process.env.SIM_SEED) || Math.floor(Math.random() * 0x7fffffff)) >>> 0
if (state === 0) state = 1

/** Re-seed the generator (used by tests for deterministic runs). */
export function seedRng(seed: number): void {
  state = (seed >>> 0) || 1
}

/** Uniform float in [0, 1). */
export function random(): number {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Integer in [min, max). */
export function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min))
}

/** Pick a random element from a non-empty array. */
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}
