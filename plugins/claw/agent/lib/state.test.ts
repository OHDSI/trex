import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  readOrchestration,
  upsertOrchestration,
  renderStateForPrompt,
  appendDecision,
  readDecisions,
  renderDecisionLedger,
  type Orchestration,
} from "./state.ts";

function fakeSql() {
  const calls: { sql: string; params?: unknown[] }[] = [];
  let nextRows: unknown[] = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve({ rows: nextRows });
  };
  return { fn, calls, setRows: (r: unknown[]) => (nextRows = r) };
}

Deno.test("readOrchestration returns null when no row", async () => {
  const f = fakeSql();
  const got = await readOrchestration(f.fn, "s1");
  assertEquals(got, null);
  assertEquals(f.calls[0].params, ["s1"]);
});

Deno.test("readOrchestration maps a row", async () => {
  const f = fakeSql();
  f.setRows([{ session_id: "s1", code_session_id: "c1", event_cursor: 7 }]);
  const got = await readOrchestration(f.fn, "s1");
  assertEquals(got, { sessionId: "s1", codeSessionId: "c1", eventCursor: 7, appId: null, decisions: [] });
});

// readOrchestration carries the ledger too, so claw's own instructions
// (renderStateForPrompt) can see it.
Deno.test("readOrchestration maps decisions when present", async () => {
  const f = fakeSql();
  f.setRows([{
    session_id: "s1",
    code_session_id: "c1",
    event_cursor: 1,
    decisions: [{ at: "2026-08-06T12:00:00Z", question: "dialect", decision: "HANA only" }],
  }]);
  const got = await readOrchestration(f.fn, "s1");
  assertEquals(got?.decisions, [{ at: "2026-08-06T12:00:00Z", question: "dialect", decision: "HANA only" }]);
});

Deno.test("readOrchestration maps app_id when set", async () => {
  const f = fakeSql();
  f.setRows([{ session_id: "s1", code_session_id: "c1", event_cursor: 1, app_id: "app-7" }]);
  const got = await readOrchestration(f.fn, "s1");
  assertEquals(got?.appId, "app-7");
});

Deno.test("upsertOrchestration passes session, code session, and cursor as params", async () => {
  const f = fakeSql();
  const o: Orchestration = { sessionId: "s1", codeSessionId: "c1", eventCursor: 3, appId: "app-7" };
  await upsertOrchestration(f.fn, o);
  assertEquals(f.calls[0].params, ["s1", "c1", 3, "app-7"]);
});

Deno.test("renderStateForPrompt distinguishes no-session from active-session", () => {
  assertEquals(renderStateForPrompt(null).includes("No coding-agent session yet"), true);
  assertEquals(
    renderStateForPrompt({ sessionId: "s1", codeSessionId: null, eventCursor: 0, appId: null }).includes("No coding-agent session yet"),
    true,
  );
  const active = renderStateForPrompt({ sessionId: "s1", codeSessionId: "c1", eventCursor: 2, appId: null });
  assertEquals(active.includes("active"), true);
});

// claw's OWN instructions must carry the ledger too, not just the coder
// hand-off in askCore, or the "check what's already settled" skill
// instruction has nothing to read.
Deno.test("renderStateForPrompt includes the decision ledger when the orchestration carries decisions", () => {
  const out = renderStateForPrompt({
    sessionId: "s1",
    codeSessionId: "c1",
    eventCursor: 2,
    appId: null,
    decisions: [{ at: "2026-08-06T12:00:00Z", question: "dialect", decision: "HANA only" }],
  });
  assertStringIncludes(out, "Already settled");
  assertStringIncludes(out, "dialect: HANA only");
});

Deno.test("renderStateForPrompt is byte-identical to before when there are no decisions", () => {
  const withEmptyDecisions = renderStateForPrompt({ sessionId: "s1", codeSessionId: "c1", eventCursor: 2, appId: null, decisions: [] });
  const withNoDecisionsField = renderStateForPrompt({ sessionId: "s1", codeSessionId: "c1", eventCursor: 2, appId: null });
  assertEquals(withEmptyDecisions.includes("Already settled"), false);
  assertEquals(withEmptyDecisions, withNoDecisionsField);
});

Deno.test("appendDecision appends to the ledger", async () => {
  const f = fakeSql();
  await appendDecision(f.fn, "s1", { question: "follow-up window", decision: "configurable, default 365 days" });
  assertEquals(f.calls[0].params?.[0], "s1");
  assertStringIncludes(f.calls[0].sql, "decisions");
});

// Ambiguity #2: the ON CONFLICT branch must touch ONLY decisions/updated_at —
// never code_session_id/app_id, which would silently wipe the live coder-chat
// link on the next append.
Deno.test("appendDecision's ON CONFLICT branch never writes code_session_id or app_id", async () => {
  const f = fakeSql();
  await appendDecision(f.fn, "s1", { question: "q", decision: "d" });
  const updateBranch = f.calls[0].sql.slice(f.calls[0].sql.indexOf("DO UPDATE"));
  assertStringIncludes(updateBranch, "decisions");
  assertStringIncludes(updateBranch, "updated_at");
  assertEquals(updateBranch.includes("code_session_id"), false);
  assertEquals(updateBranch.includes("app_id"), false);
});

Deno.test("readDecisions maps rows", async () => {
  const f = fakeSql();
  f.setRows([{ decisions: [{ at: "2026-08-06T13:00:00Z", question: "window", decision: "configurable" }] }]);
  const got = await readDecisions(f.fn, "s1");
  assertEquals(got.length, 1);
  assertEquals(got[0].decision, "configurable");
});

Deno.test("readDecisions returns [] when the row has no decisions", async () => {
  const f = fakeSql();
  f.setRows([{}]);
  const got = await readDecisions(f.fn, "s1");
  assertEquals(got, []);
});

Deno.test("renderDecisionLedger is empty for no decisions", () => {
  assertEquals(renderDecisionLedger([]), "");
});

Deno.test("renderDecisionLedger lists decisions newest last", () => {
  const out = renderDecisionLedger([
    { at: "2026-08-06T12:00:00Z", question: "dialect", decision: "HANA only" },
    { at: "2026-08-06T13:00:00Z", question: "window", decision: "configurable" },
  ]);
  assertStringIncludes(out, "Already settled");
  assertStringIncludes(out, "dialect: HANA only");
  assertStringIncludes(out, "window: configurable");
  // oldest-first: dialect (12:00) renders before window (13:00), so the
  // latest entry is the one closest to the message that follows the ledger.
  assertEquals(out.indexOf("dialect") < out.indexOf("window"), true);
});

// The header must say outright that the latest entry wins, not just imply it
// via "appears again lower down".
Deno.test("renderDecisionLedger's header states outright that the latest entry wins", () => {
  const out = renderDecisionLedger([{ at: "2026-08-06T12:00:00Z", question: "q", decision: "d" }]);
  assertStringIncludes(out, "LATEST entry");
});

// A decision/question containing a newline must not break the
// one-bullet-per-line rendering.
Deno.test("renderDecisionLedger collapses whitespace in question and decision", () => {
  const out = renderDecisionLedger([
    { at: "2026-08-06T12:00:00Z", question: "follow-up\nwindow", decision: "configurable,\n  default 365 days" },
  ]);
  assertStringIncludes(out, "- follow-up window: configurable, default 365 days");
  assertEquals(out.split("\n").filter((l) => l.startsWith("- ")).length, 1);
});
