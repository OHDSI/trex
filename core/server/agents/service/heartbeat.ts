// Keeps `agents.turns.heartbeat_at` fresh for the duration of one turn, so a
// worker that dies mid-turn is detectable in minutes instead of two hours.
//
// A leaf module on purpose: handler.ts wraps runTurn with it, and the unit
// tests drive it with a fake clock and a fake store rather than a live worker.
import { HEARTBEAT_INTERVAL_MS } from "./turn-lifetime.ts";

export interface HeartbeatStore {
  heartbeatTurn(turnId: string): Promise<void>;
}

export interface HeartbeatOptions {
  intervalMs?: number;
  /** Injected for tests; defaults to the global timer functions. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

/**
 * Start stamping `turnId`'s heartbeat every `intervalMs` until `stop()`.
 *
 * Deliberately does NOT beat immediately: addTurn already stamps
 * `heartbeat_at` at insert, so an extra write here would only duplicate it.
 *
 * A failed beat is logged and skipped, never thrown and never retried harder.
 * The consequence of missing beats is bounded and safe — the turn eventually
 * looks abandoned and gets reaped — whereas letting a transient DB error escape
 * from a background timer would take down a turn that is otherwise fine.
 */
export function startTurnHeartbeat(
  store: HeartbeatStore,
  turnId: string,
  opts: HeartbeatOptions = {},
): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const setIntervalImpl = opts.setIntervalFn ?? setInterval;
  const clearIntervalImpl = opts.clearIntervalFn ?? clearInterval;

  const timer = setIntervalImpl(() => {
    void store.heartbeatTurn(turnId).catch((e) => {
      console.warn(`agents: heartbeat failed for turn ${turnId} (will retry next tick):`, e);
    });
  }, intervalMs);

  let stopped = false;
  return {
    stop: () => {
      // Idempotent: handler.ts stops this in a `finally`, and a second stop
      // from any other path must not clear a timer id that has since been
      // reused by a later turn.
      if (stopped) return;
      stopped = true;
      clearIntervalImpl(timer);
    },
  };
}
