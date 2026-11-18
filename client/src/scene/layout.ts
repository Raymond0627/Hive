/**
 * Scene layout constants.
 *
 * The simulation runs on a 40x40 grid (brief section 7). The client renders
 * that same grid at 0.6 world units per cell, so a desk cell chosen by the
 * server lands in the right place on screen without a second coordinate list.
 */

import {
  OFFICE_LAYOUT,
  ZONES as SHARED_ZONES,
  GRID_SIZE as SHARED_GRID_SIZE,
  DESK_FURNITURE,
  type ZoneName as SharedZoneName,
} from '@hive/shared'

export { OFFICE_LAYOUT }

export const GRID_SIZE = SHARED_GRID_SIZE

/** World units per grid cell. The room is 24x24 units, i.e. 40 cells wide. */
export const TILE = 0.6

export const ROOM_SIZE = GRID_SIZE * TILE
export const ROOM_HALF = ROOM_SIZE / 2

export const WALL_HEIGHT = 4.4
export const WALL_THICKNESS = 0.4

/** Grid cell -> three.js world position on the floor plane. */
export function gridToWorld(gx: number, gy: number) {
  return {
    x: (gx - GRID_SIZE / 2) * TILE,
    z: (gy - GRID_SIZE / 2) * TILE,
  }
}

/** Inclusive grid rectangles, loaded from layout.json. */
export const ZONES = SHARED_ZONES

export type ZoneName = SharedZoneName

/** Convert a grid rectangle into a centred floor rect in world units. */
export function zoneRect(zone: { x0: number; y0: number; x1: number; y1: number }) {
  const a = gridToWorld(zone.x0, zone.y0)
  const b = gridToWorld(zone.x1, zone.y1)
  return {
    cx: (a.x + b.x) / 2,
    cz: (a.z + b.z) / 2,
    width: Math.abs(b.x - a.x),
    depth: Math.abs(b.z - a.z),
  }
}

/**
 * Desk cells on the simulation grid, sourced from shared/src/layout.json (P0.2).
 */
export const DESK_LIST = DESK_FURNITURE.map((item) => ({
  id: item.agentId as string,
  desk: item.at,
  seat: item.slots[0]?.stand ?? item.at,
}))

export const DESK_CELLS = DESK_LIST.map((item) => item.desk)

/** Palette shared by the scene and the HTML chrome, so both feel like one app. */
export const palette = {
  background: '#0B0E13',
  plinth: '#1B212A',
  plinthEdge: '#2A3240',
  floor: '#E9DFCC',
  floorTile: '#E1D5BE',
  wall: '#F3EEE4',
  wallShadow: '#E6DECD',
  baseboard: '#D9CDB8',
  accent: '#F97316',
  rugWork: '#D5E1EC',
  rugPantry: '#F3DFC0',
  rugGym: '#C7E0D4',
  deskTop: '#D8B98C',
  deskLeg: '#3B4350',
  metal: '#9AA6B6',
  darkMetal: '#4B5565',
  charcoal: '#2C333D',
  screen: '#6FD3C0',
  chairSeat: '#3A4250',
  chairBack: '#333B48',
  cabinet: '#CBD6E2',
  counter: '#F1F4F6',
  fridge: '#DDE5EC',
  wood: '#B98A5E',
  plant: '#4E8B63',
  plantDark: '#3C6E4E',
  pot: '#C97B4A',
  white: '#FBFCFD',
} as const
