export const GRID_SIZE = 40

export interface Cell {
  x: number
  y: number
}

export const ZONES = {
  work: { x0: 2, y0: 1, x1: 38, y1: 17 },
  pantry: { x0: 2, y0: 19, x1: 18, y1: 38 },
  gym: { x0: 22, y0: 19, x1: 38, y1: 38 },
} as const

export type ZoneName = keyof typeof ZONES

export const DESKS: Record<string, { desk: Cell; workSpot: Cell }> = {
  meow: { desk: { x: 5, y: 7 }, workSpot: { x: 5, y: 9 } },
  gugel: { desk: { x: 12, y: 7 }, workSpot: { x: 12, y: 9 } },
  sikyo: { desk: { x: 20, y: 7 }, workSpot: { x: 20, y: 9 } },
  brod: { desk: { x: 28, y: 7 }, workSpot: { x: 28, y: 9 } },
  aiz: { desk: { x: 35, y: 7 }, workSpot: { x: 35, y: 9 } },
}

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Furniture footprints, roughly matching the client scene. */
const BLOCKED: Rect[] = [
  ...Object.values(DESKS).flatMap(({ desk }) => [
    { x0: desk.x - 1, y0: desk.y - 1, x1: desk.x + 1, y1: desk.y },
    { x0: desk.x, y0: desk.y + 1, x1: desk.x, y1: desk.y + 1 },
  ]),
  { x0: 18, y0: 12, x1: 22, y1: 16 },
  { x0: 2, y0: 9, x1: 3, y1: 13 },
  { x0: 2, y0: 20, x1: 4, y1: 30 },
  { x0: 2, y0: 32, x1: 4, y1: 35 },
  { x0: 13, y0: 28, x1: 16, y1: 32 },
  { x0: 17, y0: 35, x1: 17, y1: 36 },
  { x0: 34, y0: 21, x1: 37, y1: 23 },
  { x0: 25, y0: 23, x1: 27, y1: 27 },
  { x0: 36, y0: 30, x1: 38, y1: 35 },
  { x0: 30, y0: 33, x1: 32, y1: 36 },
  { x0: 23, y0: 36, x1: 24, y1: 37 },
]

const blocked = new Uint8Array(GRID_SIZE * GRID_SIZE)

for (const rect of BLOCKED) {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) {
      if (x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE) {
        blocked[y * GRID_SIZE + x] = 1
      }
    }
  }
}

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
