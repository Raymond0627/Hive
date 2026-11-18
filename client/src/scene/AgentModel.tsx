import { useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { AgentPreview } from '@hive/shared'
import { gridToWorld, palette } from './layout'
import { useStudioStore } from '../store/useStudioStore'

type Vec3 = [number, number, number]

function Block({
  size,
  position,
  color,
  rotation,
}: {
  size: Vec3
  position: Vec3
  color: string
  rotation?: Vec3
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
  )
}

/** Persona-specific props: glasses, headset, long hair. */
function Accessory({ id, hair }: { id: string; hair: string }) {
  if (id === 'gugel') {
    return (
      <group>
        {[-0.1, 0.1].map((x) => (
          <Block key={x} size={[0.15, 0.12, 0.02]} position={[x, 1.5, 0.235]} color="#1F262F" />
        ))}
        <Block size={[0.06, 0.02, 0.02]} position={[0, 1.51, 0.235]} color="#1F262F" />
      </group>
    )
  }
  if (id === 'aiz') {
    return (
      <group>
        <Block size={[0.52, 0.05, 0.6]} position={[0, 1.72, -0.02]} color="#2C333D" />
        {[-0.27, 0.27].map((x) => (
          <Block key={x} size={[0.08, 0.16, 0.16]} position={[x, 1.47, 0]} color="#2C333D" />
        ))}
      </group>
    )
  }
  if (id === 'sikyo') {
    return (
      <group>
        <Block size={[0.5, 0.42, 0.14]} position={[0, 1.55, -0.2]} color={hair} />
        {[-0.25, 0.25].map((x) => (
          <Block key={x} size={[0.08, 0.34, 0.16]} position={[x, 1.42, 0.12]} color={hair} />
        ))}
      </group>
    )
  }
  if (id === 'meow') {
    return <Block size={[0.2, 0.2, 0.2]} position={[0, 1.74, -0.22]} color={hair} />
  }
  return null
}

interface AgentModelProps {
  agent: AgentPreview
  position: [number, number, number]
  rotationY?: number
  walking?: boolean
  selected: boolean
  onSelect: () => void
}

export function AgentModel({
  agent,
  position,
  rotationY = 0,
  walking = false,
  selected,
  onSelect,
}: AgentModelProps) {
  const body = useRef<THREE.Group>(null)
  const root = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const target = useRef(new THREE.Vector3(position[0], 0, position[2]))
  const spawn = useRef(new THREE.Vector3(position[0], 0, position[2]))
  target.current.set(position[0], 0, position[2])
  const [hovered, setHovered] = useState(false)
  const setDragging = useStudioStore((state) => state.setDragging)
  const a = agent.appearance

  // Idle breathing + a slow sway; zero AI involved (brief section 7).
  useFrame(({ clock },) => {
    const t = clock.getElapsedTime()
    const phase = agent.id.length * 1.9 + agent.name.charCodeAt(0) * 0.05
    if (body.current) {
      const speed = walking ? 9 : 1.6
      body.current.position.y = Math.abs(Math.sin(t * speed + phase)) * (walking ? 0.06 : 0.014)
      body.current.rotation.y = walking ? 0 : Math.sin(t * 0.5 + phase) * 0.05
      body.current.rotation.z = walking ? Math.sin(t * speed + phase) * 0.04 : 0
    }
    if (ring.current) {
      const material = ring.current.material as THREE.MeshBasicMaterial
      const pulse = selected ? 0.6 + Math.sin(t * 2.6) * 0.22 : hovered ? 0.4 : 0.14
      material.opacity = pulse
    }
    })

  return (
    <group
      ref={root}
      position={[spawn.current.x, 0, spawn.current.z]}
      rotation={[0, rotationY, 0]}
    >
      {/* Invisible hitbox: easy to click, even for the small arms */}
      <mesh
        position={[0, 0.95, 0]}
        onPointerDown={(event) => {
          event.stopPropagation()
          setDragging(agent.id)
        }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <boxGeometry args={[0.95, 1.95, 0.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection / hover ring on the floor */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.52, 0.66, 40]} />
        <meshBasicMaterial
          color={selected ? palette.accent : '#FFFFFF'}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group ref={body}>
        {/* Shoes + legs */}
        {[-0.13, 0.13].map((x, _i) => {
          return (
            <group key={x} position={[x, 0.06, 0.04]} >
              <Block size={[0.24, 0.12, 0.36]} position={[0, 0, 0]} color={a.shoes} />
              <Block size={[0.2, 0.5, 0.24]} position={[0, 0.37, 0]} color={a.pants} />
            </group>
          )
        })}

        {/* Torso + badge */}
        <Block size={[0.56, 0.56, 0.32]} position={[0, 0.93, 0]} color={a.shirt} />
        <Block size={[0.08, 0.08, 0.02]} position={[0.16, 1.02, 0.17]} color={palette.accent} />

        {/* Arms + hands */}
        {[-0.36, 0.36].map((x) => (
          <group key={x}>
            <Block size={[0.16, 0.46, 0.2]} position={[x, 0.92, 0]} color={a.shirt} />
            <Block size={[0.16, 0.1, 0.2]} position={[x, 0.64, 0]} color={a.skin} />
          </group>
        ))}

        {/* Neck + head */}
        <Block size={[0.18, 0.08, 0.18]} position={[0, 1.24, 0]} color={a.skin} />
        <Block size={[0.46, 0.44, 0.44]} position={[0, 1.48, 0]} color={a.skin} />

        {/* Hair cap + face */}
        <Block size={[0.5, 0.16, 0.48]} position={[0, 1.74, 0]} color={a.hair} />
        {[-0.11, 0.11].map((x) => (
          <Block key={x} size={[0.07, 0.08, 0.02]} position={[x, 1.5, 0.225]} color="#1B2027" />
        ))}
        <Block size={[0.12, 0.025, 0.02]} position={[0, 1.35, 0.225]} color="#B9825F" />

        <Accessory id={agent.id} hair={a.hair} />
      </group>

      {/* Name tag on hover / selection only, so the room stays readable */}
      {(hovered || selected) && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="flex -translate-y-1 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-ink-900/90 px-2.5 py-1 shadow-lg backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[11px] font-semibold text-white">{agent.name}</span>
            <span className="text-[10px] text-ink-200">{agent.role}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

/** One agent, subscribed to its own live cell so neighbours don't re-render. */
function AgentAt({
  agent,
  index,
  selected,
  onSelect,
}: {
  agent: AgentPreview
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const live = useStudioStore((state) => state.live[agent.id])
  const { x, z } = gridToWorld(live?.x ?? agent.desk.x, live?.y ?? agent.desk.y + 2)

  return (
    <AgentModel
      agent={agent}
      position={[x, 0, z]}
      rotationY={((index % 3) - 1) * 0.16}
      walking={live?.activity === 'walking'}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

/** Renders every agent from the store at its live grid cell. */
export function Agents() {
  const agents = useStudioStore((state) => state.agents)
  const selectedAgentId = useStudioStore((state) => state.selectedAgentId)
  const selectAgent = useStudioStore((state) => state.selectAgent)

  return (
    <group>
      {agents.map((agent, index) => (
        <AgentAt
          key={agent.id}
          agent={agent}
          index={index}
          selected={selectedAgentId === agent.id}
          onSelect={() => selectAgent(agent.id)}
        />
      ))}
    </group>
  )
}
