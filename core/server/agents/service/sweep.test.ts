// core/server/agents/service/sweep.ts's test — uses Deno's fake time
// (Deno.test with sanitizeOps/sanitizeResources off is NOT needed; use
// FakeTime from jsr:@std/testing/time, matching how this codebase avoids
// real setInterval delays in tests — check for an existing FakeTime usage
// elsewhere in agents/ first and match its import style if one exists).
import { assertEquals } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { startStaleTurnSweep } from "./sweep.ts";
import type { AgentStore } from "./store.ts";

function fakeStore(overrides: Partial<AgentStore> = {}): AgentStore {
  return {
    listSessionsWithStaleRunningTurns: async () => [],
    reapStaleTurns: async () => 0,
    ...overrides,
  } as AgentStore;
}

Deno.test("startStaleTurnSweep: reaps every session the store reports as stale, on each tick", async () => {
  using time = new FakeTime();
  const reaped: string[] = [];
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["s-1", "s-2"],
    reapStaleTurns: async (sessionId: string) => { reaped.push(sessionId); return 1; },
  });
  const notified: Array<[string, number]> = [];
  const handle = startStaleTurnSweep(store, { intervalMs: 1000, onReap: (id, n) => notified.push([id, n]) });
  // tickAsync only flushes microtasks BEFORE advancing time, not after firing
  // the due timer — the interval callback here has multiple sequential
  // awaits (list, then reap-per-session), so an extra flush is needed for
  // the whole async body to settle before asserting.
  await time.tickAsync(1000);
  await time.runMicrotasks();
  assertEquals(reaped, ["s-1", "s-2"]);
  assertEquals(notified, [["s-1", 1], ["s-2", 1]]);
  handle.stop();
});

Deno.test("startStaleTurnSweep: does not call onReap for a session where reapStaleTurns found nothing to reap", async () => {
  using time = new FakeTime();
  const store = fakeStore({
    listSessionsWithStaleRunningTurns: async () => ["s-1"],
    reapStaleTurns: async () => 0, // race: another trigger (e.g. a lazy reap) already cleared it
  });
  const notified: unknown[] = [];
  const handle = startStaleTurnSweep(store, { intervalMs: 1000, onReap: (...a) => notified.push(a) });
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
    reapStaleTurns: async () => 1,
  });
  const notified: unknown[] = [];
  const handle = startStaleTurnSweep(store, { intervalMs: 1000, onReap: (...a) => notified.push(a) });
  await time.tickAsync(1000); // tick 1: throws, swallowed
  await time.runMicrotasks();
  await time.tickAsync(1000); // tick 2: recovers
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
  const handle = startStaleTurnSweep(store, { intervalMs: 1000 });
  await time.tickAsync(1000);
  handle.stop();
  await time.tickAsync(5000);
  assertEquals(calls, 1);
});
