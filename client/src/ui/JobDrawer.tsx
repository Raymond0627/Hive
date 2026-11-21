import { useEffect, useState } from 'react'
import type { JobDetail, JobState } from '@hive/shared'

interface Props {
  jobId: string
  onClose: () => void
  onChanged: () => void
}

const nextStates: Record<string, JobState[]> = {
  intake: ['researching'], researching: ['product_ready'], product_ready: ['planning'],
  planning: ['brief_ready'], brief_ready: ['awaiting_video'], qa_fixable: ['awaiting_video'],
  qa_passed: ['post_kit_ready'], post_kit_ready: ['scheduled'], scheduled: ['posted'], posted: ['done'],
}

export function JobDrawer({ jobId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [listingText, setListingText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [postedUrl, setPostedUrl] = useState('')

  const load = async () => {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
    if (response.ok) setDetail((await response.json()) as JobDetail)
  }
  useEffect(() => { void load() }, [jobId])

  const post = async (path: string, body?: unknown) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status})`)
      await load(); onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.') }
    finally { setBusy(false) }
  }

  if (!detail) return <div className="popup-surface fixed inset-y-4 right-4 z-40 w-[390px] rounded-2xl p-4 text-xs text-white">Loading…</div>
  const job = detail.job
  return (
    <aside className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/45 p-2 backdrop-blur-[2px] sm:p-4">
      <div className="popup-surface flex w-full max-w-[430px] flex-col overflow-hidden rounded-2xl">
      <header className="flex items-start justify-between border-b border-white/10 p-4">
        <div><p className="text-[10px] uppercase tracking-[.2em] text-accent-soft">Job Drawer · Tier B in progress</p><h2 className="mt-1 text-lg font-semibold text-white">{job.title}</h2><p className="font-mono text-[10px] text-ink-500">{job.state} · QA {job.qaCycles}/3</p><p className="mt-2 text-[10px] text-amber-200">AI status: Scout uses Gemini. Brief, vision QA, and Post Kit remain FAKE until their Tier B stages are implemented.</p></div>
        <button type="button" onClick={onClose} className="text-ink-400 hover:text-white">×</button>
      </header>
      <div className="scroll-thin flex-1 space-y-3 overflow-auto p-4 text-[11px] text-ink-200">
        {error && <p className="rounded-lg bg-rose-500/15 p-2 text-rose-200">{error}</p>}
        <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">Pipeline team</h3><div className="mt-2 grid grid-cols-2 gap-1 text-[10px]"><span><b className="text-white">Producer</b> · coordinator</span><span><b className="text-white">Scout</b> · researcher</span><span><b className="text-white">Planner</b> · video brief</span><span><b className="text-white">QA</b> · quality gate</span><span><b className="text-white">Publisher</b> · post kit</span><span><b className="text-white">Editor</b> · sleeping</span></div></section>
        <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">Product Card <span className="text-[9px] text-emerald-300">GEMINI · owner: Scout</span></h3><p className="mt-1">{detail.product?.card?.title ?? 'No product research yet.'}</p><p className="mt-1 text-[10px] text-ink-400">Paste listing text below. Scout analyzes it as untrusted data and never treats the URL as verified.</p><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Product URL (optional)" className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-white outline-none placeholder:text-ink-500" /><textarea value={listingText} onChange={(e) => setListingText(e.target.value)} placeholder="Paste the product listing text…" rows={4} className="mt-1.5 w-full resize-none rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-white outline-none placeholder:text-ink-500" /><div className="mt-2 flex gap-1.5"><button disabled={busy || !listingText.trim() || !['intake', 'researching'].includes(job.state)} onClick={() => void post('/research', { title: job.title, sourceUrl, listingText })} className="rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-ink-950 disabled:opacity-40">Research with Gemini</button><button disabled={busy || job.state !== 'researching'} onClick={() => void post('/approve-product')} className="rounded-md border border-white/15 px-2 py-1 text-[10px] disabled:opacity-40">Approve</button></div></section>
        <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">Brief <span className="text-[9px] text-emerald-300">GEMINI · owner: Planner</span></h3><p className="mt-1">{detail.brief?.brief?.concept ?? 'Advance to brief_ready to generate with Gemini.'}</p></section>
        <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">Video</h3><p className="mt-1">{detail.video ? `v${detail.video.version} · ${detail.video.probe?.format.duration?.toFixed(1) ?? '?'}s` : 'Boss upload required.'}</p><label className="mt-2 inline-block rounded-md border border-white/15 px-2 py-1 text-[10px] hover:border-accent/50"><input className="hidden" type="file" accept="video/mp4,video/quicktime" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); setBusy(true); const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/video`, { method: 'POST', body: form }); if (!r.ok) setError(((await r.json()) as { error?: string }).error ?? 'Upload failed.'); else { await load(); onChanged() }; setBusy(false) }} />Upload video</label></section>
        <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">QA <span className="text-[9px] text-emerald-300">GEMINI VISION + REAL TECH</span></h3><p className="mt-1">{detail.qa ? `${detail.qa.verdict} · score ${detail.qa.score}` : 'Gemini will review extracted frames after validation.'}</p><button disabled={busy || job.state !== 'qa_review'} onClick={() => void post('/qa')} className="mt-2 rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-ink-950 disabled:opacity-40">Run Gemini QA</button></section>
        {job.state === 'qa_passed' && !detail.postKit && <button disabled={busy} onClick={() => void post('/post-kit')} className="w-full rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-ink-950">Generate Post Kit with Gemini</button>}
        {detail.postKit?.kit && <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">Post Kit <span className="text-[9px] text-emerald-300">GEMINI · manual posting</span></h3><p className="mt-1 whitespace-pre-wrap text-ink-200">{detail.postKit.kit.caption}</p><p className="mt-2 text-[10px] text-ink-400">{detail.postKit.kit.hashtags.join(' ')}</p><div className="mt-2 flex gap-1.5"><input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-white" /><button disabled={busy || !scheduleAt || job.state !== 'post_kit_ready'} onClick={() => void post('/schedule', { at: new Date(scheduleAt).getTime() })} className="rounded-md border border-white/15 px-2 py-1 text-[10px] disabled:opacity-40">Schedule</button></div><div className="mt-2 flex gap-1.5"><input value={postedUrl} onChange={(e) => setPostedUrl(e.target.value)} placeholder="Paste TikTok URL after manual posting" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] text-white placeholder:text-ink-500" /><button disabled={busy || !postedUrl.trim() || !['post_kit_ready', 'scheduled'].includes(job.state)} onClick={() => void post('/mark-posted', { url: postedUrl })} className="rounded-md border border-white/15 px-2 py-1 text-[10px] disabled:opacity-40">Mark posted</button></div></section>}
        <section className="rounded-xl border border-white/10 bg-white/5 p-3"><h3 className="font-semibold text-white">History</h3><ul className="mt-2 space-y-1">{detail.events.slice(-8).reverse().map((event) => <li key={event.id} className="text-[10px] text-ink-400"><span className="text-ink-200">{event.toState}</span> · {event.actor}{event.note ? ` — ${event.note}` : ''}</li>)}</ul></section>
        <div className="flex flex-wrap gap-1">{(nextStates[job.state] ?? []).map((state) => <button key={state} disabled={busy} onClick={() => void post('/transition', { to: state })} className="rounded-md border border-white/15 px-2 py-1 text-[10px] disabled:opacity-40">→ {state}</button>)}</div>
      </div>
      </div>
    </aside>
  )
}
