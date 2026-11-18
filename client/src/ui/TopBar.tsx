import { useStudioStore } from '../store/useStudioStore'

const STATUS = {
  connecting: {
    dot: 'bg-amber-400 animate-pulse-soft',
    label: 'Connecting',
    tone: 'text-ink-200',
  },
  online: { dot: 'bg-emerald-400', label: 'Engine online', tone: 'text-emerald-300' },
  offline: { dot: 'bg-rose-500', label: 'Engine offline', tone: 'text-rose-300' },
} as const

export function TopBar() {
  const backend = useStudioStore((state) => state.backend)
  const agentCount = useStudioStore((state) => state.agents.length)
  const status = STATUS[backend]

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-start justify-between gap-3 p-4 md:p-5">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/75 px-3.5 py-2.5 shadow-panel backdrop-blur-xl">
        <div className="relative h-9 w-9 shrink-0">
          <div
            className="absolute inset-0 bg-accent"
            style={{
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            }}
          />
          <div
            className="absolute inset-[4px] bg-ink-900"
            style={{
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            }}
          />
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-2 w-2 rotate-45 bg-accent" />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-[0.3em] text-white">HIVE</h1>
            <span className="rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-soft">
              Phase 1
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-none text-ink-200">
            Office sim · {agentCount || 5} agents
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/10 bg-ink-900/75 px-3 py-2 backdrop-blur-xl sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="text-[11px] font-medium text-ink-200">No AI calls while idle</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/75 px-3 py-2 backdrop-blur-xl">
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          <span className={`text-[11px] font-medium ${status.tone}`}>{status.label}</span>
          <span className="text-ink-500">·</span>
          <span className="font-mono text-[10px] text-ink-300">:8787</span>
        </div>
      </div>
    </header>
  )
}
