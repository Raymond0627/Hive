import { palette, ROOM_HALF, ROOM_SIZE, WALL_HEIGHT, WALL_THICKNESS } from './layout'

/** Two walls behind the room: back (-z) and left (-x), the classic diorama. */
export function Walls() {
  return (
    <group>
      {/* Back wall. Span = floor + one thickness, shifted left so it meets the
          left wall at a clean outer corner instead of overhanging the floor. */}
      <mesh
        position={[-WALL_THICKNESS / 2, WALL_HEIGHT / 2, -ROOM_HALF - WALL_THICKNESS / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[ROOM_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={palette.wall} roughness={0.92} />
      </mesh>

      {/* Left wall */}
      <mesh
        position={[-ROOM_HALF - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, ROOM_SIZE]} />
        <meshStandardMaterial color={palette.wallShadow} roughness={0.92} />
      </mesh>

      {/* Baseboards */}
      <mesh position={[0, 0.1, -ROOM_HALF + 0.03]}>
        <boxGeometry args={[ROOM_SIZE, 0.2, 0.07]} />
        <meshStandardMaterial color={palette.baseboard} roughness={0.9} />
      </mesh>
      <mesh position={[-ROOM_HALF + 0.03, 0.1, 0]}>
        <boxGeometry args={[0.07, 0.2, ROOM_SIZE]} />
        <meshStandardMaterial color={palette.baseboard} roughness={0.9} />
      </mesh>

      {/* Thin orange pinstripe — the brand accent, far enough up to stay subtle. */}
      <mesh position={[0, 2.95, -ROOM_HALF + 0.015]}>
        <boxGeometry args={[ROOM_SIZE, 0.05, 0.02]} />
        <meshStandardMaterial
          color={palette.accent}
          roughness={0.5}
          emissive={palette.accent}
          emissiveIntensity={0.15}
        />
      </mesh>

      {/* Whiteboard on the back wall */}
      <group position={[6.4, 2.45, -ROOM_HALF + 0.05]}>
        <mesh castShadow>
          <boxGeometry args={[4.4, 1.9, 0.09]} />
          <meshStandardMaterial color={palette.charcoal} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[4.15, 1.65, 0.02]} />
          <meshStandardMaterial color={palette.white} roughness={0.35} />
        </mesh>
        {/* Sketched lines */}
        <mesh position={[-0.7, 0.4, 0.08]}>
          <boxGeometry args={[2.2, 0.07, 0.01]} />
          <meshStandardMaterial color={palette.accent} roughness={0.6} />
        </mesh>
        <mesh position={[-1.1, 0.05, 0.08]}>
          <boxGeometry args={[1.4, 0.05, 0.01]} />
          <meshStandardMaterial color={palette.screen} roughness={0.6} />
        </mesh>
        <mesh position={[-0.4, -0.3, 0.08]}>
          <boxGeometry args={[2.8, 0.05, 0.01]} />
          <meshStandardMaterial color="#A9B4C2" roughness={0.6} />
        </mesh>
        {/* Marker tray */}
        <mesh position={[0, -1.02, 0.09]}>
          <boxGeometry args={[1.6, 0.06, 0.12]} />
          <meshStandardMaterial color={palette.metal} roughness={0.4} metalness={0.4} />
        </mesh>
      </group>

      {/* Wall clock */}
      <group position={[-6.8, 3.05, -ROOM_HALF + 0.06]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.52, 0.52, 0.1, 24]} />
          <meshStandardMaterial color={palette.charcoal} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.44, 0.44, 0.02, 24]} />
          <meshStandardMaterial color={palette.white} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.12, 0.085]}>
          <boxGeometry args={[0.035, 0.24, 0.01]} />
          <meshStandardMaterial color={palette.charcoal} roughness={0.6} />
        </mesh>
        <mesh position={[0.1, 0, 0.085]} rotation={[0, 0, -Math.PI / 2]}>
          <boxGeometry args={[0.03, 0.2, 0.01]} />
          <meshStandardMaterial color={palette.accent} roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}
