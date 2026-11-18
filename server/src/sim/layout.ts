/**
 * Static world layout, now sourced from `shared/src/layout.json` (P0.2).
 *
 * This file only re-exports the shared data under the names the simulation has
 * always used, so the map, furniture catalog and engine stay decoupled from the
 * storage format.
 */
import {
  DESKS as SHARED_DESKS,
  GRID_SIZE as SHARED_GRID_SIZE,
  ZONES as SHARED_ZONES,
  type LayoutCell,
  type ZoneName,
} from '@hive/shared'

export const GRID_SIZE = SHARED_GRID_SIZE
export const ZONES = SHARED_ZONES
export const DESKS = SHARED_DESKS

export type Cell = LayoutCell
export type { ZoneName }
