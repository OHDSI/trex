// core/server/agents/service/sweep.ts's test — uses Deno's fake time
// (Deno.test with sanitizeOps/sanitizeResources off is NOT needed; use
// FakeTime from jsr:@std/testing/time, matching how this codebase avoids
// real setInterval delays in tests — check for an existing FakeTime usage
// elsewhere in agents/ first and match its import style if one exists).
import { assert, assertEquals } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { startStaleTurnSweep } from "./sweep.ts";
import type { AgentStore } from "./store.ts";

function fakeStore(overrides: Partial<AgentStore> = {}): AgentStore {
  return {
    listSessionsWithStaleRunningTurns: async () => [],
    reapStaleTurns: async () => [],
    ...overrides,
  } as AgentStore;
}

Deno.test("startStaleTurnSweep: reaps every session the store reports as stale, on each tick", async () => {
  using time = new FakeTime();
  const reaped: string[] = [];
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["s-1", "s-2"],
    reapStaleTurns: async (sessionId: string) => { reaped.push(sessionId); return [{ id: `t-${sessionId}`, metadata: null }]; },
  });
  const notified: Array<[string, number]> = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    onReap: (id, r) => notified.push([id, r.length]),
  });
  // tickAsync only flushes microtasks BEFORE advancing time, not after firing
  // the due timer — the interval callback here has multiple sequential
  // awaits (list, then reap-per-session), so an extra flush is needed for
  // the whole async body to settle before asserting.
  // The startup sweep runs immediately, so settle it before advancing time.
  await time.runMicrotasks();
  assertEquals(reaped, ["s-1", "s-2"], "startup sweep should have run once");
  await time.tickAsync(1000);
  await time.runMicrotasks();
  // ...then the interval tick sweeps again.
  assertEquals(reaped, ["s-1", "s-2", "s-1", "s-2"]);
  assertEquals(notified, [["s-1", 1], ["s-2", 1], ["s-1", 1], ["s-2", 1]]);
  handle.stop();
});

Deno.test("startStaleTurnSweep: does not call onReap for a session where reapStaleTurns found nothing to reap", async () => {
  using time = new FakeTime();
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["s-1"],
    reapStaleTurns: async () => [], // race: another trigger (e.g. a lazy reap) already cleared it
  });
  const notified: unknown[] = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    onReap: (...a) => notified.push(a),
  });
  await time.tickAsync(1000);
  await time.runMicrotasks();
  assertEquals(notified, []);
  handle.stop();
});

Deno.test("startStaleTurnSweep: a failure listing sessions on one tick doesn't kill the next tick", async () => {
  using time = new FakeTime();
  let call = 0;
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => {
      call++;
      if (call === 1) throw new Error("db blip");
      return ["s-1"];
    },
    reapStaleTurns: async () => [{ id: "t-1", metadata: null }],
  });
  const notified: unknown[] = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    onReap: (...a) => notified.push(a),
  });
  await time.runMicrotasks();          // startup sweep: throws, swallowed
  await time.tickAsync(1000);          // interval tick: recovers
  await time.runMicrotasks();
  assertEquals(notified.length, 1);
  handle.stop();
});

Deno.test("stop() clears the interval — no further ticks reap anything", async () => {
  using time = new FakeTime();
  let calls = 0;
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => { calls++; return []; },
  });
  const handle = startStaleTurnSweep(store, { plugin: "toy-agent", agent: "toy", intervalMs: 1000 });
  await time.runMicrotasks();          // startup sweep (call 1)
  await time.tickAsync(1000);          // interval tick (call 2)
  handle.stop();
  await time.tickAsync(5000);
  assertEquals(calls, 2);
});

// Fix 5: nothing above asserts the actual staleMs VALUE threaded into
// reapStaleTurns — a bug in precisely this parameter already shipped once on
// this branch (commit cfcf5a8, where the default silently fell back to the
// 10-minute sweep INTERVAL instead of the intended 2-hour staleness
// threshold). These two tests capture the staleMs each mock method receives
// and assert it directly, covering both the implicit default and an
// explicit override.
Deno.test("startStaleTurnSweep: omitting staleMs defaults to the 2-hour threshold (7200000ms), not the sweep interval", async () => {
  using time = new FakeTime();
  const seenStaleMs: number[] = [];
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async (staleMs: number) => { seenStaleMs.push(staleMs); return []; },
  });
  // intervalMs is deliberately small and different from the expected 2h
  // default — if staleMs ever fell back to intervalMs (the exact regression
  // commit cfcf5a8 fixed), this would catch it.
  const handle = startStaleTurnSweep(store, { plugin: "toy-agent", agent: "toy", intervalMs: 1000 });
  await time.runMicrotasks();   // startup sweep
  await time.tickAsync(1000);   // interval tick
  await time.runMicrotasks();
  // Assert the invariant (every call used the 2h default) rather than a call
  // count, so this stays honest whether or not a startup sweep is in play.
  assertEquals(seenStaleMs.length > 0, true, "sweep never called the store");
  assertEquals(seenStaleMs.every((v) => v === 2 * 60 * 60 * 1000), true, `saw ${seenStaleMs}`);
  handle.stop();
});

