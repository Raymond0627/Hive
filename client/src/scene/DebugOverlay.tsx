import { Html } from '@react-three/drei'
import { useStudioStore } from '../store/useStudioStore'
import { GRID_SIZE, TILE, ROOM_SIZE, gridToWorld } from './layout'

/**
 * 3D Debug Overlay (Brief P0.1):
 *  - 40x40 grid lines
 *  - Blocked cells in red on the floor
 *  - Furniture slot markers
 *  - Active agent paths and destination goals
 */
export function DebugOverlay() {
  const active = useStudioStore((state) => state.debugOverlay)
  const debugMap = useStudioStore((state) => state.debugMap)
  const live = useStudioStore((state) => state.live)

  if (!active) return null

  return (
    <group position={[0, 0.02, 0]}>
      {/* 40x40 simulation grid lines */}
      <gridHelper
        args={[ROOM_SIZE, GRID_SIZE, '#F97316', '#3A4453']}
        position={[0, 0.005, 0]}
      />

      {/* Blocked cells in red */}
      {debugMap?.blocked.map(([gx, gy]) => {
        const { x, z } = gridToWorld(gx, gy)
        return (
          <mesh
            key={`b-${gx}:${gy}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[x, 0.01, z]}
          >
            <planeGeometry args={[TILE * 0.94, TILE * 0.94]} />
            <meshBasicMaterial color="#EF4444" transparent opacity={0.32} depthWrite={false} />
          </mesh>
        )
      })}

      {/* Furniture slots in cyan */}
      {debugMap?.slots.map((s) => {
        const { x, z } = gridToWorld(s.stand.x, s.stand.y)
        return (
          <group key={`s-${s.id}`} position={[x, 0.02, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.18, 0.26, 16]} />
              <meshBasicMaterial color="#38BDF8" transparent opacity={0.75} depthWrite={false} />
            </mesh>
          </group>
        )
      })}

      {/* Live paths and goals for moving agents */}
      {Object.entries(live).map(([id, sim]) => {
        if (!sim.goal) return null
        const currentPos = gridToWorld(sim.x, sim.y)
        const goalPos = gridToWorld(sim.goal.x, sim.goal.y)

        return (
          <group key={`path-${id}`}>
            {/* Goal marker on the floor */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[goalPos.x, 0.03, goalPos.z]}
            >
              <ringGeometry args={[0.26, 0.38, 24]} />
              <meshBasicMaterial color="#22C55E" transparent opacity={0.85} depthWrite={false} />
            </mesh>

            {/* Path line waypoints */}
            {sim.path?.map((p, idx) => {
              const wp = gridToWorld(p.x, p.y)
              return (
                <mesh
                  key={`wp-${id}-${idx}`}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[wp.x, 0.025, wp.z]}
                >
                  <circleGeometry args={[0.08, 12]} />
                  <meshBasicMaterial color="#4ADE80" transparent opacity={0.8} depthWrite={false} />
                </mesh>
              )
            })}

            {/* State tag above the agent's head */}
            <Html
              position={[currentPos.x, 2.7, currentPos.z]}
              center
              style={{ pointerEvents: 'none' }}
            >
              <div className="whitespace-nowrap rounded border border-white/20 bg-ink-900/95 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300 shadow">
                {id}: {sim.activity} → {sim.goal.x},{sim.goal.y}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
