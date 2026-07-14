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
  f.setRows([{ session_id: "s1", code_session_id: "c1", plan: "the plan", status: "awaiting_ship", event_cursor: 7 }]);
  const got = await readOrchestration(f.fn, "s1");
  assertEquals(got, { sessionId: "s1", codeSessionId: "c1", plan: "the plan", status: "awaiting_ship", eventCursor: 7 });
});

Deno.test("upsertOrchestration passes all fields as params", async () => {
  const f = fakeSql();
  const o: Orchestration = { sessionId: "s1", codeSessionId: "c1", plan: "p", status: "implementing", eventCursor: 3 };
  await upsertOrchestration(f.fn, o);
  assertEquals(f.calls[0].params, ["s1", "c1", "p", "implementing", 3]);
});

Deno.test("renderStateForPrompt is explicit when empty and when populated", () => {
  assertEquals(renderStateForPrompt(null).includes("No active"), true);
  const s = renderStateForPrompt({ sessionId: "s1", codeSessionId: "c1", plan: "P", status: "awaiting_ship", eventCursor: 2 });
  assertEquals(s.includes("awaiting_ship"), true);
  assertEquals(s.includes("c1"), true);
});
