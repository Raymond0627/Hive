import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { AgentAnimation, AgentPreview } from '@hive/shared'
import { gridToWorld, palette } from './layout'
import { useStudioStore } from '../store/useStudioStore'

type Vec3 = [number, number, number]

/** Server snapshot interval (ms). Position is interpolated across this window. */
const TICK_MS = 105
/** Radians of walk cycle per world unit travelled, so feet never slide. */
const PHASE_PER_UNIT = 6.2

/** Standing geometry. Limbs are single rigid blocks, Minecraft style. */
const HIP_Y = 0.62
const SHOULDER_Y = 1.16
const LEG_LENGTH = 0.62
const ARM_LENGTH = 0.62
/** How far the whole body drops when it sits on a chair or bench. */
const SEAT_DROP = 0.14

/** Shortest-path angle damping: wraps delta into [-π, +π] so characters never spin 360°. */
function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = (target - current) % (Math.PI * 2)
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  return THREE.MathUtils.damp(current, current + diff, lambda, dt)
}

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

/** Persona props: glasses, headset, long hair. Relative to the head pivot. */
function Accessory({ id, hair }: { id: string; hair: string }) {
  if (id === 'gugel') {
    return (
      <group>
        {[-0.1, 0.1].map((x) => (
          <Block key={x} size={[0.15, 0.12, 0.02]} position={[x, 0.26, 0.235]} color="#1F262F" />
        ))}
        <Block size={[0.06, 0.02, 0.02]} position={[0, 0.27, 0.235]} color="#1F262F" />
      </group>
    )
  }
  if (id === 'aiz') {
    return (
      <group>
        <Block size={[0.52, 0.05, 0.6]} position={[0, 0.48, -0.02]} color="#2C333D" />
        {[-0.27, 0.27].map((x) => (
          <Block key={x} size={[0.08, 0.16, 0.16]} position={[x, 0.23, 0]} color="#2C333D" />
        ))}
      </group>
    )
  }
  if (id === 'sikyo') {
    return (
      <group>
        <Block size={[0.5, 0.42, 0.14]} position={[0, 0.31, -0.2]} color={hair} />
        {[-0.25, 0.25].map((x) => (
          <Block key={x} size={[0.08, 0.34, 0.16]} position={[x, 0.18, 0.12]} color={hair} />
        ))}
      </group>
    )
  }
  if (id === 'meow') {
    return <Block size={[0.2, 0.2, 0.2]} position={[0, 0.5, -0.22]} color={hair} />
  }
  return null
}

/**
 * Target transforms for the whole character. The rig has no knees or elbows:
 * only hips, shoulders and the head move, so every animation is built from
 * four rigid limbs plus body height, lean and tilt.
 *
 * Sign convention (rotation about +X): negative swings a limb forward (+z,
 * the way the character faces), positive swings it backwards.
 * `spread` pushes the limbs sideways for jumping jacks and stretches.
 */
interface Pose {
  bodyY: number
  bodyLean: number
  bodyTilt: number
  hipL: number
  hipR: number
  shoulderL: number
  shoulderR: number
  /** Extra forward swing shared by both arms (typing/game taps). */
  armTap: number
  spread: number
  headYaw: number
  headPitch: number
}

const REST: Pose = {
  bodyY: 0,
  bodyLean: 0,
  bodyTilt: 0,
  hipL: 0,
  hipR: 0,
  shoulderL: 0,
  shoulderR: 0,
  armTap: 0,
  spread: 0,
  headYaw: 0,
  headPitch: 0,
}

/** Seated base pose: legs swing forward to the horizontal, body drops. */
function seated(drop = SEAT_DROP): Pick<Pose, 'bodyY' | 'hipL' | 'hipR'> {
  return { bodyY: -drop, hipL: -Math.PI / 2, hipR: -Math.PI / 2 }
}

