# Hive

A browser-based isometric 3D office where AI agents live and work.

Phase 1 of the "Studio" brief, renamed **Hive**. This repo is being built in the
order defined by section 11 of the project brief.

## Status

| # | Build step | State |
|---|---|---|
| 1 | Scaffold monorepo (client, server, shared) | done |
| 2 | Static isometric office: floor, 3 zones, furniture, camera | done |
| 3 | Voxel agents + click-to-select panel | done |
| 4 | Server grid map + A* pathfinding | done |
| 5 | WebSocket + tick loop | done |
| 6 | Schedules + state machine | done |
| 7 | Drag and drop | done |
| 8 | SQLite persistence (tasks, lessons, looks, positions) | done |
| 9 | Gemini task flow + lessons | done (server + panel) |
| 10 | Customizer, error handling, spend limits | done |
| P2.1 | Activity-tied speech & emotes | done |
| P2.2 | Two-way conversations | done |
| P2.3 | Identity context & direct chat | done |
| P3.1 | Needs & mood engine (energy, hunger, social, fun) | done |
| P3.2 | Relationships, affinity (-100..100) & invitations | done |
| P3.3 | Physical task reactions (celebrate/frustrated gestures) | done |
| P3.4 | Obsidian Second Brain vault (Markdown + [[wikilinks]]) | done |

Phase 1 (steps 1-10) and Phase 2 (P1 daily plans, P0.2 furniture JSON, P2
speech/conversations/direct chat) are wired end to end. Tasks, lessons, looks,
direct chats, relationships and last positions persist in SQLite
(`server/data/hive.sqlite`). The agent walks to its desk for tasks, plays a done
gesture, and resumes its daily plan.

## Requirements

- Node.js 20+ (built on 24.x)
- npm 10+

## Setup

```bash
npm install
copy .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173 — the client proxies `/api` to the server on
http://localhost:8787.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs Fastify + Vite together |
| `npm run dev:client` | Vite only |
| `npm run dev:server` | Fastify only, `tsx watch` |
| `npm run build` | Production build of the client |
| `npm run typecheck` | TypeScript check for client and server |

## Layout

```
hive/
├── shared/          wire types shared by both sides (@hive/shared)
├── server/          Fastify + ws + simulation engine (later steps)
└── client/          Vite + React + react-three-fiber scene
```

The client owns nothing but rendering and input: the server is the source of
truth. Agent identity comes from `GET /api/agents` (seeded from
`server/src/agents/personas.ts`), and tasks go through `POST /api/tasks`.

## API

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness, model name, daily usage |
| `GET /api/agents` | Five starter agents with state, lessons, last task |
| `GET /api/usage` | Daily Gemini budget |
| `POST /api/tasks` | `{ agentId, prompt }` → runs Gemini, returns `{ task, agent }` |
| `POST /api/chat` | Direct in-character chat with an agent (cheap model) |
| `GET /api/vault/:id` | Raw Obsidian Second Brain markdown document |
| `GET /api/relationships/:id` | Directed colleague affinities and notes |

## Obsidian Second Brain 🧠

Hive maintains a real, human-readable Obsidian knowledge vault on disk at:
`server/data/vault/` (configurable with `OBSIDIAN_VAULT_PATH`).

You can open this folder directly inside [Obsidian](https://obsidian.md) to explore the live knowledge graph:
- **`Agents/`**: One Markdown note per agent with YAML frontmatter, live needs (`energy`, `hunger`, `social`, `fun`), traits, mood, daily schedules, and `[[wikilinks]]` to colleagues.
- **`Relationships/`**: Two-way dialogue transcripts and affinity notes between colleagues.
- **`Lessons/`**: Knowledge learned across Gemini tasks.
- **`Tasks/`**: Deliverables and task logs.

Inside Hive's UI, click any agent and switch to the **Second Brain** tab to inspect their note live.

## Gemini

`GEMINI_MODEL` defaults to `gemini-flash-latest`, the alias from the official
curl example. Aliases can return `503 high demand`; if that happens, pin a
specific model in `.env` (for example `gemini-flash-lite-latest`) and restart.
The server retries 429/5xx twice with backoff before surfacing the error.

Safeguards already in place: one running task per agent, a `DAILY_REQUEST_LIMIT`
budget (shown live in the top bar, and the Send button locks when it is spent),
a 420-token output cap, a 30s timeout, and structured JSON output so a
malformed reply can fall back to plain text.

## Persistence

Everything that should outlive a restart is written through to
`server/data/hive.sqlite` (`DATABASE_PATH` overrides it):

| Table | Holds |
|---|---|
| `agents` | identity + appearance JSON (edited by the customizer) |
| `agent_state` | last known position, activity, mood |
| `tasks` | every Gemini task and its result |
| `lessons` | durable lessons fed back into future prompts |
| `relationships` | directed affinity notes between colleagues |
| `direct_chats` | in-character chat history |

## Notes

- The Gemini API key stays server-side in `.env` and is never exposed to Vite.
- Camera: drag to pan, wheel/pinch to zoom, shift-drag to rotate.
- Appearance: open an agent, use the colour pickers under **Appearance**, and
  press **Apply look** — the model updates immediately and the colours survive
  a restart.
- Seeded runs: set `SIM_SEED=42` in `.env` for bit-for-bit reproducible
  simulations. See `BASELINE.md` for the audit summary.
