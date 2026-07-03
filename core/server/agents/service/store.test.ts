import { assert, assertEquals } from "jsr:@std/assert";
import { createStore } from "./store.ts";

function fakeQuery(responses: Array<{ rows: unknown[] }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve(responses.shift() ?? { rows: [] });
  };
  return { fn, calls };
}

Deno.test("createSession inserts and returns id", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "s-1" }] }]);
  const store = createStore(fn as never);
  const id = await store.createSession("toy-agent", "toy", "user-1");
  assertEquals(id, "s-1");
  assert(calls[0].sql.includes("INSERT INTO agents.sessions"));
  assertEquals(calls[0].params, ["toy-agent", "toy", "user-1"]);
});

Deno.test("addTurn computes next seq atomically in SQL", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "t-1", seq: 3 }] }]);
  const store = createStore(fn as never);
  const t = await store.addTurn("s-1", { role: "user", content: "hi" });
  assertEquals(t, { id: "t-1", seq: 3 });
  assert(calls[0].sql.includes("COALESCE(MAX(seq), 0) + 1"));
});

Deno.test("approval round trip", async () => {
  const { fn } = fakeQuery([
    { rows: [{ request_id: "r-1" }] },      // createApproval
    { rows: [{ request_id: "r-1" }] },      // resolveApproval returning row
    { rows: [{ decision: "approve" }] },    // getApprovalDecision
  ]);
  const store = createStore(fn as never);
  const rid = await store.createApproval("s-1", "t-1", "dangerous_tool", { x: 1 });
  assertEquals(rid, "r-1");
  assertEquals(await store.resolveApproval("r-1", "approve"), true);
  assertEquals(await store.getApprovalDecision("r-1"), "approve");
});
