import { useEffect, useRef } from 'react'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { useStudioStore } from '../store/useStudioStore'

/**
 * Isometric-styled camera with real perspective.
 *
 * A long lens placed far back keeps the 45°/35° isometric silhouette, but the
 * near corner of the room is genuinely closer to the lens, so it renders larger
 * than the far corner — no orthographic "flat cut-out" look.
 *
 * Controls follow the brief: drag to pan, wheel/pinch to zoom, shift-drag to
 * rotate. OrbitControls has no modifier binding, so we swap the left mouse
 * button while shift is held — it reads the button map on pointerdown.
 */
export function CameraRig() {
  // drei's OrbitControls ref is a three-stdlib instance; only mouseButtons is
  // touched here, so the exact instance type is not worth importing.
  const controls = useRef<any>(null)
  const dragging = useStudioStore((state) => state.draggingId !== null)

  useEffect(() => {
    const setLeftButton = (button: number) => {
      if (controls.current) controls.current.mouseButtons.LEFT = button
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setLeftButton(THREE.MOUSE.ROTATE)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setLeftButton(THREE.MOUSE.PAN)
    }
    const onBlur = () => setLeftButton(THREE.MOUSE.PAN)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <>
      <PerspectiveCamera makeDefault position={[46, 46, 46]} fov={26} near={0.5} far={500} />
      <OrbitControls
        ref={controls}
        makeDefault
        enabled={!dragging}
        target={[0, 0.6, 0]}
        enableDamping
        dampingFactor={0.09}
        screenSpacePanning={false}
        minPolarAngle={0.35}
        maxPolarAngle={1.25}
        minDistance={38}
        maxDistance={220}
        zoomSpeed={0.8}
        panSpeed={0.9}
        rotateSpeed={0.65}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
    </>
  )
}
