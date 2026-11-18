import { palette } from './layout'
import { Plant } from './Furniture'

function Treadmill({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {/* Deck */}
      <mesh position={[0, 0.13, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.26, 2.6]} />
        <meshStandardMaterial color={palette.charcoal} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.27, 0]}>
        <boxGeometry args={[1, 0.03, 2.2]} />
        <meshStandardMaterial color="#232932" roughness={0.95} />
      </mesh>
      {[-0.62, 0.62].map((sx) => (
        <mesh key={sx} position={[sx, 0.29, 0]}>
          <boxGeometry args={[0.1, 0.05, 2.42]} />
          <meshStandardMaterial color={palette.metal} roughness={0.35} metalness={0.5} />
        </mesh>
      ))}
      {/* Console */}
      <mesh position={[0, 0.72, -1.22]} castShadow>
        <boxGeometry args={[0.13, 1.18, 0.13]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.36, -1.2]} castShadow>
        <boxGeometry args={[0.98, 0.44, 0.1]} />
        <meshStandardMaterial color={palette.charcoal} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.38, -1.14]}>
        <boxGeometry args={[0.72, 0.26, 0.02]} />
        <meshStandardMaterial
          color={palette.screen}
          emissive={palette.screen}
          emissiveIntensity={0.4}
          roughness={0.3}
        />
      </mesh>
    </group>
  )
}

function BenchPress({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.16, 2]} />
        <meshStandardMaterial color="#2F3742" roughness={0.9} />
      </mesh>
      {[-0.8, 0.8].map((sz) =>
        [-0.2, 0.2].map((sx) => (
          <mesh key={`${sx}:${sz}`} position={[sx, 0.28, sz]} castShadow>
            <boxGeometry args={[0.1, 0.56, 0.1]} />
            <meshStandardMaterial color={palette.darkMetal} roughness={0.45} metalness={0.4} />
          </mesh>
        )),
      )}
      {/* Uprights */}
      {[-0.95, 0.95].map((sx) => (
        <mesh key={sx} position={[sx, 0.85, -0.62]} castShadow>
          <boxGeometry args={[0.14, 1.7, 0.14]} />
          <meshStandardMaterial color={palette.darkMetal} roughness={0.45} metalness={0.4} />
        </mesh>
      ))}
      {/* Barbell */}
      <mesh position={[0, 1.58, -0.62]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 2.5, 12]} />
        <meshStandardMaterial color={palette.metal} roughness={0.3} metalness={0.75} />
      </mesh>
      {[-1.05, 1.05].map((sx) => (
        <mesh
          key={sx}
          position={[sx, 1.58, -0.62]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
          <meshStandardMaterial color="#2C333D" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function DumbbellRack({ x, z }: { x: number; z: number }) {
  const rack = [0.45, 0.95]
  return (
    <group position={[x, 0, z]}>
      {[-1.35, 1.35].map((sz) => (
        <mesh key={sz} position={[0, 0.55, sz]} castShadow>
          <boxGeometry args={[0.6, 1.1, 0.12]} />
          <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {rack.map((y) => (
        <group key={y}>
          <mesh position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.08, 2.7]} />
            <meshStandardMaterial color={palette.darkMetal} roughness={0.5} metalness={0.3} />
          </mesh>
          {[-0.9, 0, 0.9].map((sz) => (
            <group key={sz} position={[0.18, y + 0.13, sz]}>
              <mesh>
                <boxGeometry args={[0.34, 0.07, 0.07]} />
                <meshStandardMaterial color={palette.metal} roughness={0.3} metalness={0.7} />
              </mesh>
              {[-0.16, 0.16].map((sx) => (
                <mesh key={sx} position={[sx, 0, 0]} castShadow>
                  <boxGeometry args={[0.14, 0.2, 0.2]} />
                  <meshStandardMaterial color="#2C333D" roughness={0.65} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

function Kettlebells({ x, z }: { x: number; z: number }) {
  const bells = [
    { dx: 0, dz: 0, s: 1 },
    { dx: 0.55, dz: 0.2, s: 0.8 },
    { dx: 0.3, dz: -0.5, s: 0.9 },
  ]
  return (
    <group position={[x, 0, z]}>
      {bells.map((b, i) => (
        <group key={i} position={[b.dx, 0, b.dz]} scale={b.s}>
          <mesh position={[0, 0.24, 0]} castShadow>
            <boxGeometry args={[0.42, 0.34, 0.42]} />
            <meshStandardMaterial color="#2C333D" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.48, 0]} castShadow>
            <boxGeometry args={[0.24, 0.14, 0.16]} />
            <meshStandardMaterial color={palette.metal} roughness={0.35} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Gym() {
  return (
    <group>
      <Treadmill x={9.0} z={1.2} />
      <BenchPress x={4.9} z={3.1} />
      <DumbbellRack x={10.9} z={7.2} />
      <Kettlebells x={3.6} z={8.5} />
      <Plant x={11} z={10.3} scale={0.85} />

      {/* Yoga mat */}
      <group position={[7.4, 0, 8.6]} rotation={[0, 0.16, 0]}>
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <boxGeometry args={[1.8, 0.04, 3]} />
          <meshStandardMaterial color="#7FB2A0" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.052, 0]}>
          <boxGeometry args={[1.52, 0.01, 2.7]} />
          <meshStandardMaterial color="#93C4B2" roughness={0.95} />
        </mesh>
      </group>
    </group>
  )
}