/** Locomotion, sitting and desk work. */
function workPose(
  animation: AgentAnimation,
  t: number,
  phase: number,
  stride: number,
): Pose | null {
  const pose: Pose = { ...REST }

  if (animation === 'walk') {
    const s = Math.sin(phase)
    pose.hipL = s * 0.55 * stride
    pose.hipR = -s * 0.55 * stride
    pose.shoulderL = -s * 0.45 * stride
    pose.shoulderR = s * 0.45 * stride
    pose.bodyY = Math.abs(Math.cos(phase)) * 0.028
    pose.bodyLean = -0.05
    pose.headPitch = 0.03
    return pose
  }

  if (animation === 'run') {
    const s = Math.sin(phase)
    pose.hipL = s * 0.85
    pose.hipR = -s * 0.85
    pose.shoulderL = -s * 0.7
    pose.shoulderR = s * 0.7
    // Elevate onto the treadmill running belt (deck surface is 0.27m)
    pose.bodyY = 0.27 + Math.abs(Math.cos(phase)) * 0.04
    pose.bodyLean = -0.14
    pose.headPitch = -0.05
    return pose
  }

  if (animation === 'type') {
    Object.assign(pose, seated())
    pose.bodyLean = -0.16
    pose.shoulderL = -1.25
    pose.shoulderR = -1.25
    pose.headPitch = 0.16
    // Tiny tap of the whole arm: enough to read as typing on blocky limbs.
    pose.bodyY += Math.sin(t * 11) * 0.008
    pose.armTap = Math.sin(t * 9) * 0.05
    return pose
  }

  if (animation === 'eat') {
    Object.assign(pose, seated())
    pose.bodyLean = -0.1
    pose.shoulderL = -0.7
    const bite = (Math.sin(t * 2.4) + 1) / 2
    pose.shoulderR = -0.8 - bite * 1.1
    pose.headPitch = 0.12 + bite * 0.1
    return pose
  }

  if (animation === 'play') {
    Object.assign(pose, seated())
    pose.bodyLean = -0.14
    pose.shoulderL = -1.15
    pose.shoulderR = -1.15
    pose.armTap = Math.sin(t * 7) * 0.12
    pose.headYaw = Math.sin(t * 0.9) * 0.12
    return pose
  }

  if (animation === 'rest') {
    Object.assign(pose, seated(0.2))
    pose.bodyLean = -0.05
    pose.headPitch = 0.42
    pose.shoulderL = -0.15
    pose.shoulderR = -0.15
    pose.bodyY += Math.sin(t * 1.1) * 0.012
    return pose
  }

  return null
}

/** Gym, kitchen and social poses. */
function bodyPose(animation: AgentAnimation, t: number): Pose | null {
  const pose: Pose = { ...REST }

  if (animation === 'lift') {
    // Dumbbell curl: both arms swing up together, legs straight.
    const up = (Math.sin(t * 2.4) + 1) / 2
    pose.shoulderL = -0.25 - up * 1.5
    pose.shoulderR = -0.25 - up * 1.5
    pose.bodyY = -0.03 * (1 - up)
    pose.bodyLean = -0.06
    pose.headPitch = -0.04
    return pose
  }

  if (animation === 'pushups') {
    // Prone plank: body tilts forward (+X) so chest and face point DOWN at the mat.
    // Height stays positive (+0.22 to +0.38) so chest and limbs stay above floor.
    const down = (Math.sin(t * 2.8) + 1) / 2
    pose.bodyTilt = 1.48
    pose.bodyY = 0.22 + (1 - down) * 0.16
    pose.shoulderL = -1.45
    pose.shoulderR = -1.45
    pose.spread = 0.12
    pose.headPitch = -0.15
    return pose
  }

  if (animation === 'jacks') {
    // Spread and close, with a small hop at the top.
    const open = (Math.sin(t * 4.2) + 1) / 2
    pose.spread = open * 0.9
    pose.shoulderL = -open * 2.4
    pose.shoulderR = -open * 2.4
    pose.bodyY = Math.abs(Math.sin(t * 4.2)) * 0.06
    return pose
  }

  if (animation === 'stretch') {
    pose.shoulderL = -2.9 + Math.sin(t * 0.9) * 0.12
    pose.shoulderR = -2.9 - Math.sin(t * 0.9) * 0.12
    pose.spread = 0.18
    pose.headPitch = -0.2
    pose.bodyLean = 0.06
    return pose
  }

  if (animation === 'cook') {
    // One arm sweeps across the counter while the other steadies the pan.
    pose.shoulderR = -1.1
    pose.spread = 0.3 + Math.sin(t * 2.6) * 0.3
    pose.shoulderL = -0.9
    pose.headPitch = 0.18
    pose.bodyLean = -0.05
    return pose
  }

  return null
}

