import { FURNITURE_BLOCKED } from './furniture'
import { DESKS, GRID_SIZE, ZONES, type Cell, type ZoneName } from './layout'

export { DESKS, GRID_SIZE, ZONES }
export type { Cell, ZoneName }

const blocked = new Uint8Array(GRID_SIZE * GRID_SIZE)

function blockCell(x: number, y: number): void {
  if (x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE) blocked[y * GRID_SIZE + x] = 1
}

// Every furniture record, including decor, contributes its footprint. Seat
// cells stay walkable on purpose so an agent can walk to a chair, sit down, and
// stand up again.
for (const cell of FURNITURE_BLOCKED) blockCell(cell.x, cell.y)

export function inBounds(cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < GRID_SIZE && cell.y < GRID_SIZE
}

export function isWalkable(cell: Cell): boolean {
  return inBounds(cell) && blocked[cell.y * GRID_SIZE + cell.x] === 0
}

/** Spiral out from a cell until a walkable one is found. */
export function nearestWalkable(cell: Cell): Cell {
  if (isWalkable(cell)) return cell
  for (let radius = 1; radius < GRID_SIZE; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
        const candidate = { x: cell.x + dx, y: cell.y + dy }
        if (isWalkable(candidate)) return candidate
      }
    }
  }
  return { x: 20, y: 20 }
}

/** Random walkable cell inside a zone, used for idle wandering. */
export function randomCellIn(zone: ZoneName, random = Math.random): Cell {
  const rect = ZONES[zone]
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const cell = {
      x: rect.x0 + Math.floor(random() * (rect.x1 - rect.x0 + 1)),
      y: rect.y0 + Math.floor(random() * (rect.y1 - rect.y0 + 1)),
    }
    if (isWalkable(cell)) return cell
  }
  return nearestWalkable({ x: 20, y: 20 })
}
