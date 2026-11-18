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
  activity_until INTEGER NOT NULL DEFAULT 0, mood TEXT NOT NULL DEFAULT 'steady'
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, agent_id TEXT NOT NULL, prompt TEXT NOT NULL,
  result TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
  text TEXT NOT NULL, created_at INTEGER NOT NULL
);
`)
