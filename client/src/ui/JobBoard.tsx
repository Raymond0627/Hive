import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { JobDrawer } from './JobDrawer'

export interface BoardJob {
  id: string
  title: string
  state: string
  qaCycles: number
  createdAt: number
}

const NEXT: Record<string, string[]> = {
  intake: ['researching', 'cancelled'],
  researching: ['product_ready', 'failed', 'cancelled'],
  product_ready: ['planning', 'cancelled'],
  planning: ['brief_ready', 'failed', 'cancelled'],
  brief_ready: ['awaiting_video', 'cancelled'],
  awaiting_video: ['validating', 'cancelled'],
  validating: ['qa_review', 'awaiting_video', 'failed', 'cancelled'],
  qa_review: ['qa_passed', 'qa_fixable', 'qa_rejected', 'failed', 'cancelled'],
  qa_fixable: ['awaiting_video', 'cancelled'],
  qa_passed: ['post_kit_ready', 'cancelled'],
  post_kit_ready: ['scheduled', 'posted', 'cancelled'],
  scheduled: ['posted', 'cancelled'],
  posted: ['done'],
}

export function JobBoard() {
  const [jobs, setJobs] = useState<BoardJob[]>([])
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(true)

  const load = async () => {
    try {
      const res = await fetch('/api/jobs')
      if (!res.ok) return
      const data = (await res.json()) as { jobs: BoardJob[] }
      setJobs((data.jobs ?? []).filter((job) => !hiddenIds.includes(job.id)))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 4000)
    const toggle = () => setCollapsed((value) => !value)
    window.addEventListener('hive:toggle-job-board', toggle)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('hive:toggle-job-board', toggle)
    }
  }, [hiddenIds])

  const createJob = async () => {
    const title = window.prompt('New product title')
    if (!title?.trim()) return
    setBusy(true)
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const transition = async (id: string, to: string) => {
    setBusy(true)
    try {
      await fetch(`/api/jobs/${encodeURIComponent(id)}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (id: string) => {
    setBusy(true)
    try {
      await fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'cancelled by boss' }),
      })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const deleteCancelled = async (id: string) => {
    if (!window.confirm('Permanently delete this cancelled job and its media?')) return
    setBusy(true)
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (response.ok) await load()
    } finally { setBusy(false) }
  }

  if (collapsed) {
    return null
  }

  return (
    <div className="popup-surface scroll-thin pointer-events-auto absolute bottom-4 left-20 z-20 w-[360px] max-h-[60vh] overflow-auto rounded-2xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-300">
          Pipeline Board
        </h2>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Collapse Job Board" onClick={() => setCollapsed(true)} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-ink-300 hover:text-white">−</button>
          <button type="button" onClick={() => void createJob()} disabled={busy} className="rounded-lg bg-accent px-2.5 py-1 text-[10px] font-semibold text-ink-900 disabled:opacity-50">+ New Product</button>
        </div>
      </div>
      <p className="mb-2 text-[10px] leading-relaxed text-ink-400">Research: <span className="font-semibold text-white">Scout</span> · Gemini active</p>
      {jobs.length === 0 && (
        <p className="text-[11px] text-ink-400">No jobs yet. Create one to test the pipeline.</p>
      )}
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="cursor-pointer rounded-xl border border-white/10 bg-white/5 p-2.5" onClick={() => setSelectedId(job.id)}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-semibold text-white">{job.title}</span>
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold uppercase text-accent-soft">
                {job.state}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[9px] text-ink-500">{job.id}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(NEXT[job.state] ?? []).map((to) => (
                <button
                  key={to}
                  type="button"
                   onClick={(event) => { event.stopPropagation(); void transition(job.id, to) }}
                  disabled={busy}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-ink-200 hover:border-accent/40 hover:text-white disabled:opacity-50"
                >
                  → {to}
                </button>
              ))}
              {!['done', 'cancelled', 'failed'].includes(job.state) && (
                <button
                  type="button"
                   onClick={(event) => { event.stopPropagation(); void cancel(job.id) }}
                  disabled={busy}
                  className="rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[9px] text-rose-200 disabled:opacity-50"
                >
                  cancel
                </button>
              )}
              {job.state === 'cancelled' && <>
                <button type="button" onClick={(event) => { event.stopPropagation(); setHiddenIds((ids) => [...ids, job.id]) }} disabled={busy} className="rounded-md border border-white/10 px-2 py-0.5 text-[9px] text-ink-300 disabled:opacity-50">hide</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); void deleteCancelled(job.id) }} disabled={busy} className="rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[9px] text-rose-200 disabled:opacity-50">delete</button>
              </>}
            </div>
          </li>
        ))}
      </ul>
      {selectedId && createPortal(
        <JobDrawer jobId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => void load()} />,
        document.body,
      )}
    </div>
  )
}
