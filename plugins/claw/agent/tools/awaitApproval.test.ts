import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { awaitApprovalCore } from "./awaitApproval.ts";

function fakeSql() {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve({ rows: [] });
  };
  return { fn, calls };
}

// Task 6 (claw-devx-reliability): execute() only runs on Approve, so it is
// the one unconditional gate-resolution capture point (button click AND a
// typed "approve" in the thread both resume through this same execute()).
Deno.test("awaitApprovalCore records the approval as a settled decision", async () => {
  const f = fakeSql();
  const out = await awaitApprovalCore(f.fn, "s1", "the plan");
  assertEquals(out, { approved: true, what: "the plan" });
  assertEquals(f.calls[0].params?.[0], "s1");
  assertStringIncludes(f.calls[0].sql, "decisions");
  const [, payload] = f.calls[0].params as [string, string];
  const parsed = JSON.parse(payload);
  assertEquals(parsed.question, "the plan");
  assertEquals(parsed.decision, "approved");
});

Deno.test("awaitApprovalCore still approves when sql is unavailable (no crash without a ledger)", async () => {
  const out = await awaitApprovalCore(undefined, "s1", "the plan");
  assertEquals(out, { approved: true, what: "the plan" });
});
