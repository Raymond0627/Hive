import { useMemo } from 'react'
import * as THREE from 'three'
import { palette, ROOM_SIZE, ZONES, zoneRect } from './layout'

/**
 * A tiled floor texture drawn to a canvas: no image asset, no network fetch,
 * and it repeats cleanly at 2.4 world units per tile.
 */
function useTileTexture() {
  return useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = palette.floor
    ctx.fillRect(0, 0, size, size)

    // Faint checker so the floor reads as tile, not a flat plane.
    ctx.fillStyle = 'rgba(120, 96, 62, 0.05)'
    ctx.fillRect(0, 0, size / 2, size / 2)
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2)

    // Grout lines.
    ctx.strokeStyle = 'rgba(120, 96, 62, 0.16)'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 0, size, size)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(ROOM_SIZE / 2.4, ROOM_SIZE / 2.4)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
}

const rugColor: Record<keyof typeof ZONES, string> = {
  work: palette.rugWork,
  pantry: palette.rugPantry,
  gym: palette.rugGym,
}

export function Floor() {
  const texture = useTileTexture()

  return (
    <group>
      {/* Plinth: gives the diorama a solid base instead of a floating plane. */}
      <mesh position={[0, -0.36, 0]} receiveShadow>
        <boxGeometry args={[ROOM_SIZE + 1.1, 0.6, ROOM_SIZE + 1.1]} />
        <meshStandardMaterial color={palette.plinth} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.055, 0]} receiveShadow>
        <boxGeometry args={[ROOM_SIZE + 0.5, 0.02, ROOM_SIZE + 0.5]} />
        <meshStandardMaterial color={palette.plinthEdge} roughness={0.8} />
      </mesh>

      {/* Tiled floor. */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[ROOM_SIZE, 0.1, ROOM_SIZE]} />
        <meshStandardMaterial map={texture} roughness={0.82} metalness={0} />
      </mesh>

      {/* Zone rugs: colour-coded, inset from the walls. */}
      {(Object.keys(ZONES) as (keyof typeof ZONES)[]).map((name) => {
        const rect = zoneRect(ZONES[name])
        return (
          <mesh
            key={name}
            position={[rect.cx, 0.012, rect.cz]}
            receiveShadow
          >
            <boxGeometry args={[rect.width, 0.024, rect.depth]} />
            <meshStandardMaterial color={rugColor[name]} roughness={1} />
          </mesh>
        )
      })}
    </group>
  )
}
