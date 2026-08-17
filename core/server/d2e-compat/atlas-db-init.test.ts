import { assertEquals } from "jsr:@std/assert";
import { waitForTables, type TableRef } from "./atlas-db-init.ts";

const TABLES: TableRef[] = [
  { schema: "webapi", table: "sec_role" },
  { schema: "logto", table: "users" },
];
const noSleep = () => Promise.resolve();

Deno.test("returns true immediately when all tables are present", async () => {
  let calls = 0;
  const ok = await waitForTables(() => {
    calls++;
    return Promise.resolve(true);
  }, TABLES, { attempts: 5, sleep: noSleep });
  assertEquals(ok, true);
  assertEquals(calls, 2); // one probe per table, single pass
});

Deno.test("retries until the missing table appears", async () => {
  let passes = 0;
  const ok = await waitForTables((t) => {
    if (t.table === "sec_role") return Promise.resolve(true);
    passes++;
    return Promise.resolve(passes >= 3);
  }, TABLES, { attempts: 10, sleep: noSleep });
  assertEquals(ok, true);
  assertEquals(passes, 3);
});

Deno.test("gives up after the attempt budget and returns false", async () => {
  let probes = 0;
  const ok = await waitForTables(() => {
    probes++;
    return Promise.resolve(false);
  }, TABLES, { attempts: 4, sleep: noSleep });
  assertEquals(ok, false);
  assertEquals(probes, 4); // stops probing a pass as soon as one table is missing
});

Deno.test("a probe error counts as not-ready rather than throwing", async () => {
  const ok = await waitForTables(() => Promise.reject(new Error("no connection")), TABLES, {
    attempts: 2,
    sleep: noSleep,
  });
  assertEquals(ok, false);
});

import { applyAtlasDbInit } from "./atlas-db-init.ts";

function deps(over: Record<string, unknown> = {}) {
  const applied: string[] = [];
  const logs: string[] = [];
  return {
    applied,
    logs,
    d: {
      readDir: () => Promise.resolve(["200_admin.sql", "100_source.sql", "notes.md"]),
      readFile: (p: string) => Promise.resolve(`-- ${p}`),
      exec: (sql: string) => {
        applied.push(sql);
        return Promise.resolve(null);
      },
      tableExists: () => Promise.resolve(true),
      dir: "/usr/src/atlas-db-init",
      log: (m: string) => logs.push(m),
      err: (m: string) => logs.push(`ERR ${m}`),
      wait: { attempts: 2, sleep: () => Promise.resolve() },
      ...over,
    },
  };
}

Deno.test("applies only .sql files, in filename order", async () => {
  const { applied, d } = deps();
  const count = await applyAtlasDbInit(d as never);
  assertEquals(count, 2);
  assertEquals(applied[0], "-- /usr/src/atlas-db-init/100_source.sql");
  assertEquals(applied[1], "-- /usr/src/atlas-db-init/200_admin.sql");
});

Deno.test("applies nothing and logs when readiness times out", async () => {
  const { applied, logs, d } = deps({ tableExists: () => Promise.resolve(false) });
  const count = await applyAtlasDbInit(d as never);
  assertEquals(count, 0);
  assertEquals(logs.some((m) => m.startsWith("ERR")), true);
});

Deno.test("applies nothing when the directory is absent", async () => {
  const { applied, d } = deps({ readDir: () => Promise.reject(new Error("ENOENT")) });
  const count = await applyAtlasDbInit(d as never);
  assertEquals(count, 0);
  assertEquals(applied.length, 0);
});
