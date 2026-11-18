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
| 4 | Server grid map + A* pathfinding | next |
| 5 | WebSocket + tick loop | pending |
| 6 | Schedules + state machine | pending |
| 7 | Drag and drop | pending |
| 8 | SQLite persistence | pending |
| 9 | Gemini task flow + lessons | done (server + panel) |
| 10 | Customizer, error handling, spend limits | pending |

Step 9 is wired end to end against the REST API: the panel posts a task, the
server builds the persona prompt, calls Gemini, saves the reply and the lesson,
and the panel re-renders. Tasks and lessons live **in memory** until step 8, so
a server restart resets them. The agent does not walk to its desk yet — that is
the simulation in steps 5-6.

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

## Gemini

`GEMINI_MODEL` defaults to `gemini-flash-latest`, the alias from the official
curl example. Aliases can return `503 high demand`; if that happens, pin a
specific model in `.env` (for example `gemini-flash-lite-latest`) and restart.
The server retries 429/5xx twice with backoff before surfacing the error.

Safeguards already in place: one running task per agent, a `DAILY_REQUEST_LIMIT`
budget, a 420-token output cap, a 30s timeout, and structured JSON output so a
malformed reply can fall back to plain text.

## Notes

- The Gemini API key stays server-side in `.env` and is never exposed to Vite.
- Camera: drag to pan, wheel/pinch to zoom, shift-drag to rotate.
- `better-sqlite3` is intentionally not installed yet — it arrives with step 8
  so the first install stays free of native build tooling.
