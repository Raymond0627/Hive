/**
 * Office settings (brief section 13: "Settings: timezone, posting windows,
 * daily limits, vault path, Editor enabled toggle (off)").
 *
 * Layered, low to high priority:
 *   1. built-in defaults (this file)
 *   2. environment variables (`.env`)
 *   3. the `settings` SQLite table (edited via GET/PUT /api/settings)
 *
 * The pipeline always reads `getSettings()`; nothing hard-codes a limit
 * twice. SQLite is the source of truth once the boss edits a value.
 */
import { db } from './db'

export interface StudioSettings {
  timezone: string
  /** HH:MM local-time posting windows the Post Kit recommends (defaults, not data). */
  postingWindows: string[]
  /** Video validation (brief 9.4). */
  videoMinDuration: number
  videoMaxDuration: number
  durationTolerance: number
  aspectTolerance: number
  videoMinWidth: number
  videoMinHeight: number
  videoPreferredWidth: number
  videoPreferredHeight: number
  videoMinFps: number
  /** Upload cap in MB (brief 9.4: 200). */
  maxUploadMb: number
  /** Hard stop for QA retries per job (brief 9.5: 3). */
  maxQaCycles: number
  /** Editor (Brod) wake-up switch — off in Phase 1 (brief 9.3). */
  editorEnabled: boolean
}

const BUILT_IN: StudioSettings = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  postingWindows: ['12:00', '19:00', '21:00'],
  videoMinDuration: 15,
  videoMaxDuration: 20,
  durationTolerance: 0.5,
  aspectTolerance: 0.03,
  videoMinWidth: 720,
  videoMinHeight: 1280,
  videoPreferredWidth: 1080,
  videoPreferredHeight: 1920,
  videoMinFps: 24,
  maxUploadMb: 200,
  maxQaCycles: 3,
  editorEnabled: false,
}

function fromEnv(): Partial<StudioSettings> {
  const out: Partial<StudioSettings> = {}
  const str = (key: string) => process.env[key]?.trim()
  const num = (key: string) => {
    const raw = process.env[key]?.trim()
    if (!raw) return undefined
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : undefined
  }
  const timezone = str('TIMEZONE')
  if (timezone) out.timezone = timezone
  const windows = str('POSTING_WINDOWS')
  if (windows) out.postingWindows = windows.split(',').map((w) => w.trim()).filter(Boolean)
  const maxUploadMb = num('MAX_UPLOAD_MB')
  if (maxUploadMb != null) out.maxUploadMb = maxUploadMb
  const editorEnabled = str('EDITOR_ENABLED')
  if (editorEnabled != null) out.editorEnabled = editorEnabled === 'true' || editorEnabled === '1'
  return out
}

interface SettingsRow {
  value: string
}

function fromDb(): Partial<StudioSettings> {
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'studio'`).get() as SettingsRow | undefined
    if (!row) return {}
    const parsed = JSON.parse(row.value) as Partial<StudioSettings>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Effective settings: built-ins ← env ← database. */
export function getSettings(): StudioSettings {
  return { ...BUILT_IN, ...fromEnv(), ...fromDb() }
}

/** Merge a partial update into the database row and return the new effective settings. */
export function setSettings(partial: Partial<StudioSettings>): StudioSettings {
  const current = fromDb()
  const next: Partial<StudioSettings> = { ...current, ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v != null)) }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('studio', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(next))
  return getSettings()
}