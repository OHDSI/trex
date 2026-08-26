import { assertEquals } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { startTurnHeartbeat } from "./heartbeat.ts";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS, STALE_TURN_MS } from "./turn-lifetime.ts";

Deno.test("startTurnHeartbeat: stamps on every interval, and not before the first one", async () => {
  using time = new FakeTime();
  const beats: string[] = [];
  const handle = startTurnHeartbeat({ heartbeatTurn: async (id) => { beats.push(id); } }, "t-1", {
    intervalMs: 1000,
  });
  // addTurn already stamped heartbeat_at at insert, so an immediate beat here
  // would only duplicate that write.
  await time.runMicrotasks();
  assertEquals(beats, []);

  await time.tickAsync(1000);
  assertEquals(beats, ["t-1"]);
  await time.tickAsync(2000);
  assertEquals(beats, ["t-1", "t-1", "t-1"]);
  handle.stop();
});

Deno.test("startTurnHeartbeat: stop() ends the beats, and is idempotent", async () => {
  using time = new FakeTime();
  let cleared = 0;
  const beats: string[] = [];
  const handle = startTurnHeartbeat({ heartbeatTurn: async (id) => { beats.push(id); } }, "t-1", {
    intervalMs: 1000,
    clearIntervalFn: ((id: number) => { cleared++; clearInterval(id); }) as typeof clearInterval,
  });
  await time.tickAsync(1000);
  assertEquals(beats.length, 1);
  handle.stop();
  await time.tickAsync(5000);
  assertEquals(beats.length, 1, "no beats after stop()");
  // A second stop must not clear a timer id the runtime may have reused for a
  // LATER turn's heartbeat.
  handle.stop();
  assertEquals(cleared, 1);
});

Deno.test("startTurnHeartbeat: a failing beat is swallowed and the next one still fires", async () => {
  using time = new FakeTime();
  let calls = 0;
  const handle = startTurnHeartbeat({
    heartbeatTurn: async () => {
      calls++;
      if (calls === 1) throw new Error("db blip");
    },
  }, "t-1", { intervalMs: 1000 });
  await time.tickAsync(1000);
  await time.runMicrotasks();
  await time.tickAsync(1000);
  await time.runMicrotasks();
  // An escaping rejection from a background timer would be an unhandled
  // rejection that takes down a turn which is otherwise perfectly healthy.
  assertEquals(calls, 2);
  handle.stop();
});

Deno.test("heartbeat cutoffs: several beats of slack, and far below the started_at fallback", () => {
  // A single slow query or GC pause must not look like a dead worker...
  assertEquals(HEARTBEAT_STALE_MS / HEARTBEAT_INTERVAL_MS, 6);
  // ...and the whole point is noticing in minutes what started_at only
  // notices in hours.
  assertEquals(HEARTBEAT_STALE_MS < STALE_TURN_MS, true);
  assertEquals(HEARTBEAT_STALE_MS, 3 * 60 * 1000);
});
