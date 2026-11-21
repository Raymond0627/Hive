# Baseline — TikTok Content Office pivot

The existing Hive build is functional and verified (24/24 tests, typecheck, build).
All Phase 1 + Character Improvement Chunk A/B work is in place. This document
records the starting point before pivoting to the TikTok Content Office pipeline.

## What works today (reused)

- Monorepo + dev loop, R3F scene, camera controls, voxel agent rig, WebSocket sync,
  SQLite, Gemini service, agent panel, appearance customizer, Obsidian vault,
  needs/mood/traits, barks, conversations, direct chat, daily plans, persistence,
  seeded RNG, furniture reactions.
- Job pipeline: none yet. The office is a generic AI-agent office.

## What must change for the TikTok office

- Roster: Eiron (Producer), Meow (Scout), Sikyo (Planner), Brod (Editor, sleeping),
  Gugel (QA), Aiz (Publisher), + Analyst placeholder desk.
- New rooms: Command Desk, Research Desk, Planning Studio, Edit Bay + Nap Pod,
  QA Lab, Publishing Desk, Boss Inbox, Pantry, Lounge.
- New pipeline: intake → research → product_ready → planning → brief_ready →
  awaiting_video → validating → qa_review → qa_passed/fixable/rejected →
  post_kit_ready → scheduled → posted → done, with 4 human gates.
- Job Board UI, Job Drawer with tabs, Activity Feed, Settings.
- Agents react to pipeline events (sit/type, handoff with folder, ❗ at inbox, cheer).
- Editor (Brod) sleeps in Nap Pod, makes no Gemini calls.
- Speech bubbles show real status lines, no random chatter in pipeline mode.

## Gemini service summary (unchanged, extended)

- `server/src/agents/gemini.ts`: fetch to Gemini generateContent, key server-side only.
  `generateText` (cheap) + `generateJson` (task) with retries/backoff/timeouts.
- `server/src/agents/agentService.ts`: tasks + direct chat, budget guard, queue.
- New call types to add: scout_analyze, scout_discover, scene_plan, qa_vision,
  copy_qa, publish_copy, chat, standup.

## Build order (per TikTok brief section 17)

Tier A (backbone, no AI): migrations, roster config, state machine, file storage,
  upload endpoints, FFprobe validation, frame extraction, event bus, WS job events,
  Job Board UI with fakes. GATE A.
Tier B (brains): Scout, Planner, QA, Publisher, Scheduler. GATE B.
Tier C (office): new map/rooms/roster, event-driven agent behavior, Editor sleeping,
  P0 movement fixes. GATE C.
Tier D (finish): Obsidian mirror, usage/budget guard, Settings, Scout discover,
  optional music. GATE D.

Starting with Tier A.

## Tier A — Gate A implementation

Implemented in the current working tree:

- SQLite-backed jobs, job events, product/media/video/QA/Post Kit tables, and
  additive roster seeding (existing agent rows and appearances are preserved).
- Producer state machine with transition validation, serialized stage queues,
  event bus, and WebSocket `job_update` / `stage_event` messages.
- Self-contained FFmpeg/FFprobe resolution via the static npm packages, streamed
  multipart storage under `DATA_DIR/jobs/<id>/`, safe media serving, image
  dimension/hash checks, hard video validation, soft filter warnings, frame and
  cover extraction, and explicit-only normalization.
- Tier A fake Product Card, Brief, QA report and Post Kit outputs. Vision QA is
  visibly fake; deterministic technical failures cannot be overridden.
- Job Board + Job Drawer with upload, fake QA verdict controls, transition
  controls, event history, and human-in-the-loop posting endpoints. No route
  posts to TikTok.

### Gate A verification checklist

1. Start with `npm run dev`, click **+ New Product**, and open the job drawer.
2. Move the job through `researching → product_ready → planning → brief_ready →
   awaiting_video` using the transition controls. Confirm the fake Brief appears.
3. Upload an invalid/corrupt or out-of-spec video. Confirm the job returns to
   `awaiting_video`, the plain-language failure is stored in History, and the
   file remains available as evidence.
4. Upload a real 15–20 second, portrait 720×1280-or-larger, 24fps video.
   Confirm FFprobe passes, frames/covers are extracted, and the job reaches
   `qa_review`.
5. Run QA as **fixable**, upload a replacement, then run QA as **pass**. Confirm
   the QA cycle counter and retry loop. Run **reject** three times to confirm
   the max-cycle stop at `qa_rejected`.
6. Pass QA, generate the Post Kit, schedule it, and manually paste a posted URL.
   Confirm the final state is `done`; no automatic posting occurs.

Validation completed during implementation: client/server TypeScript
typecheck, client production build, and the existing 24 server simulation
tests all pass.

**Gate A status: ready for Boss approval. Stop here before Tier B.**

## Tier B progress

Work has proceeded at the Boss's request:

- Scout/Researcher now uses Gemini to analyze pasted listing text into a Zod-
  validated Product Card. It does not scrape or treat URLs as verified.
- Planner now uses Gemini to create a Zod-validated faceless 9:16 Video Brief.
- QA now sends extracted frames to Gemini vision while deterministic FFprobe
  failures remain final and non-overridable.
- Publisher now uses Gemini to create a structured Post Kit. Posting remains
  manual and the Scheduler only records a planned time.
- The Drawer exposes Gemini research, brief, QA, Post Kit, schedule, and manual
  posted-URL actions with explicit ownership labels.

Tier B typecheck, client build, and the 24 existing server tests pass. A live
Gemini call still requires the configured `GEMINI_API_KEY` and should be tested
with a real listing/video by the Boss before declaring Gate B complete.
