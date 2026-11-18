import { useEffect, useRef } from 'react'
import { useStudioStore } from '../store/useStudioStore'
import { sendMessage } from '../net/socket'
import { GRID_SIZE, ROOM_SIZE, TILE, gridToWorld } from './layout'

/**
 * Drop target: tracks the pointer while an agent is dragged.
 *
 * The character itself follows the pointer (see `AgentModel`); this layer only
 * converts the pointer into a grid cell, reports whether that cell is a legal
 * landing spot, and sends the drop to the server.
 */
export function DragLayer() {
  const draggingId = useStudioStore((state) => state.draggingId)
  const dragTarget = useStudioStore((state) => state.dragTarget)
  const setDragging = useStudioStore((state) => state.setDragging)
  const setDragTarget = useStudioStore((state) => state.setDragTarget)
  const cell = useRef<[number, number] | null>(null)

  useEffect(() => {
    if (!draggingId) return

    const drop = () => {
      const target = cell.current
      if (target) {
        sendMessage({ type: 'drag_agent', agentId: draggingId, x: target[0], y: target[1] })
      }
      cell.current = null
      setDragTarget(null)
      setDragging(null)
    }

    // Escape cancels the drag without telling the server anything.
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cell.current = null
      setDragTarget(null)
      setDragging(null)
    }

    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', drop)
    window.addEventListener('keydown', cancel)
    return () => {
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', drop)
      window.removeEventListener('keydown', cancel)
    }
  }, [draggingId, setDragging, setDragTarget])

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

          // Valid = inside the room and not on top of another agent.
          const others = Object.entries(useStudioStore.getState().live).filter(
            ([id]) => id !== draggingId,
          )
          const free = others.every(
            ([, agent]) => Math.hypot(agent.x - cx, agent.y - cy) > 0.9,
          )
          const { x, z } = gridToWorld(cx, cy)
          setDragTarget({ x, z, gx: cx, gy: cy, valid: free })
        }}
      >
        <planeGeometry args={[ROOM_SIZE, ROOM_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Landing marker: green when the cell is free, red when somebody is there. */}
      {dragTarget && draggingId && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[dragTarget.x, 0.05, dragTarget.z]}
        >
          <ringGeometry args={[0.32, 0.46, 32]} />
          <meshBasicMaterial
            color={dragTarget.valid ? '#4ADE80' : '#F87171'}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
