import { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OfficeScene } from './scene/OfficeScene'
import { TopBar } from './ui/TopBar'
import { AgentPanel } from './ui/AgentPanel'
import { JobBoard } from './ui/JobBoard'
import { useStudioStore } from './store/useStudioStore'
import { connectSocket } from './net/socket'

function FloatingDock() {
  const agents = useStudioStore((state) => state.agents)
  const selectedAgentId = useStudioStore((state) => state.selectedAgentId)
  const selectAgent = useStudioStore((state) => state.selectAgent)
  return (
    <nav aria-label="Hive panels" className="pointer-events-auto absolute bottom-4 left-4 z-40 flex flex-col items-center gap-2">
      <button type="button" aria-label="Toggle Pipeline Board" title="Pipeline Board" onClick={() => window.dispatchEvent(new Event('hive:toggle-job-board'))} className="popup-surface flex h-12 w-12 items-center justify-center rounded-2xl text-accent-soft transition hover:border-accent/50 hover:bg-ink-800">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 6.5h14M5 12h14M5 17.5h9" strokeLinecap="round" /><path d="M3.5 3.5h17v17h-17z" opacity=".28" /></svg>
      </button>
      <button type="button" aria-label="Open Character Info" title="Character Info" onClick={() => selectAgent(selectedAgentId ?? agents[0]?.id ?? null)} className="popup-surface flex h-12 w-12 items-center justify-center rounded-2xl text-accent-soft transition hover:border-accent/50 hover:bg-ink-800">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M6.5 19c.6-3.1 2.4-4.7 5.5-4.7s4.9 1.6 5.5 4.7" strokeLinecap="round" /><path d="M3.5 3.5h17v17h-17z" opacity=".28" /></svg>
      </button>
    </nav>
  )
}

export default function App() {
  const loadAgents = useStudioStore((state) => state.loadAgents)
  const loadUsage = useStudioStore((state) => state.loadUsage)
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
    void loadUsage()
    connectSocket()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [loadAgents, loadUsage])

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
      <FloatingDock />
      <AgentPanel />
      <JobBoard />

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
