import { assertEquals } from "jsr:@std/assert";
import { listAppsCore } from "./listApps.ts";
import { effectiveUserId } from "./askCodeAgent.ts";

function fakeSql(rows: unknown[]) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve({ rows });
  };
  return { fn, calls };
}

Deno.test("listAppsCore filters by user when known and maps rows", async () => {
  const f = fakeSql([
    { id: "a1", name: "dashboard", tech_stack: "react", updated_at: "2026-07-15" },
    { id: "a2", name: "etl-jobs", tech_stack: null, updated_at: "2026-07-14" },
  ]);
  const out = await listAppsCore(f.fn, "u1");
  assertEquals(f.calls[0].sql.includes("WHERE user_id = $1"), true);
  assertEquals(f.calls[0].params, ["u1"]);
  assertEquals(out.apps, [
    { id: "a1", name: "dashboard", techStack: "react" },
    { id: "a2", name: "etl-jobs", techStack: null },
  ]);
});

Deno.test("listAppsCore lists all apps when no user is known", async () => {
  const f = fakeSql([]);
  await listAppsCore(f.fn, undefined);
  assertEquals(f.calls[0].sql.includes("WHERE"), false);
});

Deno.test("effectiveUserId prefers ctx user, then CLAW_CODE_USER_ID env", () => {
  const env = (k: string) => (k === "CLAW_CODE_USER_ID" ? "devx-user" : undefined);
  assertEquals(effectiveUserId("u1", env), "u1");
  assertEquals(effectiveUserId(undefined, env), "devx-user");
  assertEquals(effectiveUserId(undefined, () => undefined), undefined);
  assertEquals(effectiveUserId(undefined, () => ""), undefined);
});
