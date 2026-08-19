import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { recordDecisionCore } from "./recordDecision.ts";

function fakeSql() {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve({ rows: [] });
  };
  return { fn, calls };
}

Deno.test("recordDecisionCore appends the decision and reports recorded", async () => {
  const f = fakeSql();
  const out = await recordDecisionCore(f.fn, "s1", { question: "follow-up window", decision: "configurable, default 365 days" });
  assertEquals(out, { recorded: true });
  assertEquals(f.calls[0].params?.[0], "s1");
  assertStringIncludes(f.calls[0].sql, "decisions");
  const [, payload] = f.calls[0].params as [string, string];
  const parsed = JSON.parse(payload);
  assertEquals(parsed.question, "follow-up window");
  assertEquals(parsed.decision, "configurable, default 365 days");
});
