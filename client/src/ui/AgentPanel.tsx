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
  Analyst: "Compare last month's numbers to this one.",
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

function NeedMeter({
  label,
  value,
  icon,
  barColor,
}: {
  label: string
  value: number
  icon: string
  barColor: string
}) {
  const val = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-ink-300">
          <span>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="font-mono text-[10px] text-white">{val}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${val}%` }}
        />
      </div>
    </div>
  )
}

function formatMinute(minute: number): string {
  const m = Math.floor(((minute % 1440) + 1440) % 1440)
  const hh = Math.floor(m / 60)
  const mm = m % 60
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const displayH = hh % 12 === 0 ? 12 : hh % 12
  return `${displayH}:${String(mm).padStart(2, '0')} ${ampm}`
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
  const live = useStudioStore((state) => state.live)
  const clock = useStudioStore((state) => state.clock)
  const chatMessages = useStudioStore((state) => state.chatMessages)
  const chatSending = useStudioStore((state) => state.chatSending)
  const sendDirectChat = useStudioStore((state) => state.sendDirectChat)
  const loadChatHistory = useStudioStore((state) => state.loadChatHistory)
  const vaultNotes = useStudioStore((state) => state.vaultNotes)
  const loadVaultNote = useStudioStore((state) => state.loadVaultNote)
  const relationshipsDetailed = useStudioStore((state) => state.relationshipsDetailed)
  const loadRelationships = useStudioStore((state) => state.loadRelationships)

  const [tab, setTab] = useState<'overview' | 'chat' | 'brain'>('overview')
  const [chatDraft, setChatDraft] = useState('')
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Keep the last agent rendered while the panel slides out.
  const [lastId, setLastId] = useState<string | null>(null)
  useEffect(() => {
    if (selectedId) setLastId(selectedId)
  }, [selectedId])

  const agent = agents.find((item) => item.id === (selectedId ?? lastId)) ?? null
  const plan = (agent ? live[agent.id]?.plan ?? agent.plan : undefined) ?? []
  const needs = (agent ? live[agent.id]?.needs ?? agent.needs : undefined) ?? {
    energy: 85,
    hunger: 70,
    social: 60,
    fun: 75,
  }
  const traits = (agent ? live[agent.id]?.traits ?? agent.traits : undefined) ?? []
  const rels = agent ? relationshipsDetailed[agent.id] ?? {} : {}
  const vaultData = agent ? vaultNotes[agent.id] : undefined

  const open = Boolean(selectedId && agent)
  const busy = Boolean(agent && sendingTaskFor === agent.id)
  const activity = busy ? ACTIVITY.working : agent ? ACTIVITY[agent.activity] : ACTIVITY.idle

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft('')
    setChatDraft('')
    clearTaskError()
    if (agent?.id) {
      void loadChatHistory(agent.id)
      void loadVaultNote(agent.id)
      void loadRelationships(agent.id)
    }
  }, [agent?.id, clearTaskError, loadChatHistory, loadVaultNote, loadRelationships])

  const messages = (agent ? chatMessages[agent.id] : undefined) ?? []

  useEffect(() => {
    if (tab === 'chat') {
      chatScrollRef.current?.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages.length, tab, chatSending])

  const submit = async () => {
    if (!agent || !draft.trim() || busy) return
    const ok = await sendTask(agent.id, draft.trim())
    if (ok) {
      setDraft('')
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const submitChat = async () => {
    if (!agent || !chatDraft.trim() || chatSending) return
    const text = chatDraft.trim()
    setChatDraft('')
    await sendDirectChat(agent.id, text)
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

            {/* Navigation Tabs (P2.3 & P3) */}
            <div className="flex border-b border-white/5 px-5">
              <button
                type="button"
                onClick={() => setTab('overview')}
                className={`border-b-2 py-2.5 text-[11px] font-semibold transition ${
                  tab === 'overview'
                    ? 'border-accent text-white'
                    : 'border-transparent text-ink-300 hover:text-white'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setTab('chat')}
                className={`ml-4 flex items-center gap-1.5 border-b-2 py-2.5 text-[11px] font-semibold transition ${
                  tab === 'chat'
                    ? 'border-accent text-white'
                    : 'border-transparent text-ink-300 hover:text-white'
                }`}
              >
                <span>Direct Chat</span>
                <span className="rounded-full bg-accent/20 px-1.5 py-0.2 font-mono text-[9px] text-accent-soft">
                  P2
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab('brain')}
                className={`ml-4 flex items-center gap-1.5 border-b-2 py-2.5 text-[11px] font-semibold transition ${
                  tab === 'brain'
                    ? 'border-purple-400 text-white'
                    : 'border-transparent text-ink-300 hover:text-white'
                }`}
              >
                <span>Second Brain</span>
                <span className="rounded-full bg-purple-500/20 px-1.5 py-0.2 font-mono text-[9px] text-purple-300">
                  Obsidian
                </span>
              </button>
            </div>

            {tab === 'brain' ? (
              <div className="scroll-thin flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto px-5 py-4">
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/25 p-3">
                  <div className="flex items-center justify-between text-purple-200">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <span>🧠</span>
                      <span>Obsidian Markdown Vault</span>
                    </span>
                    <span className="rounded bg-purple-500/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-purple-300">
                      Live Synced
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-200">
                    This note is saved directly on disk in your Obsidian vault. Open{' '}
                    <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[10px] text-purple-200">
                      server/data/vault
                    </code>{' '}
                    in Obsidian to browse the graph view!
                  </p>
                  {vaultData?.vaultPath && (
                    <p className="mt-1.5 break-all font-mono text-[9px] text-ink-400">
                      📄 {vaultData.vaultPath}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-white/5 bg-black/50 p-4 font-mono text-[11.5px] leading-relaxed text-ink-100 shadow-inner">
                  <pre className="whitespace-pre-wrap select-text font-mono">
                    {vaultData?.content ?? 'Loading Obsidian note…'}
                  </pre>
                </div>
              </div>
            ) : tab === 'chat' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div
                  ref={chatScrollRef}
                  className="scroll-thin flex-1 space-y-3 overflow-y-auto px-5 py-4"
                >
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
                    <p className="text-[11px] font-medium text-white">
                      Direct Chat with {agent.name}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-300">
                      Currently {live[agent.id]?.activity ?? agent.activity} · feeling{' '}
                      {live[agent.id]?.mood ?? agent.mood}
                    </p>
                  </div>

                  {messages.length === 0 ? (
                    <div className="py-8 text-center text-[12px] text-ink-400">
                      Say hello to {agent.name} or ask what they're up to!
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isUser = m.from === 'user'
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                        >
                          <span className="mb-0.5 text-[9px] text-ink-400">
                            {isUser ? 'You' : agent.name}
                          </span>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[12px] leading-relaxed ${
                              isUser
                                ? 'rounded-br-none bg-accent font-medium text-ink-900'
                                : 'rounded-bl-none border border-white/5 bg-white/10 text-white'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      )
                    })
                  )}

                  {chatSending && (
                    <div className="flex items-center gap-2 text-[11px] text-accent-soft">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      <span>{agent.name} is typing…</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/5 p-4">
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900/60 p-1.5 focus-within:border-accent/40">
                    <input
                      type="text"
                      value={chatDraft}
                      disabled={chatSending}
                      onChange={(e) => setChatDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void submitChat()
                        }
                      }}
                      placeholder={`Say something to ${agent.name}…`}
                      className="min-w-0 flex-1 bg-transparent px-2.5 py-1 text-[12px] text-white outline-none placeholder:text-ink-400"
                    />
                    <button
                      type="button"
                      disabled={!chatDraft.trim() || chatSending}
                      onClick={() => void submitChat()}
                      className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-ink-900 transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:bg-ink-500 disabled:text-ink-300"
                    >
                      {chatSending ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
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

              {/* Inspector (P0.1) */}
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 font-mono text-[10px]">
                <div>
                  <span className="text-ink-400">STATE: </span>
                  <span className="text-white">{live[agent.id]?.activity ?? agent.activity}</span>
                </div>
                <div>
                  <span className="text-ink-400">ANIM: </span>
                  <span className="text-accent-soft">{live[agent.id]?.animation ?? 'idle'}</span>
                </div>
                <div>
                  <span className="text-ink-400">GOAL: </span>
                  <span className="text-emerald-300">
                    {live[agent.id]?.goal ? `${live[agent.id].goal?.x},${live[agent.id].goal?.y}` : 'none'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-400">SLOT: </span>
                  <span className="truncate text-ink-200">{live[agent.id]?.slotId ?? 'none'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-ink-400">TALKING WITH: </span>
                  <span className="text-sky-300">
                    {live[agent.id]?.talkingWith
                      ? (agents.find((a) => a.id === live[agent.id]?.talkingWith)?.name ??
                        live[agent.id]?.talkingWith)
                      : 'none'}
                  </span>
                </div>
              </div>

              {/* Needs & Inner Life (P3.1) */}
              <section className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>Inner Needs & Vitality</SectionLabel>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-accent-soft">
                    P3 Engine
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NeedMeter
                    label="Energy"
                    value={needs.energy}
                    icon="⚡"
                    barColor={
                      needs.energy < 25
                        ? 'bg-rose-500'
                        : needs.energy < 50
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }
                  />
                  <NeedMeter
                    label="Hunger"
                    value={needs.hunger}
                    icon="🥪"
                    barColor={
                      needs.hunger < 25
                        ? 'bg-rose-500'
                        : needs.hunger < 50
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }
                  />
                  <NeedMeter
                    label="Social"
                    value={needs.social}
                    icon="💬"
                    barColor="bg-sky-400"
                  />
                  <NeedMeter
                    label="Fun"
                    value={needs.fun}
                    icon="🎮"
                    barColor="bg-purple-400"
                  />
                </div>
                {traits.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-ink-400">Traits:</span>
                    {traits.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px] text-ink-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Colleague Network & Affinity (P3.2) */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionLabel>Colleague Network</SectionLabel>
                  <span className="font-mono text-[10px] text-ink-400">Affinity</span>
                </div>
                <div className="space-y-2">
                  {agents
                    .filter((colleague) => colleague.id !== agent.id)
                    .map((colleague) => {
                      const rel = rels[colleague.id]
                      const affinity = rel?.affinity ?? 15
                      const note =
                        rel?.note ?? agent.relationships?.[colleague.id] ?? 'Office colleague'
                      return (
                        <div
                          key={colleague.id}
                          className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-white">
                              {colleague.name}
                            </span>
                            <span
                              className={`font-mono text-[10px] font-semibold ${
                                affinity >= 20
                                  ? 'text-emerald-400'
                                  : affinity >= 0
                                  ? 'text-sky-300'
                                  : 'text-rose-400'
                              }`}
                            >
                              {affinity > 0 ? `+${affinity}` : affinity}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-ink-300">
                            {note}
                          </p>
                        </div>
                      )
                    })}
                </div>
              </section>

              {/* Today's Plan (P1.2) */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionLabel>Today's plan</SectionLabel>
                  <span className="font-mono text-[10px] text-ink-400">
                    {plan.filter((b) => b.done).length}/{plan.length} done
                  </span>
                </div>
                {plan.length > 0 ? (
                  <div className="space-y-1.5">
                    {plan.map((block) => {
                      const isCurrent = clock >= block.startMinute && clock < block.endMinute
                      return (
                        <div
                          key={block.id}
                          className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 transition ${
                            isCurrent
                              ? 'border-accent/40 bg-accent/10 shadow-sm'
                              : block.done
                              ? 'border-white/5 bg-white/[0.01] opacity-60'
                              : 'border-white/5 bg-white/[0.03]'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {block.done ? (
                              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                                <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current">
                                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                </svg>
                              </div>
                            ) : isCurrent ? (
                              <div className="flex h-4 w-4 items-center justify-center rounded-full border border-accent bg-accent/20">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                              </div>
                            ) : (
                              <div className="h-4 w-4 rounded-full border border-white/20" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`text-[12px] font-medium leading-tight ${
                                  block.done
                                    ? 'text-ink-400 line-through'
                                    : isCurrent
                                    ? 'text-white'
                                    : 'text-ink-200'
                                }`}
                              >
                                {block.label}
                              </span>
                              {isCurrent && (
                                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-soft">
                                  Now
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 font-mono text-[10px] text-ink-400">
                              {formatMinute(block.startMinute)} – {formatMinute(block.endMinute)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-400">No scheduled blocks for today.</p>
                )}
              </section>

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
            )}

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
