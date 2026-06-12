import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { withConnection } from "../functions/db.ts";

function installMockTrex(log: string[]) {
  (globalThis as any).Trex = {
    databaseManager() {
      return {
        getConnection() {
          log.push("lease");
          return {
            connection: {
              async execute(sql: string) {
                log.push(`exec:${sql}`);
                return [{ column0: `rows-for:${sql}` }];
              },
              close() { log.push("close"); },
            },
          };
        },
      };
    },
  };
}

Deno.test("withConnection leases once, runs queries, closes once", async () => {
  const log: string[] = [];
  installMockTrex(log);
  const out = await withConnection(async (conn) => {
    const a = await conn.query("SELECT 1");
    const b = await conn.query("SELECT 2");
    return [a[0].column0, b[0].column0];
  });
  assertEquals(out, ["rows-for:SELECT 1", "rows-for:SELECT 2"]);
  assertEquals(log, ["lease", "exec:SELECT 1", "exec:SELECT 2", "close"]);
});

Deno.test("withConnection closes even when callback throws", async () => {
  const log: string[] = [];
  installMockTrex(log);
  await assertRejects(() => withConnection(async () => { throw new Error("boom"); }));
  assertEquals(log.at(-1), "close");
});
