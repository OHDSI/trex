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
