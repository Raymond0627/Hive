import { type Cell, GRID_SIZE, isWalkable } from './map'

/** 8-way neighbours: the four sides plus the diagonals. */
const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

const index = (x: number, y: number) => y * GRID_SIZE + x
const heuristic = (a: Cell, b: Cell) => Math.hypot(a.x - b.x, a.y - b.y)

/** Extra cost for cells other agents are standing on, so paths prefer open routes. */
const CROWD_PENALTY = 6

export interface PathOptions {
  /** Soft obstacle: still passable, but avoided when a detour is cheap. */
  isCrowded?: (cell: Cell) => boolean
}

/**
 * A* over the walkable grid. Returns the full path including `to`, or null if
 * the target is blocked or unreachable. Diagonal moves may not cut corners.
 */
export function findPath(from: Cell, to: Cell, options: PathOptions = {}): Cell[] | null {
  if (!isWalkable(from) || !isWalkable(to)) return null
  if (from.x === to.x && from.y === to.y) return [{ ...from }]

  const open: Array<{ cell: Cell; f: number }> = [{ cell: from, f: heuristic(from, to) }]
  const cameFrom = new Int32Array(GRID_SIZE * GRID_SIZE).fill(-1)
  const gScore = new Float32Array(GRID_SIZE * GRID_SIZE).fill(Infinity)
  const closed = new Uint8Array(GRID_SIZE * GRID_SIZE)
  gScore[index(from.x, from.y)] = 0

  while (open.length > 0) {
    let best = 0
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].f < open[best].f) best = i
    }
    const current = open.splice(best, 1)[0].cell
    const currentIndex = index(current.x, current.y)

    if (current.x === to.x && current.y === to.y) {
      const path: Cell[] = []
      let cursor = currentIndex
      while (cursor !== -1) {
        path.push({ x: cursor % GRID_SIZE, y: Math.floor(cursor / GRID_SIZE) })
        cursor = cameFrom[cursor]
      }
      return path.reverse()
    }

    if (closed[currentIndex]) continue
    closed[currentIndex] = 1

    for (const [dx, dy, cost] of NEIGHBOURS) {
      const next = { x: current.x + dx, y: current.y + dy }
      if (!isWalkable(next)) continue
      // No squeezing between two blocked diagonal neighbours.
      if (dx !== 0 && dy !== 0 && (!isWalkable({ x: current.x + dx, y: current.y }) || !isWalkable({ x: current.x, y: current.y + dy }))) {
        continue
      }
      const nextIndex = index(next.x, next.y)
      const crowding = options.isCrowded?.(next) ? CROWD_PENALTY : 0
      const tentative = gScore[currentIndex] + cost + crowding
      if (tentative >= gScore[nextIndex]) continue
      cameFrom[nextIndex] = currentIndex
      gScore[nextIndex] = tentative
      open.push({ cell: next, f: tentative + heuristic(next, to) })
    }
  }

  return null
}