/** Standing social poses: drinking, chatting, waving, plain idle. */
function socialPose(animation: AgentAnimation, t: number, seed: number): Pose {
  const pose: Pose = { ...REST }

  if (animation === 'drink') {
    const sip = (Math.sin(t * 1.6) + 1) / 2
    pose.shoulderR = -0.7 - sip * 0.9
    pose.shoulderL = -0.15
    pose.headPitch = -0.05 - sip * 0.1
    pose.bodyY = Math.abs(Math.sin(t * 1.6)) * 0.008
    return pose
  }

  if (animation === 'talk') {
    // Face the partner (the server sets facing), nod, and gesture now and then.
    pose.shoulderR = -0.35 - Math.max(0, Math.sin(t * 1.7)) * 0.55
    pose.spread = 0.16
    pose.headPitch = Math.sin(t * 2.6) * 0.1
    pose.headYaw = Math.sin(t * 0.8) * 0.12
    return pose
  }

  if (animation === 'wave') {
    pose.shoulderR = -2.75
    pose.spread = 0.35 + Math.sin(t * 9) * 0.22
    pose.headPitch = -0.08
    pose.bodyY = Math.abs(Math.sin(t * 4.5)) * 0.02
    return pose
  }

  if (animation === 'celebrate') {
    // Both arms raised in triumph, small bounce (P3.3)
    pose.shoulderL = -2.7 + Math.sin(t * 8) * 0.15
    pose.shoulderR = -2.7 - Math.sin(t * 8) * 0.15
    pose.spread = 0.35
    pose.headPitch = -0.15
    pose.bodyY = Math.abs(Math.sin(t * 8)) * 0.06
    return pose
  }

  if (animation === 'frustrated') {
    // Head dropped into hands/chest, slight sigh (P3.3)
    pose.headPitch = 0.35 + Math.sin(t * 5) * 0.03
    pose.shoulderL = 0.2
    pose.shoulderR = 0.2
    pose.bodyLean = 0.12
    pose.bodyY = -0.04
    return pose
  }

  // idle: breathe, sway, glance around.
  pose.bodyY = Math.sin(t * 1.6 + seed) * 0.012
  pose.shoulderL = Math.sin(t * 0.9) * 0.05
  pose.shoulderR = -Math.sin(t * 0.9) * 0.05
  pose.headYaw = Math.sin(t * 0.35 + seed) * 0.26
  return pose
}

/** Pick the pose for this snapshot's animation. */
function buildPose(
  animation: AgentAnimation,
  t: number,
  phase: number,
  stride: number,
  seed: number,
): Pose {
  return (
    workPose(animation, t, phase, stride) ??
    bodyPose(animation, t) ??
    socialPose(animation, t, seed)
  )
}

interface AgentModelProps {
  agent: AgentPreview
  position: [number, number, number]
  facing: number
  animation: AgentAnimation
  speech: string | null
  selected: boolean
  onSelect: () => void
}

