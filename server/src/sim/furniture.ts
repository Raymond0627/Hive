/**
 * Furniture catalog: footprints (blocked cells) and interaction slots.
 *
 * Everything is loaded from `shared/src/layout.json` (P0.2) so the office can be
 * rearranged without code changes. The server only adds the convenience indexes
 * the engine needs.
 */
import {
  DESK_FURNITURE,
  OFFICE_LAYOUT,
  type LayoutFurniture,
  type LayoutSlot,
  type SlotType,
} from '@hive/shared'

export type InteractionSlot = LayoutSlot
export type Furniture = LayoutFurniture

export const FURNITURE: Furniture[] = OFFICE_LAYOUT.furniture

export const SLOTS: InteractionSlot[] = FURNITURE.flatMap((item) => item.slots)

export const SLOTS_BY_ID = new Map(SLOTS.map((slot) => [slot.id, slot]))

/** The desk slot that belongs to an agent, used for its own tasks. */
export const DESK_SLOT_FOR = new Map(
  DESK_FURNITURE.map((item) => [item.agentId as string, item.slots[0]?.id ?? `desk-${item.agentId}`]),
)

/** Blocked cells contributed by furniture bodies. Seats stay walkable. */
export const FURNITURE_BLOCKED = FURNITURE.flatMap((item) => item.footprint)

/** All slots of one type, in layout order. */
export function slotsOfType(type: SlotType): InteractionSlot[] {
  return SLOTS.filter((slot) => slot.type === type)
}
