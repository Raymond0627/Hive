/**
 * Office layout data (brief P0.2).
 *
 * Furniture, footprints and interaction slots live in `layout.json` so the
 * office can be rearranged without touching simulation code. The server uses
 * the footprints for collision; the client uses the same records to place its
 * meshes, so both sides can never drift apart.
 */
import type { AgentActivity, AgentAnimation, SlotType } from './types'
import layoutJson from './layout.json'

export interface LayoutCell {
  x: number
  y: number
}

export interface LayoutZone {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type ZoneName = 'work' | 'pantry' | 'gym'

/** What kind of mesh the client should draw for a furniture record. */
export type FurnitureType =
  | 'desk'
  | 'table'
  | 'counter'
  | 'fridge'
  | 'treadmill'
  | 'bench'
  | 'rack'
  | 'mat'
  | 'bookshelf'
  | 'plant'
  | 'water-cooler'
  | 'kettlebells'

export interface LayoutSlot {
  id: string
  type: SlotType
  animation: AgentAnimation
  /** Where the agent stands or sits. Must be a walkable cell. */
  stand: LayoutCell
  facing: number
  activity: AgentActivity
  /** How long one use lasts, in simulated minutes. */
  minutes: number
  furnitureId: string
}

export interface LayoutFurniture {
  id: string
  type: FurnitureType
  /** Distinguishes e.g. a meeting table from a dining table. */
  variant?: string
  /** Agent whose home desk this is. Only set on desk records. */
  agentId?: string
  /** Grid anchor the client converts to three.js world units. */
  at: LayoutCell
  /** Three.js yaw in radians. */
  rotation?: number
  /** Visual scale for decor. */
  scale?: number
  /** Blocked cells. Seats are deliberately not included so agents can sit. */
  footprint: LayoutCell[]
  slots: LayoutSlot[]
}

export interface OfficeLayout {
  version: number
  gridSize: number
  zones: Record<ZoneName, LayoutZone>
  furniture: LayoutFurniture[]
}

export const OFFICE_LAYOUT = layoutJson as unknown as OfficeLayout

export const GRID_SIZE = OFFICE_LAYOUT.gridSize
export const ZONES = OFFICE_LAYOUT.zones

export interface DeskDefinition {
  /** Desk cell (the furniture body). */
  desk: LayoutCell
  /** Chair cell the agent walks to and sits on. */
  workSpot: LayoutCell
}

/** Every desk record, keyed by the agent that owns it. */
export const DESKS: Record<string, DeskDefinition> = Object.fromEntries(
  OFFICE_LAYOUT.furniture
    .filter((item) => item.type === 'desk' && item.agentId)
    .map((item) => [
      item.agentId as string,
      {
        desk: item.at,
        workSpot: item.slots[0]?.stand ?? item.at,
      },
    ]),
)

/** Desk records in layout order, handy for rendering. */
export const DESK_FURNITURE = OFFICE_LAYOUT.furniture.filter(
  (item) => item.type === 'desk' && item.agentId,
)
