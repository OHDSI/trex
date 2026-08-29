// The live-child abort registry: how `agent_stop` actually interrupts a child
// instead of merely abandoning it.
//
// Scope, stated plainly because the tool description and COMPAT.md both
// promise exactly this and no more: this registry is PER WORKER (per isolate).
// A child's turn registers here on the worker that is running it, and
// `abortChildTurn` can only reach a controller that lives in the SAME
// process. A parent turn running on a different worker — an entirely ordinary
// arrangement, since a child's turn is started fire-and-forget and a parent
// can be woken by a reap on any worker — finds nothing here and falls back to
// what `agent_stop` has always done: mark the child's turns `failed` in the
// database so the parent stops waiting and the result is discarded on
// arrival. That fallback is not a degradation of the interrupt, it is the
// pre-existing behaviour; the interrupt is added on top of it where it is
// reachable.
//
// Making this cross-process would need a notification channel the store does
// not have (there is no LISTEN/NOTIFY wiring in this runtime — see spawn.ts's
// note on agent_wait polling for the same gap), so it is deliberately out of
// scope here rather than half-built.

// Keyed by CHILD SESSION id — the same id `agent_stop` is handed, and the
// same id the child's own turn runs under. Entries are added when a child
// turn starts and removed when it ends, in that turn's `finally`, so a
// long-lived worker holds one entry per genuinely-running child and nothing
// else.
const controllers = new Map<string, AbortController>();

/**
 * Registers a fresh controller for a child turn about to start, replacing any
 * stale entry for the same session (a previous turn that died without
 * clearing — a crash between registration and its `finally`). Returns the
 * controller so the caller can hand its signal to `streamText` and pass the
 * controller itself back to `clearChildTurnAbort`.
 */
export function registerChildTurnAbort(sessionId: string): AbortController {
  const controller = new AbortController();
  controllers.set(sessionId, controller);
  return controller;
}

/**
 * Removes a finished turn's controller — the leak guard. Takes the controller
 * it registered, not just the id, so a turn that ends LATE (after a newer turn
 * for the same session has already registered) cannot unregister the newer
 * turn's controller and leave it un-abortable.
 */
export function clearChildTurnAbort(sessionId: string, controller: AbortController): void {
  if (controllers.get(sessionId) === controller) controllers.delete(sessionId);
}

/**
 * Aborts a child turn running on THIS worker. Returns whether one was found:
 * `false` means the child is running somewhere else (or has already ended),
 * and the caller's database marking is the whole of the stop — see this
 * module's own header.
 */
export function abortChildTurn(sessionId: string): boolean {
  const controller = controllers.get(sessionId);
  if (!controller) return false;
  controller.abort();
  // Dropped immediately rather than left for the turn's own `finally`: the
  // turn is over as far as anyone is concerned, and a second stop of the same
  // child should report "not running here" rather than abort a spent
  // controller.
  controllers.delete(sessionId);
  return true;
}

/** Live entries — for tests, and for a leak assertion if one is ever wanted. */
export function liveChildTurnAborts(): number {
  return controllers.size;
}
