import { assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert";
import { _resetRootKeyCache } from "./keys.ts";
import { _resetDekCache, decryptWithDek, encryptWithDek, getDek, initDek, unwrapDek, wrapDek } from "./dek.ts";

const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 0x42 ^ i)));

function setRoot() {
  _resetRootKeyCache();
  _resetDekCache();
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
}

Deno.test("wrap then unwrap returns the original DEK", async () => {
  setRoot();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(dek);
  const round = await unwrapDek(wrapped);
  assertEquals(round, dek);
});

Deno.test("wrap output is non-deterministic (random IV)", async () => {
  setRoot();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const a = await wrapDek(dek);
  const b = await wrapDek(dek);
  assertNotEquals(a, b);
});

Deno.test("encryptWithDek roundtrips via decryptWithDek", async () => {
  setRoot();
  // Prime the in-memory DEK by wrapping+unwrapping a known one.
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(dek);
  const { _setDekForTests } = await import("./dek.ts");
  _setDekForTests(await unwrapDek(wrapped));

  const enc = await encryptWithDek("hello world");
  const out = await decryptWithDek(enc);
  assertEquals(out, "hello world");
});

// A mock pg pool that models the first-boot race: the trex host's core schema
// migration creates trexdb.kek_wrapped_dek only AFTER the trexas extension has
// already spawned core/server (see src/main.rs). Until that lands, to_regclass
// returns NULL and any query against the table throws 42P01, exactly as pg does.
function makeMockPool(opts: { nullRegChecks: number; activeWrapped?: string }) {
  let regChecks = 0;
  const present = () => regChecks > opts.nullRegChecks;
  const queries: string[] = [];
  const pool = {
    queries,
    query(sql: string, _params?: unknown[]) {
      queries.push(sql);
      if (sql.includes("to_regclass")) {
        regChecks++;
        return Promise.resolve({ rows: [{ reg: present() ? "trexdb.kek_wrapped_dek" : null }] });
      }
      if (!present()) {
        return Promise.reject(
          Object.assign(new Error('relation "trexdb.kek_wrapped_dek" does not exist'), { code: "42P01" }),
        );
      }
      if (sql.includes("active = true")) {
        return Promise.resolve({ rows: opts.activeWrapped ? [{ wrapped: opts.activeWrapped }] : [] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  return pool;
}

// Virtual clock: each "sleep" advances time, so the bounded wait loop terminates
// deterministically with no real delay.
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: (ms: number) => { t += ms; return Promise.resolve(); } };
}

Deno.test("initDek waits for the migration to create the table, then reads the active DEK", async () => {
  setRoot();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(dek);
  _resetDekCache();
  const clock = fakeClock();
  // Table is absent for the first two polls (migration in flight), then appears.
  const pool = makeMockPool({ nullRegChecks: 2, activeWrapped: wrapped });
  await initDek(pool, { now: clock.now, sleep: clock.sleep });
  assertEquals(getDek(), dek);
});

Deno.test("initDek times out (instead of throwing 42P01) if the table never appears", async () => {
  setRoot();
  _resetDekCache();
  const clock = fakeClock();
  const pool = makeMockPool({ nullRegChecks: Number.MAX_SAFE_INTEGER });
  await assertRejects(
    () => initDek(pool, { timeoutMs: 500, now: clock.now, sleep: clock.sleep }),
    Error,
    "kek_wrapped_dek not present",
  );
});
