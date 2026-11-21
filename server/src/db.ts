import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const file = resolve(process.cwd(), process.env.DATABASE_PATH ?? 'data/hive.sqlite')
mkdirSync(dirname(file), { recursive: true })

export const db = new Database(file)
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
  personality TEXT NOT NULL, rules TEXT NOT NULL,
  appearance_json TEXT NOT NULL, desk_x INTEGER NOT NULL, desk_y INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS agent_state (
  agent_id TEXT PRIMARY KEY,
  activity TEXT NOT NULL DEFAULT 'idle',
  x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0,
  target_x REAL NOT NULL DEFAULT 0, target_y REAL NOT NULL DEFAULT 0,
  activity_until INTEGER NOT NULL DEFAULT 0, mood TEXT NOT NULL DEFAULT 'steady',
  facing REAL NOT NULL DEFAULT 3.14159,
  animation TEXT NOT NULL DEFAULT 'idle',
  slot_id TEXT,
  goal_x INTEGER,
  goal_y INTEGER
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, agent_id TEXT NOT NULL, prompt TEXT NOT NULL,
  result TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
  text TEXT NOT NULL, created_at INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS relationships (
  agent_id TEXT NOT NULL,
  other_id TEXT NOT NULL,
  affinity INTEGER NOT NULL DEFAULT 15,
  note TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, other_id)
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS direct_chats (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`)

// ── TikTok Content Office (Phase 1) tables ───────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'intake',
  product_id TEXT,
  qa_cycles INTEGER NOT NULL DEFAULT 0,
  scheduled_at INTEGER,
  posted_url TEXT,
  cancelled_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  ts INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  card_json TEXT NOT NULL,
  source_url TEXT,
  affiliate_url TEXT,
  created_at INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  hash TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  angle TEXT,
  quality REAL NOT NULL DEFAULT 0
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  brief_json TEXT NOT NULL,
  prompt_version TEXT,
  created_at INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  path TEXT NOT NULL,
  probe_json TEXT,
  frames_dir TEXT,
  created_at INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS qa_reports (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  report_json TEXT NOT NULL,
  verdict TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS post_kits (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  kit_json TEXT NOT NULL,
  approved_at INTEGER,
  adapter TEXT NOT NULL DEFAULT 'manual'
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)
db.exec(`
CREATE TABLE IF NOT EXISTS agent_needs (
  agent_id TEXT PRIMARY KEY,
  energy REAL NOT NULL DEFAULT 80,
  hunger REAL NOT NULL DEFAULT 70,
  social REAL NOT NULL DEFAULT 60,
  fun REAL NOT NULL DEFAULT 75,
  updated_at INTEGER NOT NULL DEFAULT 0
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS agent_traits (
  agent_id TEXT PRIMARY KEY,
  traits_json TEXT NOT NULL DEFAULT '[]'
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS agent_plans (
  agent_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  blocks_json TEXT NOT NULL,
  PRIMARY KEY (agent_id, day)
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  transcript_json TEXT NOT NULL,
  ts INTEGER NOT NULL
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_type TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
`)

// Add affinity column to legacy relationships tables that predate it.
try { db.exec('ALTER TABLE relationships ADD COLUMN affinity INTEGER NOT NULL DEFAULT 15') } catch { /* exists */ }
try { db.exec('ALTER TABLE relationships ADD COLUMN last_talk INTEGER') } catch { /* exists */ }

// Add the new agent_state columns to legacy tables.
for (const stmt of [
  'ALTER TABLE agent_state ADD COLUMN facing REAL NOT NULL DEFAULT 3.14159',
  'ALTER TABLE agent_state ADD COLUMN animation TEXT NOT NULL DEFAULT \'idle\'',
  'ALTER TABLE agent_state ADD COLUMN slot_id TEXT',
  'ALTER TABLE agent_state ADD COLUMN goal_x INTEGER',
  'ALTER TABLE agent_state ADD COLUMN goal_y INTEGER',
]) {
  try { db.exec(stmt) } catch { /* exists */ }
}
