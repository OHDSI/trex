import { assert, assertEquals } from "jsr:@std/assert";
import { waitForAttachedDatabase, waitForCoreMigrations } from "./db-wait.ts";

// Virtual clock: each "sleep" advances time so the bounded poll terminates with
// no real delay.
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: (ms: number) => { t += ms; return Promise.resolve(); } };
}

// Mock TrexDB conn whose duckdb_databases() poll reports the catalog as absent
// for the first `readyAfter` checks, then present — modelling the _config ATTACH
// landing partway through boot.
function mockConn(opts: { readyAfter: number }) {
  let checks = 0;
  return {
    execute(_sql: string, _params: unknown[]) {
      const present = checks++ >= opts.readyAfter;
      return Promise.resolve({ rows: present ? [{ "1": 1 }] : [] });
    },
  };
}

Deno.test("waitForAttachedDatabase resolves true once the catalog attaches", async () => {
  const clock = fakeClock();
  const conn = mockConn({ readyAfter: 3 });
  const ok = await waitForAttachedDatabase(conn, "_config", { now: clock.now, sleep: clock.sleep });
  assert(ok);
});

// Mock TrexDB conn whose refinery_schema_history probe reports `readyAfter`
// count of applied migrations for the first `readyAfter` checks, then
// `expected` — modelling the core migration's rows landing partway through
// boot.
function mockHistoryConn(opts: { expected: number; readyAfter: number }) {
  let checks = 0;
  return {
    execute(_sql: string, _params: unknown[]) {
      const n = checks++ >= opts.readyAfter ? opts.expected : 0;
      return Promise.resolve({ rows: [{ n }] });
    },
  };
}

// Mock TrexDB conn that always throws — modelling refinery_schema_history not
// existing yet (or, past the grace window, never being created because the
// core migration doesn't run on this node at all).
function mockAbsentHistoryConn() {
  return {
    execute(_sql: string, _params: unknown[]) {
      return Promise.reject(new Error('relation "refinery_schema_history" does not exist'));
    },
  };
}

Deno.test("waitForCoreMigrations resolves true once the row count reaches expected", async () => {
  const clock = fakeClock();
  const conn = mockHistoryConn({ expected: 6, readyAfter: 3 });
  const ok = await waitForCoreMigrations(conn, "_config", 6, { now: clock.now, sleep: clock.sleep });
  assert(ok);
});

Deno.test(
  "waitForCoreMigrations resolves true early, without burning the full timeout, when the history table stays absent past graceMs",
  async () => {
    const clock = fakeClock();
    const conn = mockAbsentHistoryConn();
    const ok = await waitForCoreMigrations(conn, "_config", 6, {
      timeoutMs: 60_000,
      graceMs: 5_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    assert(ok);
    // Resolved on the grace path, not by exhausting the full timeout.
    assert(clock.now() < 60_000);
  },
);

Deno.test(
  "waitForCoreMigrations resolves false when the table exists but the count never reaches expected",
  async () => {
    const clock = fakeClock();
    const conn = mockHistoryConn({ expected: 0, readyAfter: Number.MAX_SAFE_INTEGER });
    const ok = await waitForCoreMigrations(conn, "_config", 6, {
      timeoutMs: 500,
      graceMs: 100_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    assertEquals(ok, false);
  },
);

Deno.test("waitForCoreMigrations treats a throwing probe as not-ready rather than propagating", async () => {
  const clock = fakeClock();
  const conn = mockAbsentHistoryConn();
  // graceMs beyond timeoutMs so the deadline path (not the grace path) is
  // what terminates the loop — proving the throw itself never escapes.
  const ok = await waitForCoreMigrations(conn, "_config", 6, {
    timeoutMs: 500,
    graceMs: 100_000,
    now: clock.now,
    sleep: clock.sleep,
  });
  assertEquals(ok, false);
});

Deno.test("waitForAttachedDatabase resolves false on timeout (does not throw or hang)", async () => {
  const clock = fakeClock();
  const conn = mockConn({ readyAfter: Number.MAX_SAFE_INTEGER });
  const ok = await waitForAttachedDatabase(conn, "_config", {
    timeoutMs: 500,
    now: clock.now,
    sleep: clock.sleep,
  });
  assertEquals(ok, false);
});

Deno.test("waitForAttachedDatabase keeps polling when the engine throws transiently", async () => {
  const clock = fakeClock();
  let calls = 0;
  const conn = {
    execute(_sql: string, _params: unknown[]) {
      calls++;
      if (calls < 3) return Promise.reject(new Error("engine not ready"));
      return Promise.resolve({ rows: [{ "1": 1 }] });
    },
  };
  const ok = await waitForAttachedDatabase(conn, "_config", { now: clock.now, sleep: clock.sleep });
  assert(ok);
});
