import { useEffect, useRef, useState } from 'react'
import { useStudioStore } from '../store/useStudioStore'
import { sendMessage } from '../net/socket'
import { GRID_SIZE, ROOM_SIZE, TILE, gridToWorld } from './layout'

/** Drop target: tracks the pointer while an agent is being dragged. */
export function DragLayer() {
  const draggingId = useStudioStore((state) => state.draggingId)
  const setDragging = useStudioStore((state) => state.setDragging)
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null)
  const cell = useRef<[number, number] | null>(null)

  useEffect(() => {
    if (!draggingId) return
    const drop = () => {
      const target = cell.current
      if (target) {
        sendMessage({ type: 'drag_agent', agentId: draggingId, x: target[0], y: target[1] })
      }
      cell.current = null
      setGhost(null)
      setDragging(null)
    }
    window.addEventListener('pointerup', drop)
    return () => window.removeEventListener('pointerup', drop)
  }, [draggingId, setDragging])

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        onPointerMove={(event) => {
          if (!draggingId) return
          const gx = Math.round(event.point.x / TILE + GRID_SIZE / 2)
          const gy = Math.round(event.point.z / TILE + GRID_SIZE / 2)
          const cx = Math.max(1, Math.min(GRID_SIZE - 2, gx))
          const cy = Math.max(1, Math.min(GRID_SIZE - 2, gy))
          cell.current = [cx, cy]
          setGhost(gridToWorld(cx, cy))
        }}
      >
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {ghost && draggingId && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ghost.x, 0.05, ghost.z]}>
          <ringGeometry args={[0.34, 0.46, 32]} />
          <meshBasicMaterial color="#F97316" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
