import Database from 'better-sqlite3'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.resolve(__dirname, '../../..', 'data', 'hive.sqlite')

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
  personality TEXT NOT NULL, rules TEXT NOT NULL,
  appearance_json TEXT NOT NULL, desk_x INTEGER NOT NULL, desk_y INTEGER NOT NULL
);
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

const insert = db.prepare(
  `INSERT INTO agents (id, name, role, personality, rules, appearance_json, desk_x, desk_y) VALUES (?,?,?,?,?,?,?,?)`,
)
const agents = [
  ['meow', 'Meow', 'Researcher', 'Curious and precise.', 'You are read-only.', JSON.stringify({ skin: '#F2C9A0', hair: '#2B2B33', shirt: '#3FA7A0', pants: '#2F3A46', shoes: '#1B2027' }), 5, 7],
  ['gugel', 'Gugel', 'Analyst', 'Dry humour, loves data.', 'You are read-only.', JSON.stringify({ skin: '#D9A87C', hair: '#3A2C22', shirt: '#4C7BD9', pants: '#26303C', shoes: '#20262E' }), 12, 7],
  ['sikyo', 'Sikyo', 'Writer', 'Warm and creative.', 'You are read-only.', JSON.stringify({ skin: '#E8B896', hair: '#6B4A8A', shirt: '#9B6BD1', pants: '#332B45', shoes: '#241F30' }), 20, 7],
  ['brod', 'Brod', 'Strategist', 'Blunt and confident.', 'You are read-only.', JSON.stringify({ skin: '#C98F63', hair: '#1F1F24', shirt: '#E0653F', pants: '#2B3138', shoes: '#191D22' }), 28, 7],
  ['aiz', 'Aiz', 'Coordinator', 'Calm and organised.', 'You are read-only.', JSON.stringify({ skin: '#E7C4A6', hair: '#2E3B33', shirt: '#5FA463', pants: '#2A363C', shoes: '#1C2329' }), 35, 7],
]
const tx = db.transaction(() => agents.forEach((a) => insert.run(a)))
tx()

export { db }