export function AgentModel({
  agent,
  position,
  facing,
  animation,
  speech,
  selected,
  onSelect,
}: AgentModelProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const cup = useRef<THREE.Group>(null)
  const plate = useRef<THREE.Group>(null)
  const weights = useRef<THREE.Group>(null)

  const spawn = useRef(new THREE.Vector3(position[0], 0, position[2]))

  const [hovered, setHovered] = useState(false)
  const setDragging = useStudioStore((state) => state.setDragging)
  const isDragging = useStudioStore((state) => state.draggingId === agent.id)
  const dragTarget = useStudioStore((state) => state.dragTarget)
  const a = agent.appearance

  // 10 Hz server positions are replayed over one tick, so the body glides at a
  // constant speed and the walk cycle gets a steady input.
  const from = useRef(new THREE.Vector3(position[0], 0, position[2]))
  const to = useRef(new THREE.Vector3(position[0], 0, position[2]))
  const hopStart = useRef(0)
  const hopLength = useRef(0)
  const lastFrame = useRef(new THREE.Vector3(position[0], 0, position[2]))

  const phase = useRef(agent.id.length * 1.7)
  const speed = useRef(0)
  const seed = agent.id.length * 0.9

  useEffect(() => {
    const next = new THREE.Vector3(position[0], 0, position[2])
    if (Math.abs(next.x - to.current.x) < 0.0005 && Math.abs(next.z - to.current.z) < 0.0005) {
      return
    }
    const current = root.current ? root.current.position : lastFrame.current
    from.current.copy(current)
    to.current.copy(next)
    hopLength.current = from.current.distanceTo(to.current)
    hopStart.current = performance.now()
  }, [position])

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime()
    const dt = Math.max(0.0001, Math.min(delta, 0.05))

    // ── Position: stick to the pointer, or glide along the last hop ────────
    let travelled = 0
    if (root.current && isDragging && dragTarget) {
      const hover = 0.55 + Math.sin(t * 5.5) * 0.035
      root.current.position.x = THREE.MathUtils.damp(root.current.position.x, dragTarget.x, 22, dt)
      root.current.position.z = THREE.MathUtils.damp(root.current.position.z, dragTarget.z, 22, dt)
      root.current.position.y = THREE.MathUtils.damp(root.current.position.y, hover, 14, dt)
      lastFrame.current.copy(root.current.position)
    } else if (root.current) {
      root.current.position.y = THREE.MathUtils.damp(root.current.position.y, 0, 16, dt)
      if (hopLength.current > 1.6) {
        root.current.position.copy(to.current)
        from.current.copy(to.current)
      } else {
        const k = Math.min(1, (performance.now() - hopStart.current) / TICK_MS)
        root.current.position.lerpVectors(from.current, to.current, k)
        travelled = root.current.position.distanceTo(lastFrame.current)
      }
      lastFrame.current.copy(root.current.position)

      const dx = to.current.x - root.current.position.x
      const dz = to.current.z - root.current.position.z
      const moving = Math.hypot(dx, dz) > 0.02 && travelled > 0.0005
      const want = moving ? Math.atan2(dx, dz) : facing
      root.current.rotation.y = dampAngle(root.current.rotation.y, want, 10, dt)
    }

    // Speed drives the swing, so the cycle stops when the body stops.
    speed.current = THREE.MathUtils.damp(speed.current, travelled / dt, 6, dt)
    const stride = Math.min(1, speed.current / 1.4)
    if (animation === 'run') phase.current += dt * 13
    else if (travelled > 0) phase.current += Math.min(travelled, 0.25) * PHASE_PER_UNIT

    // ── Pose: dangle while held, otherwise the animation's pose ───────────
    const goal: Pose = isDragging
      ? {
          ...REST,
          hipL: 0.28 + Math.sin(t * 3.1) * 0.1,
          hipR: 0.16 - Math.sin(t * 3.1) * 0.1,
          shoulderL: -0.5 + Math.sin(t * 3.1) * 0.06,
          shoulderR: -0.42 - Math.sin(t * 3.1) * 0.06,
          spread: 0.24,
          bodyLean: 0.12,
          headPitch: 0.1,
        }
      : buildPose(animation, t, phase.current, stride, seed)

    const blend = 14
    const d = (obj: THREE.Group | null, axis: 'x' | 'y' | 'z', value: number) => {
      if (!obj) return
      obj.rotation[axis] = THREE.MathUtils.damp(obj.rotation[axis], value, blend, dt)
    }

    if (body.current) {
      body.current.position.y = THREE.MathUtils.damp(body.current.position.y, goal.bodyY, blend, dt)
      d(body.current, 'x', goal.bodyLean + goal.bodyTilt)
    }
    d(legL.current, 'x', goal.hipL)
    d(legR.current, 'x', goal.hipR)
    d(armL.current, 'x', goal.shoulderL + goal.armTap)
    d(armR.current, 'x', goal.shoulderR + goal.armTap)
    d(armL.current, 'z', goal.spread)
    d(armR.current, 'z', -goal.spread)
    d(legL.current, 'z', goal.spread * 0.18)
    d(legR.current, 'z', -goal.spread * 0.18)
    d(head.current, 'y', goal.headYaw)
    d(head.current, 'x', goal.headPitch)

    // Hand props follow the pose.
    if (cup.current) cup.current.visible = animation === 'drink' || animation === 'eat'
    if (plate.current) plate.current.visible = animation === 'cook'
    if (weights.current) weights.current.visible = animation === 'lift'

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
      rotation={[0, facing, 0]}
    >
      {/* Hitbox: hidden while dragging so the pointer reaches the floor plane. */}
      <mesh
        position={[0, 0.95, 0]}
        visible={!isDragging}
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

      {/* Selection / hover ring + contact shadow */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.32, 0.44, 32]} />
        <meshBasicMaterial
          color={selected ? palette.accent : '#FFFFFF'}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.3, 18]} />
        <meshBasicMaterial color="#0B0E13" transparent opacity={0.18} depthWrite={false} />
      </mesh>

      <group ref={body}>
        {/* Legs: one rigid block each, pivoting at the hip only. */}
        {[-1, 1].map((side) => (
          <group
            key={`leg-${side}`}
            ref={side < 0 ? legL : legR}
            position={[side * 0.13, HIP_Y, 0]}
          >
            <Block
              size={[0.22, LEG_LENGTH, 0.24]}
              position={[0, -LEG_LENGTH / 2, 0]}
              color={a.pants}
            />
            <Block
              size={[0.24, 0.12, 0.34]}
              position={[0, -LEG_LENGTH - 0.04, 0.05]}
              color={a.shoes}
            />
          </group>
        ))}

        {/* Torso + badge */}
        <Block size={[0.56, 0.56, 0.32]} position={[0, 0.92, 0]} color={a.shirt} />
        <Block size={[0.08, 0.08, 0.02]} position={[0.16, 1.01, 0.17]} color={palette.accent} />

        {/* Arms: one rigid block each, pivoting at the shoulder only. */}
        {[-1, 1].map((side) => (
          <group
            key={`arm-${side}`}
            ref={side < 0 ? armL : armR}
            position={[side * 0.36, SHOULDER_Y, 0]}
          >
            <Block
              size={[0.16, ARM_LENGTH, 0.2]}
              position={[0, -ARM_LENGTH / 2, 0]}
              color={a.shirt}
            />
            <Block
              size={[0.16, 0.14, 0.2]}
              position={[0, -ARM_LENGTH - 0.03, 0]}
              color={a.skin}
            />

            {/* Hand props: cup / plate / dumbbell, right hand only. */}
            {side > 0 && (
              <group ref={cup} position={[0, -ARM_LENGTH - 0.1, 0.02]} visible={false}>
                <mesh castShadow>
                  <boxGeometry args={[0.13, 0.15, 0.13]} />
                  <meshStandardMaterial color="#F7F3EA" roughness={0.6} />
                </mesh>
                <mesh position={[0, 0.06, 0]}>
                  <boxGeometry args={[0.14, 0.03, 0.14]} />
                  <meshStandardMaterial color={palette.accent} roughness={0.6} />
                </mesh>
              </group>
            )}
            {side > 0 && (
              <group ref={plate} position={[0, -ARM_LENGTH - 0.08, 0.04]} visible={false}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.19, 0.17, 0.035, 14]} />
                  <meshStandardMaterial color="#E8E2D5" roughness={0.7} />
                </mesh>
              </group>
            )}
            {side > 0 && (
              <group ref={weights} position={[0, -ARM_LENGTH - 0.1, 0]} visible={false}>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.03, 0.03, 0.4, 10]} />
                  <meshStandardMaterial color={palette.metal} roughness={0.35} metalness={0.6} />
                </mesh>
                {[-0.16, 0.16].map((dz) => (
                  <mesh key={dz} position={[0, 0, dz]} castShadow>
                    <boxGeometry args={[0.14, 0.14, 0.08]} />
                    <meshStandardMaterial color="#2C333D" roughness={0.7} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        ))}

        {/* Neck + head (own pivot: nods while talking, drops while resting). */}
        <group ref={head} position={[0, 1.24, 0]}>
          <Block size={[0.18, 0.08, 0.18]} position={[0, 0, 0]} color={a.skin} />
          <Block size={[0.46, 0.44, 0.44]} position={[0, 0.24, 0]} color={a.skin} />
          <Block size={[0.5, 0.16, 0.48]} position={[0, 0.5, 0]} color={a.hair} />
          {[-0.11, 0.11].map((x) => (
            <Block key={x} size={[0.07, 0.08, 0.02]} position={[x, 0.26, 0.225]} color="#1B2027" />
          ))}
          <Block size={[0.12, 0.025, 0.02]} position={[0, 0.11, 0.225]} color="#B9825F" />
          <Accessory id={agent.id} hair={a.hair} />
        </group>
      </group>

      {/* Overhead bubble & name tag (stable single Html container, elevated above head) */}
      {(speech || hovered || selected) && (
        <Html position={[0, 2.85, 0]} center zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          {speech ? (
            (() => {
              const cleanSpeech = speech.replace(/^→\s*[^:]+:\s*/, '').replace(/^[A-Za-z]+:\s*/, '')
              const isEmote = cleanSpeech.length <= 4 && !cleanSpeech.includes(' ')
              return (
                <div className="relative -translate-y-1 animate-bubble-in">
                  {isEmote ? (
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs shadow-[0_6px_16px_-3px_rgba(0,0,0,0.35)] border border-white/30"
                      style={{ backgroundColor: a.shirt }}
                    >
                      {cleanSpeech}
                    </div>
                  ) : (
                    <div
                      className="w-max max-w-[205px] rounded-lg border border-white/20 px-2.5 py-1.5 text-left text-[10px] font-semibold leading-snug text-white shadow-[0_8px_20px_-4px_rgba(0,0,0,0.45)]"
                      style={{ backgroundColor: a.shirt }}
                    >
                      {cleanSpeech}
                    </div>
                  )}
                  <span
                    className="absolute -bottom-[4px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 rounded-[1px] border-b border-r border-white/20"
                    style={{ backgroundColor: a.shirt }}
                  />
                </div>
              )
            })()
          ) : (
            <div className="flex -translate-y-1 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-ink-900/90 px-2 py-0.5 shadow-lg backdrop-blur">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: a.shirt }}
              />
              <span className="text-[10px] font-semibold text-white">{agent.name}</span>
              <span className="text-[9px] text-ink-300">{agent.role}</span>
            </div>
          )}
        </Html>
      )}
    </group>
  )
}

/** One agent, subscribed to its own live cell so neighbours don't re-render. */
function AgentAt({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentPreview
  selected: boolean
  onSelect: () => void
}) {
  const live = useStudioStore((state) => state.live[agent.id])
  const { x, z } = gridToWorld(live?.x ?? agent.desk.x, live?.y ?? agent.desk.y + 2)

  return (
    <AgentModel
      agent={agent}
      position={[x, 0, z]}
      facing={live?.facing ?? Math.PI}
      animation={live?.animation ?? 'idle'}
      speech={live?.speech ?? null}
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
      {agents.map((agent) => (
        <AgentAt
          key={agent.id}
          agent={agent}
          selected={selectedAgentId === agent.id}
          onSelect={() => selectAgent(agent.id)}
        />
      ))}
    </group>
  )
}
