/**
 * Producer queue (brief section 9.7: "queue (one job per stage at a time)").
 *
 * A per-stage promise chain: submitting work for a stage waits for that
 * stage's previous job to finish, while other stages run freely. Tier A
 * stages are all fast local operations (file I/O, forked ffmpeg), but real
 * agent stages in Tier B slot into the same queue with no code change —
 * and two boss uploads for two different jobs can never race on "stage"
 * resources such as the same frames folder.
 */

const chains = new Map<string, Promise<void>>()

/** Run `work` serialized against all other work on the same `stage`. */
export function enqueueStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(stage) ?? Promise.resolve()
  const run = previous.then(() => work())
  // The chain swallows errors: one failed job never jams the stage.
  chains.set(stage, run.then(() => undefined, () => undefined))
  return run
}

/** Test/diagnostics: how many stages currently have queued work. */
export function busyStages(): string[] {
  return [...chains.keys()]
}