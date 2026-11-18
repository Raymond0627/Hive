import { palette } from './layout'
import { Floor } from './Floor'
import { Walls } from './Walls'
import { WorkArea } from './Furniture'
import { Pantry } from './Pantry'
import { Gym } from './Gym'
import { Agents } from './AgentModel'
import { CameraRig } from './CameraRig'
import { DragLayer } from './DragLayer'
import { DebugOverlay } from './DebugOverlay'

function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} color="#D8E4FF" />
      <hemisphereLight args={['#DCE8FF', '#4A3D2E', 0.55]} />

      {/* Key light: warm, casts the long soft shadows of a morning office. */}
      <directionalLight
        castShadow
        position={[14, 24, 11]}
        intensity={2.2}
        color="#FFF4E6"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={0.5}
        shadow-camera-far={70}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      {/* Cool fill from the opposite side so nothing goes muddy. */}
      <directionalLight position={[-12, 10, -8]} intensity={0.35} color="#BFD4FF" />
    </>
  )
}

export function OfficeScene() {
  return (
    <>
      <color attach="background" args={[palette.background]} />
      <Lights />

      <Floor />
      <Walls />
      <WorkArea />
      <Pantry />
      <Gym />
      <Agents />
      <DragLayer />
      <DebugOverlay />

      <CameraRig />
    </>
  )
}
