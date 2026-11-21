/**
 * Pipeline event bus (brief sections 5/13: "Emits pipeline events that drive
 * office behavior", "Event bus and WebSocket job events").
 *
 * The state machine fires one event per transition; this bus fans it out to
 * listeners. In Tier A there is exactly one listener (the WebSocket
 * broadcast in index.ts). In Tier C the simulation subscribes and turns
 * events into desk behavior — the pipeline never needs to know.
 */
import type { Job, JobEvent } from '@hive/shared'

export type JobEventSink = (event: JobEvent, job: Job) => void

const sinks = new Set<JobEventSink>()

/** Subscribe; returns an unsubscribe function. */
export function onJobEvent(sink: JobEventSink): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

/** Fire-and-forget fan-out. A broken listener must never break a transition. */
export function emitJobEvent(event: JobEvent, job: Job): void {
  for (const sink of sinks) {
    try {
      sink(event, job)
    } catch {
      // ignore — bus listeners are best-effort
    }
  }
}