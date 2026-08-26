// A real periodic sweep for stale running turns, on top of (not instead of)
// handler.ts's existing lazy on-next-message reap. The lazy reap only fires
// when a NEW message lands on a busy session — a session nobody messages
// again after it gets stuck (exactly the 2026-08-24 incident this closes)
// never recovers on its own without this. See docs/superpowers/plans/
// 2026-08-24-never-stuck.md.
import type { AgentStore } from "./store.ts";

export interface SweepOptions {
  // Required, not optional: a sweep with no plugin/agent scoping is the bug
  // (see store.ts's listSessionsWithStaleRunningTurns comment) — with
  // multiple agents deployed (claw, devx-coder, d2esupport, ...), every
  // worker's sweep would otherwise list and reap every OTHER agent's stale
  // sessions too.
  plugin: string;
  agent: string;
  intervalMs?: number;
  staleMs?: number;
  /**
   * Cutoff for the heartbeat clock (turn-lifetime.ts's HEARTBEAT_STALE_MS).
   * Optional so a caller that has not opted in keeps the pure started_at
   * behaviour, but index.ts always passes it: without it a dropped worker's
   * turn is only noticed after `staleMs` (two hours), which is the wait the
   * heartbeat exists to remove.
   */
  heartbeatStaleMs?: number;
  onReap?: (sessionId: string, reaped: Array<{ id: string; metadata: unknown }>) => void;
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
// Matches handler.ts's STALE_TURN_MS — kept as a self-contained fallback so
// this module has no import-order dependency on handler.ts for its own
// default; the real value always comes from the explicit `staleMs:
// STALE_TURN_MS` index.ts passes.
const DEFAULT_STALE_MS = 2 * 60 * 60 * 1000;

export function startStaleTurnSweep(store: AgentStore, opts: SweepOptions): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS; // caller (index.ts) passes the real STALE_TURN_MS explicitly

  const tick = async () => {
    let sessionIds: string[];
    try {
      sessionIds = await store.listSessionsWithStaleRunningTurns(
        staleMs,
        opts.plugin,
        opts.agent,
        opts.heartbeatStaleMs,
      );
    } catch (e) {
      console.error("agents: stale-turn sweep failed to list sessions (will retry next tick):", e);
      return;
    }
    for (const sessionId of sessionIds) {
      try {
        const reaped = await store.reapStaleTurns(sessionId, staleMs, opts.heartbeatStaleMs);
        if (reaped.length > 0) opts.onReap?.(sessionId, reaped);
      } catch (e) {
        console.error(`agents: stale-turn sweep failed to reap session ${sessionId} (will retry next tick):`, e);
      }
    }
  };

  const timer = setInterval(tick, intervalMs);

  // Sweep once at startup rather than waiting a full interval. A worker
  // crash/redeploy mid-turn is the dominant way turns are orphaned (see
  // store.ts's reapStaleTurns), and a restart is exactly when the orphans from
  // the previous process are sitting there — making the first tick the most
  // valuable one, not the one to delay by 10 minutes. Fire-and-forget: tick()
  // already swallows its own failures, and the caller (service/index.ts) starts
  // this at module scope where it cannot await.
  void tick();

  return { stop: () => clearInterval(timer) };
}
