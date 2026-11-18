/**
 * Dynamic occupancy: agents are physical obstacles for each other.
 *
 * Static walls and furniture live in `map.ts`. This module only answers "is
 * another agent standing on or stepping into this cell", so pathfinding and the
 * tick loop can avoid overlaps without importing half the world.
 */
import { GRID_SIZE, isWalkable, type Cell } from './map'
import { slotOwner } from './slots'
import { allSims } from './state'

/** How close another agent must be to count as "using" a cell. */
const CELL_RADIUS = 0.7

export function agentCell(sim: { x: number; y: number }): Cell {
  return {
    x: Math.max(0, Math.min(GRID_SIZE - 1, Math.round(sim.x))),
    y: Math.max(0, Math.min(GRID_SIZE - 1, Math.round(sim.y))),
  }
}

/** True when no other agent is standing on or next to `cell`. */
export function isCellFree(cell: Cell, exceptId?: string): boolean {
  if (!isWalkable(cell)) return false
  for (const other of allSims()) {
    if (other.id === exceptId) continue
    if (Math.hypot(other.x - cell.x, other.y - cell.y) < CELL_RADIUS) return false
  }
  return true
}

/** True when the seat on `cell` is claimed by somebody else. */
export function isSeatTaken(
  cell: Cell,
  slotId: string,
  agentId: string,
  now = Date.now(),
): boolean {
  const owner = slotOwner(slotId, now)
  if (owner && owner !== agentId) return true
  return !isCellFree(cell, agentId)
}

/**
 * Walk outward from `cell` until a walkable cell nobody is standing on turns up.
 * Used for spawns, drops and the last-resort unstuck teleport.
 */
export function nearestFreeCell(cell: Cell, exceptId?: string): Cell {
  const start = {
    x: Math.max(0, Math.min(GRID_SIZE - 1, Math.round(cell.x))),
    y: Math.max(0, Math.min(GRID_SIZE - 1, Math.round(cell.y))),
  }
  if (isCellFree(start, exceptId)) return start
  for (let radius = 1; radius < GRID_SIZE; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
        const candidate = { x: start.x + dx, y: start.y + dy }
        if (isCellFree(candidate, exceptId)) return candidate
      }
    }
  }
  return start
}

/** Gentle push apart so two agents never render inside each other. */
export function separateAgents(): void {
  const list = allSims()
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]
      const b = list[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.0001 || dist >= 0.85) continue

      // Seated / busy agents hold their spot; the walking one steps around them.
      const aFixed = Boolean(a.slotId) && a.activity !== 'walking'
      const bFixed = Boolean(b.slotId) && b.activity !== 'walking'
      if (aFixed && bFixed) continue

      const push = (0.85 - dist) / (aFixed || bFixed ? 1 : 2)
      if (!aFixed) {
        const nx = a.x - (dx / dist) * push
        const ny = a.y - (dy / dist) * push
        if (isWalkable(agentCell({ x: nx, y: ny }))) {
          a.x = nx
          a.y = ny
        }
      }
      if (!bFixed) {
        const nx = b.x + (dx / dist) * push
        const ny = b.y + (dy / dist) * push
        if (isWalkable(agentCell({ x: nx, y: ny }))) {
          b.x = nx
          b.y = ny
        }
      }
    }
  }
}
