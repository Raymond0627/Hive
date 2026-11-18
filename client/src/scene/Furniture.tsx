import { palette, DESK_CELLS, gridToWorld } from './layout'

/** A desk with a monitor, keyboard, mug and a little paper clutter. */
function Desk({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.1, 1.1]} />
        <meshStandardMaterial color={palette.deskTop} roughness={0.75} />
      </mesh>

      {[-0.9, 0.9].map((lx) =>
        [-0.45, 0.45].map((lz) => (
          <mesh key={`${lx}:${lz}`} position={[lx, 0.39, lz]} castShadow>
            <boxGeometry args={[0.1, 0.78, 0.1]} />
            <meshStandardMaterial color={palette.deskLeg} roughness={0.55} metalness={0.2} />
          </mesh>
        )),
      )}

      {/* Monitor: screen faces the chair (-z), so the camera sees the back. */}
      <group position={[0, 0.83, 0.3]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.32, 0.04, 0.22]} />
          <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.07, 0.36, 0.07]} />
          <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.48, 0]} castShadow>
          <boxGeometry args={[0.98, 0.62, 0.07]} />
          <meshStandardMaterial color={palette.charcoal} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.48, -0.045]}>
          <boxGeometry args={[0.86, 0.5, 0.01]} />
          <meshStandardMaterial
            color={palette.screen}
            emissive={palette.screen}
            emissiveIntensity={0.35}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.36, 0.04]}>
          <boxGeometry args={[0.07, 0.07, 0.01]} />
          <meshStandardMaterial color={palette.accent} roughness={0.6} />
        </mesh>
      </group>

      {/* Keyboard + clutter */}
      <mesh position={[0, 0.845, -0.16]} castShadow>
        <boxGeometry args={[0.62, 0.035, 0.2]} />
        <meshStandardMaterial color={palette.charcoal} roughness={0.7} />
      </mesh>
      <mesh position={[0.72, 0.89, -0.18]} castShadow>
        <boxGeometry args={[0.14, 0.16, 0.14]} />
        <meshStandardMaterial color={palette.accent} roughness={0.6} />
      </mesh>
      <mesh position={[-0.62, 0.84, -0.05]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.3, 0.02, 0.22]} />
        <meshStandardMaterial color={palette.white} roughness={0.85} />
      </mesh>
    </group>
  )
}

/** Office chair, backrest toward the wall so the agent faces the desk. */
function Chair({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.66, 0.1, 0.66]} />
        <meshStandardMaterial color={palette.chairSeat} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.86, -0.3]} castShadow>
        <boxGeometry args={[0.66, 0.62, 0.1]} />
        <meshStandardMaterial color={palette.chairBack} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.62, 0.06, 0.08]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.08, 0.06, 0.62]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  )
}

export function Plant({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.23, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.46, 0.46]} />
        <meshStandardMaterial color={palette.pot} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.62, 0]} rotation={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.58, 0.3, 0.58]} />
        <meshStandardMaterial color={palette.plantDark} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.88, 0]} rotation={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.44, 0.28, 0.44]} />
        <meshStandardMaterial color={palette.plant} roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.11, 0]} rotation={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.26, 0.24, 0.26]} />
        <meshStandardMaterial color={palette.plant} roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Narrow bookcase against the left wall of the work area. */
function Bookshelf({ x, z }: { x: number; z: number }) {
  const books = ['#E0653F', '#4C7BD9', '#5FA463', '#9B6BD1', '#F2C14E', '#3FA7A0']
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 2.2, 3.2]} />
        <meshStandardMaterial color={palette.wood} roughness={0.8} />
      </mesh>
      {[0.55, 1.15, 1.75].map((y) => (
        <group key={y}>
          <mesh position={[0.42, y, 0]}>
            <boxGeometry args={[0.14, 0.06, 3]} />
            <meshStandardMaterial color={palette.deskTop} roughness={0.8} />
          </mesh>
          {books.slice(0, 4).map((color, i) => (
            <mesh key={i} position={[0.5, y + 0.19, -1 + i * 0.34]} castShadow>
              <boxGeometry args={[0.12, 0.32, 0.24]} />
              <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** Small meeting table in the open half of the work zone. */
function MeetingTable({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.1, 2.6]} />
        <meshStandardMaterial color={palette.deskTop} roughness={0.75} />
      </mesh>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}:${sz}`} position={[sx, 0.37, sz]} castShadow>
            <boxGeometry args={[0.12, 0.74, 0.12]} />
            <meshStandardMaterial color={palette.deskLeg} roughness={0.55} metalness={0.2} />
          </mesh>
        )),
      )}
      {/* Laptop left on the table */}
      <mesh position={[-0.5, 0.86, 0.3]} rotation={[0, -0.3, 0]} castShadow>
        <boxGeometry args={[0.55, 0.05, 0.38]} />
        <meshStandardMaterial color={palette.charcoal} roughness={0.6} />
      </mesh>
      <mesh position={[-0.5, 1.06, 0.05]} rotation={[0.25, -0.3, 0]} castShadow>
        <boxGeometry args={[0.55, 0.36, 0.04]} />
        <meshStandardMaterial color={palette.charcoal} roughness={0.6} />
      </mesh>
      {/* Stools */}
      {[
        [0, -1.9],
        [0, 1.9],
        [-1.9, 0],
        [1.9, 0],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx, 0.31, sz]} castShadow>
          <boxGeometry args={[0.5, 0.62, 0.5]} />
          <meshStandardMaterial color={palette.chairSeat} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Everything that makes the work zone read as an office. */
export function WorkArea() {
  return (
    <group>
      {DESK_CELLS.map((cell) => {
        const { x, z } = gridToWorld(cell.x, cell.y)
        return (
          <group key={`${cell.x}:${cell.y}`}>
            <Desk x={x} z={z} />
            <Chair x={x} z={z - 0.95} />
          </group>
        )
      })}

      <MeetingTable x={0} z={-3.4} />
      <Bookshelf x={-11.3} z={-5.2} />
      <Plant x={-10.2} z={-2.4} />
      <Plant x={10.2} z={-2.4} scale={0.9} />
    </group>
  )
}
