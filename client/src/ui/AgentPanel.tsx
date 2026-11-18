import { useEffect, useRef, useState } from 'react'
import type { AgentActivity, Appearance } from '@hive/shared'
import { useStudioStore } from '../store/useStudioStore'

const ACTIVITY: Record<AgentActivity, { label: string; dot: string; text: string }> = {
  idle: { label: 'Idle', dot: 'bg-slate-400', text: 'text-slate-300' },
  walking: { label: 'Walking', dot: 'bg-sky-400', text: 'text-sky-300' },
  working: { label: 'Working', dot: 'bg-accent', text: 'text-accent-soft' },
  eating: { label: 'Eating', dot: 'bg-amber-400', text: 'text-amber-300' },
  gym: { label: 'At the gym', dot: 'bg-emerald-400', text: 'text-emerald-300' },
}

const TASK_HINTS: Record<string, string> = {
  Researcher: 'Find three sources on office acoustics.',
  Analyst: 'Compare last month’s numbers to this one.',
  Writer: 'Draft a two-line announcement for the team.',
  Strategist: 'Tell me what to cut to hit the deadline.',
  Coordinator: 'Turn this mess into an ordered checklist.',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-300">
      {children}
    </h3>
  )
}

/** Tiny CSS voxel portrait — same colours as the 3D model. */
function VoxelAvatar({ appearance }: { appearance: Appearance }) {
  return (
    <div
      className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10"
      style={{ backgroundColor: appearance.skin }}
    >
      <div className="absolute inset-x-0 top-0 h-3" style={{ backgroundColor: appearance.hair }} />
      <div className="absolute left-2.5 top-5 h-1.5 w-1.5 rounded-[1px] bg-ink-900" />
      <div className="absolute right-2.5 top-5 h-1.5 w-1.5 rounded-[1px] bg-ink-900" />
      <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: appearance.shirt }} />
    </div>
  )
}

export function AgentPanel() {
  const selectedId = useStudioStore((state) => state.selectedAgentId)
  const agents = useStudioStore((state) => state.agents)
  const selectAgent = useStudioStore((state) => state.selectAgent)
  const sendingTaskFor = useStudioStore((state) => state.sendingTaskFor)
  const taskError = useStudioStore((state) => state.taskError)
  const sendTask = useStudioStore((state) => state.sendTask)
  const clearTaskError = useStudioStore((state) => state.clearTaskError)

  // Keep the last agent rendered while the panel slides out.
  const [lastId, setLastId] = useState<string | null>(null)
  useEffect(() => {
    if (selectedId) setLastId(selectedId)
  }, [selectedId])

  const agent = agents.find((item) => item.id === (selectedId ?? lastId)) ?? null
  const open = Boolean(selectedId && agent)
  const busy = Boolean(agent && sendingTaskFor === agent.id)
  const activity = busy ? ACTIVITY.working : agent ? ACTIVITY[agent.activity] : ACTIVITY.idle

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft('')
    clearTaskError()
  }, [agent?.id, clearTaskError])

  const submit = async () => {
    if (!agent || !draft.trim() || busy) return
    const ok = await sendTask(agent.id, draft.trim())
    if (ok) {
      setDraft('')
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <aside
      aria-hidden={!open}
      className={`absolute inset-y-0 right-0 z-30 flex w-full max-w-[400px] items-stretch p-3 transition-transform duration-300 ease-out md:p-4 ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-[110%]'
      }`}
    >
      <div className="pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/85 shadow-panel backdrop-blur-2xl">
        {agent && (
          <>
            <div className="flex items-start gap-3 border-b border-white/5 px-5 pb-4 pt-5">
              <VoxelAvatar appearance={agent.appearance} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold leading-none text-white">
                    {agent.name}
                  </h2>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-ink-200">
                    {agent.role}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-[11px] text-ink-300">
                  mood <span className="text-ink-100">{agent.mood}</span> · desk{' '}
                  <span className="font-mono text-ink-200">
                    {agent.desk.x},{agent.desk.y}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectAgent(null)}
                aria-label="Close agent panel"
                className="-mr-1 rounded-lg p-1.5 text-ink-300 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${activity.dot} ${
                      busy || agent.activity === 'working' ? 'animate-pulse-soft' : ''
                    }`}
                  />
                  <span className={`text-[12px] font-medium ${activity.text}`}>
                    {busy ? 'Working…' : activity.label}
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
                  {busy ? 'gemini' : 'ready'}
                </span>
              </div>

              <section>
                <SectionLabel>Last task</SectionLabel>
                {agent.lastTask ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[10px] leading-relaxed tracking-wide text-ink-400">
                      {agent.lastTask.prompt}
                    </p>
                    <p
                      className={`mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed ${
                        agent.lastTask.status === 'failed' ? 'text-rose-300' : 'text-ink-100'
                      }`}
                    >
                      {agent.lastTask.result ??
                        (agent.lastTask.status === 'failed'
                          ? 'This task failed before Gemini answered.'
                          : 'Working…')}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-[12px] leading-relaxed text-ink-300">
                    Nothing yet. Give {agent.name} a task below — the reply lands here.
                  </p>
                )}
              </section>

              <section>
                <SectionLabel>Lessons learned</SectionLabel>
                {agent.lessons.length > 0 ? (
                  <ul className="space-y-2">
                    {agent.lessons.map((lesson, index) => (
                      <li key={`${index}-${lesson}`} className="flex gap-2.5">
                        <span className="mt-[3px] font-mono text-[10px] text-accent/80">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[12px] leading-relaxed text-ink-100">{lesson}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink-300">No lessons yet.</p>
                )}
              </section>

              <section>
                <SectionLabel>Give {agent.name} a task</SectionLabel>
                <div className="rounded-xl border border-white/10 bg-ink-900/60 p-2 transition focus-within:border-accent/40">
                  <textarea
                    rows={3}
                    value={draft}
                    disabled={busy}
                    onChange={(event) => {
                      setDraft(event.target.value)
                      if (taskError) clearTaskError()
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void submit()
                      }
                    }}
                    placeholder={TASK_HINTS[agent.role] ?? 'What should they work on?'}
                    className="w-full resize-none bg-transparent px-1.5 py-1 text-[12px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-300 disabled:opacity-60"
                  />
                  <div className="flex items-center justify-between gap-2 px-1 pt-1">
                    <span className="text-[10px] text-ink-400">
                      {busy ? 'Gemini is thinking…' : 'Gemini · live'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!draft.trim() || busy}
                      className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-ink-900 transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:bg-ink-500 disabled:text-ink-300"
                    >
                      {busy ? 'Thinking…' : 'Send'}
                    </button>
                  </div>
                </div>
                {taskError && (
                  <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-rose-200">
                    {taskError}
                  </p>
                )}
              </section>

              <section>
                <SectionLabel>Appearance</SectionLabel>
                <div className="grid grid-cols-5 gap-2">
                  {(['skin', 'hair', 'shirt', 'pants', 'shoes'] as const).map((key) => (
                    <div key={key} className="space-y-1">
                      <div
                        className="h-6 rounded-md border border-white/10"
                        style={{ backgroundColor: agent.appearance[key] }}
                      />
                      <p className="text-center text-[9px] uppercase tracking-wide text-ink-400">
                        {key}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-ink-400">
                  Saved per agent. The customizer edits these in step 10.
                </p>
              </section>
            </div>

            <div className="border-t border-white/5 px-5 py-3">
              <p className="text-[10px] text-ink-400">
                Results and lessons live in memory until SQLite lands in step 8
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
