import { assertEquals } from "jsr:@std/assert";
import { readOrchestration, upsertOrchestration, renderStateForPrompt, type Orchestration } from "./state.ts";

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
  assertEquals(got, { sessionId: "s1", codeSessionId: "c1", eventCursor: 7 });
});

Deno.test("upsertOrchestration passes session, code session, and cursor as params", async () => {
  const f = fakeSql();
  const o: Orchestration = { sessionId: "s1", codeSessionId: "c1", eventCursor: 3 };
  await upsertOrchestration(f.fn, o);
  assertEquals(f.calls[0].params, ["s1", "c1", 3]);
});

Deno.test("renderStateForPrompt distinguishes no-session from active-session", () => {
  assertEquals(renderStateForPrompt(null).includes("No coding-agent session yet"), true);
  assertEquals(
    renderStateForPrompt({ sessionId: "s1", codeSessionId: null, eventCursor: 0 }).includes("No coding-agent session yet"),
    true,
  );
  const active = renderStateForPrompt({ sessionId: "s1", codeSessionId: "c1", eventCursor: 2 });
  assertEquals(active.includes("active"), true);
});