Deno.test("startStaleTurnSweep: an explicit staleMs is threaded through to both store calls unchanged", async () => {
  using time = new FakeTime();
  const explicitStaleMs = 45 * 60 * 1000; // 45 minutes — deliberately not the 2h default
  const seenListStaleMs: number[] = [];
  const seenReapStaleMs: number[] = [];
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async (staleMs: number) => { seenListStaleMs.push(staleMs); return ["s-1"]; },
    reapStaleTurns: async (_sessionId: string, staleMs: number) => { seenReapStaleMs.push(staleMs); return [{ id: "t-1", metadata: null }]; },
  });
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    staleMs: explicitStaleMs,
  });
  await time.runMicrotasks();   // startup sweep
  await time.tickAsync(1000);   // interval tick
  await time.runMicrotasks();
  assertEquals(seenListStaleMs.length > 0 && seenReapStaleMs.length > 0, true, "sweep never called the store");
  assertEquals(seenListStaleMs.every((v) => v === explicitStaleMs), true, `list saw ${seenListStaleMs}`);
  assertEquals(seenReapStaleMs.every((v) => v === explicitStaleMs), true, `reap saw ${seenReapStaleMs}`);
  handle.stop();
});

// ---------------------------------------------------------------------------
// Task 13 (2026-08-27-agent-orchestration): the sweep tells a parent when it
// reaps a child. reapStaleTurns/failTurnsForSession only flip a DB row —
// nothing else in this path knows to call deliverChildResult, so without
// this a detached child whose worker dies leaves its parent waiting forever.
// `deliver` is injected (not called directly here) because sweep.ts has no
// way to actually START the parent's next turn (handler.ts's private
// startTurn) — see handler.ts's exported buildDeliverDeps, which index.ts
// wires as the real `deliver` in production. Whether the reaped session
// actually IS a detached child is deliverChildResult's own job (it no-ops
// for a top-level/blocking session) — these tests only prove the sweep
// calls `deliver` exactly when something was reaped, with the right
// arguments, and survives a `deliver` failure.
// See .superpowers/sdd/2026-08-27-agent-orchestration/task-13-brief.md.
// ---------------------------------------------------------------------------

Deno.test("startStaleTurnSweep: calls deliver with an abandoned-error outcome when a session's turns were reaped", async () => {
  using time = new FakeTime();
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["c-1"],
    reapStaleTurns: async () => [{ id: "t-1", metadata: null }],
  });
  const delivered: Array<[string, unknown]> = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    deliver: (sessionId, outcome) => {
      delivered.push([sessionId, outcome]);
      return Promise.resolve();
    },
  });
  await time.runMicrotasks();
  assertEquals(delivered.length, 1);
  assertEquals(delivered[0][0], "c-1");
  const outcome = delivered[0][1] as { error: string };
  assert(outcome.error.toLowerCase().includes("abandoned"), outcome.error);
  handle.stop();
});

Deno.test("startStaleTurnSweep: does not call deliver when nothing was reaped for a session", async () => {
  using time = new FakeTime();
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["s-1"],
    reapStaleTurns: async () => [], // race: another trigger already cleared it
  });
  const delivered: unknown[] = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    deliver: (...a) => {
      delivered.push(a);
      return Promise.resolve();
    },
  });
  await time.tickAsync(1000);
  await time.runMicrotasks();
  assertEquals(delivered.length, 0);
  handle.stop();
});

Deno.test("startStaleTurnSweep: works with no deliver configured at all (opt-in, back-compat)", async () => {
  using time = new FakeTime();
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["s-1"],
    reapStaleTurns: async () => [{ id: "t-1", metadata: null }],
  });
  const notified: unknown[] = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    onReap: (...a) => notified.push(a),
  });
  await time.runMicrotasks(); // must not throw for lack of a `deliver`
  assertEquals(notified.length, 1);
  handle.stop();
});

Deno.test("startStaleTurnSweep: a failing deliver is swallowed — it does not stop onReap from firing or kill the tick", async () => {
  using time = new FakeTime();
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["c-1"],
    reapStaleTurns: async () => [{ id: "t-1", metadata: null }],
  });
  const notified: unknown[] = [];
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 1000,
    onReap: (...a) => notified.push(a),
    deliver: () => Promise.reject(new Error("db blip")),
  });
  await time.runMicrotasks(); // must not throw / hang the sweep
  assertEquals(notified.length, 1, "onReap must still fire even though deliver rejected");
  handle.stop();
});

// The startup sweep exists because a worker crash/redeploy mid-turn is the
// dominant way turns are orphaned, and a restart is exactly when the previous
// process's orphans are sitting there — waiting a full interval before the
// first sweep delays recovery precisely when it matters most.
Deno.test("startStaleTurnSweep: sweeps once at startup, before any interval has elapsed", async () => {
  using time = new FakeTime();
  const reaped: string[] = [];
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["orphan-from-last-boot"],
    reapStaleTurns: async (sessionId: string) => { reaped.push(sessionId); return [{ id: "t-1", metadata: null }]; },
  });
  const handle = startStaleTurnSweep(store, {
    plugin: "toy-agent",
    agent: "toy",
    intervalMs: 10 * 60 * 1000, // a full interval away — nothing should depend on it
  });
  // No tickAsync: time has NOT advanced. Only the startup sweep can have run.
  await time.runMicrotasks();
  assertEquals(reaped, ["orphan-from-last-boot"]);
  handle.stop();
});
