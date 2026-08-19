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

// Fix round 1 (Important #3): a throwing ledger write must never turn an
// already-granted human approval into a failed gate.
Deno.test("awaitApprovalCore still approves when appendDecision throws, and logs the failure distinctly", async () => {
  const failing = () => Promise.reject(new Error("connection reset"));
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const out = await awaitApprovalCore(failing, "s1", "the plan");
    assertEquals(out, { approved: true, what: "the plan" });
    assertEquals(logged.length, 1);
    assertStringIncludes(String(logged[0][0]), "awaitApproval");
  } finally {
    console.error = originalError;
  }
});

// Minor: an empty/missing sessionId must not write a row keyed on "".
Deno.test("awaitApprovalCore skips the write when sessionId is missing", async () => {
  const f = fakeSql();
  const out = await awaitApprovalCore(f.fn, undefined, "the plan");
  assertEquals(out, { approved: true, what: "the plan" });
  assertEquals(f.calls.length, 0);
});
