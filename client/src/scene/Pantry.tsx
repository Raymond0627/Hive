import { palette } from './layout'
import { Plant } from './Furniture'

/** L-shaped-ish kitchen run along the left wall, plus a table and cooler. */
function Counter() {
  return (
    <group>
      {/* Lower cabinets */}
      <mesh position={[-11.1, 0.45, 3]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.9, 6]} />
        <meshStandardMaterial color={palette.cabinet} roughness={0.75} />
      </mesh>
      {/* Counter top */}
      <mesh position={[-11.05, 0.94, 3]} castShadow receiveShadow>
        <boxGeometry args={[1.62, 0.08, 6.12]} />
        <meshStandardMaterial color={palette.counter} roughness={0.35} />
      </mesh>

      {/* Cabinet seams + handles */}
      {[0.9, 2.3, 3.7, 5.1].map((z) => (
        <group key={z}>
          <mesh position={[-10.34, 0.5, z]}>
            <boxGeometry args={[0.03, 0.72, 0.03]} />
            <meshStandardMaterial color="#AEBBC9" roughness={0.7} />
          </mesh>
          <mesh position={[-10.3, 0.78, z + 0.33]}>
            <boxGeometry args={[0.04, 0.04, 0.34]} />
            <meshStandardMaterial color={palette.darkMetal} roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Sink + faucet */}
      <mesh position={[-11.05, 0.985, 4.4]}>
        <boxGeometry args={[0.78, 0.02, 0.95]} />
        <meshStandardMaterial color="#9FACB9" roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[-11.55, 1.13, 4.4]}>
        <boxGeometry args={[0.07, 0.3, 0.07]} />
        <meshStandardMaterial color={palette.metal} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[-11.32, 1.26, 4.4]}>
        <boxGeometry args={[0.42, 0.06, 0.06]} />
        <meshStandardMaterial color={palette.metal} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* Coffee machine + cup */}
      <group position={[-11.05, 0.98, 1.5]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.5, 0.56, 0.42]} />
          <meshStandardMaterial color={palette.charcoal} roughness={0.5} />
        </mesh>
        <mesh position={[0.02, 0.44, 0.22]}>
          <boxGeometry args={[0.24, 0.1, 0.02]} />
          <meshStandardMaterial
            color={palette.accent}
            emissive={palette.accent}
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0.02, 0.14, 0.24]}>
          <boxGeometry args={[0.16, 0.05, 0.08]} />
          <meshStandardMaterial color={palette.metal} roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0.02, 0.06, 0.3]}>
          <boxGeometry args={[0.14, 0.12, 0.12]} />
          <meshStandardMaterial color={palette.white} roughness={0.5} />
        </mesh>
      </group>

      {/* Upper cabinets */}
      <mesh position={[-11.65, 2.4, 2.8]} castShadow>
        <boxGeometry args={[0.7, 1, 4.2]} />
        <meshStandardMaterial color="#E2E9F0" roughness={0.8} />
      </mesh>
      {[1.5, 2.8, 4.1].map((z) => (
        <mesh key={z} position={[-11.28, 2.4, z]}>
          <boxGeometry args={[0.03, 0.86, 0.03]} />
          <meshStandardMaterial color="#B7C3CF" roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[-11.27, 2.15, 1.9]}>
        <boxGeometry args={[0.04, 0.04, 0.3]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.4} metalness={0.5} />
      </mesh>
    </group>
  )
}

function Fridge() {
  return (
    <group position={[-11.05, 0, 8.3]}>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 2.4, 1.7]} />
        <meshStandardMaterial color={palette.fridge} roughness={0.45} metalness={0.15} />
      </mesh>
      {/* Door split */}
      <mesh position={[0.92, 1.55, 0]}>
        <boxGeometry args={[0.02, 0.02, 1.6]} />
        <meshStandardMaterial color="#AEBAC6" roughness={0.6} />
      </mesh>
      <mesh position={[0.92, 0.62, 0]}>
        <boxGeometry args={[0.02, 1.2, 0.03]} />
        <meshStandardMaterial color="#AEBAC6" roughness={0.6} />
      </mesh>
      {/* Handles */}
      <mesh position={[0.96, 1.75, 0.62]}>
        <boxGeometry args={[0.05, 0.7, 0.06]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0.96, 1.15, 0.62]}>
        <boxGeometry args={[0.05, 0.5, 0.06]} />
        <meshStandardMaterial color={palette.darkMetal} roughness={0.35} metalness={0.6} />
      </mesh>
      {/* Note stuck to the door */}
      <mesh position={[0.93, 1.95, -0.2]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[0.26, 0.3, 0.01]} />
        <meshStandardMaterial color="#F4D35E" roughness={0.9} />
      </mesh>
    </group>
  )
}

function DiningSet() {
  return (
    <group position={[-5.6, 0, 6]}>
      <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.1, 2.4]} />
        <meshStandardMaterial color={palette.deskTop} roughness={0.75} />
      </mesh>
      {[-0.95, 0.95].map((sx) =>
        [-0.95, 0.95].map((sz) => (
          <mesh key={`${sx}:${sz}`} position={[sx, 0.36, sz]} castShadow>
            <boxGeometry args={[0.12, 0.72, 0.12]} />
            <meshStandardMaterial color={palette.deskLeg} roughness={0.55} metalness={0.2} />
          </mesh>
        )),
      )}
      {[
        [0, -1.75],
        [0, 1.75],
        [-1.75, 0],
        [1.75, 0],
      ].map(([sx, sz], i) => (
        <group key={i}>
          <mesh position={[sx, 0.3, sz]} castShadow>
            <boxGeometry args={[0.52, 0.6, 0.52]} />
            <meshStandardMaterial color={palette.chairSeat} roughness={0.85} />
          </mesh>
          <mesh position={[sx, 0.62, sz]} castShadow>
            <boxGeometry args={[0.42, 0.06, 0.42]} />
            <meshStandardMaterial color={palette.accent} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Fruit bowl */}
      <mesh position={[0, 0.84, 0]} castShadow>
        <boxGeometry args={[0.42, 0.1, 0.42]} />
        <meshStandardMaterial color={palette.white} roughness={0.5} />
      </mesh>
      <mesh position={[0.08, 0.94, 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color="#E0653F" roughness={0.7} />
      </mesh>
      <mesh position={[-0.09, 0.93, -0.05]} castShadow>
        <boxGeometry args={[0.14, 0.14, 0.14]} />
        <meshStandardMaterial color="#8FBF6B" roughness={0.7} />
      </mesh>
    </group>
  )
}

function WaterCooler() {
  return (
    <group position={[-2.6, 0, 9.7]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 1.1, 0.72]} />
        <meshStandardMaterial color={palette.white} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.62, 0.37]}>
        <boxGeometry args={[0.2, 0.2, 0.04]} />
        <meshStandardMaterial color={palette.metal} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.42, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.56, 16]} />
        <meshStandardMaterial color="#8FD4E8" roughness={0.2} metalness={0.1} />
      </mesh>
    </group>
  )
}

export function Pantry() {
  return (
    <group>
      <Counter />
      <Fridge />
      <DiningSet />
      <WaterCooler />
      <Plant x={-10.4} z={10.1} scale={0.85} />
      {/* Accent rug under the dining set */}
      <mesh position={[-5.6, 0.026, 6]} receiveShadow>
        <boxGeometry args={[4.8, 0.02, 4.8]} />
        <meshStandardMaterial color="#EFD7B4" roughness={1} />
      </mesh>
    </group>
  )
}
