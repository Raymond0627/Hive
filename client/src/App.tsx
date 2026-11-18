import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OfficeScene } from './scene/OfficeScene'
import { TopBar } from './ui/TopBar'
import { AgentPanel } from './ui/AgentPanel'
import { ZoneLegend } from './ui/ZoneLegend'
import { useStudioStore } from './store/useStudioStore'
import { connectSocket } from './net/socket'

export default function App() {
  const loadAgents = useStudioStore((state) => state.loadAgents)
  const selectAgent = useStudioStore((state) => state.selectAgent)
  const backend = useStudioStore((state) => state.backend)
  const agentCount = useStudioStore((state) => state.agents.length)

  // Poll until the server answers, then stop. Steps 5+ replace this with the
  // WebSocket snapshot.
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const tick = async () => {
      await loadAgents()
      if (cancelled) return
      if (useStudioStore.getState().backend !== 'online') {
        timer = window.setTimeout(() => void tick(), 2500)
      }
    }

    void tick()
    connectSocket()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [loadAgents])

  // Distinguish a click-to-deselect from a camera drag.
  const pressPoint = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-ink-900"
      onPointerDownCapture={(event) => {
        pressPoint.current = { x: event.clientX, y: event.clientY }
      }}
    >
      <div className="absolute inset-0">
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true }}
          onPointerMissed={(event) => {
            const start = pressPoint.current
            const moved = start
              ? Math.hypot(event.clientX - start.x, event.clientY - start.y)
              : 0
            if (moved < 6) selectAgent(null)
          }}
        >
          <OfficeScene />
        </Canvas>
      </div>

      {/* Vignette so the room sits in the dark UI instead of floating. */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(0,0,0,0.5)_100%)]" />

      <TopBar />
      <ZoneLegend />
      <AgentPanel />

      {backend === 'offline' && agentCount === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6">
          <div className="panel max-w-sm px-5 py-4 text-center">
            <p className="text-sm font-medium text-white">Waiting for the engine</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-200">
              Start Hive with{' '}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">
                npm run dev
              </code>{' '}
              from the repo root. The office is live; agents walk in as soon as the server
              answers.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
