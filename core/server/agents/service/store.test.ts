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

Deno.test("addTurn retries on unique violation", async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let attempt = 0;
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    attempt++;
    if (attempt === 1) {
      return Promise.reject(
        new Error(`duplicate key value violates unique constraint "agents_turns_session_id_seq_key"`),
      );
    }
    return Promise.resolve({ rows: [{ id: "t-2", seq: 2 }] });
  };
  const store = createStore(fn as never);
  const t = await store.addTurn("s-1", { role: "user", content: "hi" });
  assertEquals(t, { id: "t-2", seq: 2 });
  assertEquals(calls.length, 2);
});

Deno.test("getSession returns row when found", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "s-1", status: "active", created_by: "user-1" }] }]);
  const store = createStore(fn as never);
  const s = await store.getSession("s-1");
  assertEquals(s, { id: "s-1", status: "active", created_by: "user-1" });
  assert(calls[0].sql.includes("FROM agents.sessions"));
  assert(calls[0].sql.includes("created_by"));
  assertEquals(calls[0].params, ["s-1"]);
});

Deno.test("getSession returns null when not found", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getSession("missing"), null);
});

Deno.test("finishTurn updates status and error", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.finishTurn("t-1", "failed", "boom");
  assert(calls[0].sql.includes("UPDATE agents.turns"));
  assertEquals(calls[0].params, ["t-1", "failed", "boom"]);
});

Deno.test("addStep inserts with null payload/usage passthrough", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.addStep("t-1", 1, "text", "chunk", null);
  assert(calls[0].sql.includes("INSERT INTO agents.steps"));
  assertEquals(calls[0].params, ["t-1", 1, "text", "chunk", null, null]);
});

Deno.test("listEvents returns rows", async () => {
  const rows = [{ kind: "text", name: null, payload: { text: "hi" } }];
  const { fn, calls } = fakeQuery([{ rows }]);
  const store = createStore(fn as never);
  assertEquals(await store.listEvents("s-1"), rows);
  assert(calls[0].sql.includes("FROM agents.steps"));
  assertEquals(calls[0].params, ["s-1"]);
});

Deno.test("getHistory returns rows", async () => {
  const rows = [{ message: { role: "user" }, metadata: null, steps: [] }];
  const { fn, calls } = fakeQuery([{ rows }]);
  const store = createStore(fn as never);
  assertEquals(await store.getHistory("s-1"), rows);
  assert(calls[0].sql.includes("FROM agents.turns"));
  assertEquals(calls[0].params, ["s-1"]);
});

Deno.test("approval round trip", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [{ request_id: "r-1" }] },      // createApproval
    { rows: [{ request_id: "r-1" }] },      // resolveApproval returning row
    { rows: [{ decision: "approve" }] },    // getApprovalDecision
  ]);
  const store = createStore(fn as never);
  const rid = await store.createApproval("s-1", "t-1", "dangerous_tool", { x: 1 });
  assertEquals(rid, "r-1");
  assertEquals(await store.resolveApproval("r-1", "approve", "s-1"), true);
  assert(calls[1].sql.includes("session_id = $3"));
  assertEquals(calls[1].params, ["r-1", "approve", "s-1"]);
  assertEquals(await store.getApprovalDecision("r-1"), "approve");
});

Deno.test("resolveApproval is session-scoped: a requestId for another session resolves nothing", async () => {
  const { fn } = fakeQuery([{ rows: [] }]); // WHERE session_id = $3 excludes the row
  const store = createStore(fn as never);
  assertEquals(await store.resolveApproval("r-1", "approve", "wrong-session"), false);
});

Deno.test("getApprovalTool returns the tool name for a requestId", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ tool: "dangerous_tool" }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getApprovalTool("r-1"), "dangerous_tool");
  assert(calls[0].sql.includes("FROM agents.approvals"));
  assertEquals(calls[0].params, ["r-1"]);
});

Deno.test("getApprovalTool returns null when the request is unknown", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getApprovalTool("nope"), null);
});

// Channel HITL resume — MODE A lookup.
Deno.test("getApprovalSession returns the session for a requestId (null when unknown)", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ session_id: "s-9" }] }, { rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getApprovalSession("r-1"), "s-9");
  assert(calls[0].sql.includes("SELECT session_id FROM agents.approvals"));
  assertEquals(calls[0].params, ["r-1"]);
  assertEquals(await store.getApprovalSession("ghost"), null);
});

// Channel HITL resume — MODE B lookup: exactly-one-pending semantics.
// Task 4 (claw-devx-reliability): the return shape grew from a bare requestId
// to {requestId, tool, options?} — Task 3's gate-text matcher needs the tool
// and (for postChoice-style gates) the option id/label pairs to resolve a
// plain-text reply against the pending gate unambiguously.
Deno.test("getSinglePendingApproval returns requestId+tool only when exactly one is pending", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [{ request_id: "r-7", tool: "postChoice", input: null }] }, // exactly one pending
    { rows: [] }, // zero pending
    { rows: [{ request_id: "r-1", tool: "x" }, { request_id: "r-2", tool: "y" }] }, // two pending (ambiguous)
  ]);
  const store = createStore(fn as never);
  assertEquals(await store.getSinglePendingApproval("s-9"), { requestId: "r-7", tool: "postChoice" });
  assert(calls[0].sql.includes("decision IS NULL"));
  assertEquals(calls[0].params, ["s-9"]);
  assertEquals(await store.getSinglePendingApproval("s-9"), null); // zero
  assertEquals(await store.getSinglePendingApproval("s-9"), null); // >1 → never guess
});

Deno.test("getSinglePendingApproval maps postChoice-style input.options (id/value/label) into {id,label} pairs", async () => {
  const { fn } = fakeQuery([
    {
      rows: [{
        request_id: "r-7",
        tool: "postChoice",
        input: { options: [{ id: "a", label: "Option A" }, { value: "b" }, { id: "", label: "dropped: no id/value" }] },
      }],
    },
  ]);
  const store = createStore(fn as never);
  assertEquals(await store.getSinglePendingApproval("s-9"), {
    requestId: "r-7",
    tool: "postChoice",
    options: [{ id: "a", label: "Option A" }, { id: "b", label: "b" }],
  });
});

Deno.test("getSinglePendingApproval omits options when input carries none", async () => {
  const { fn } = fakeQuery([{ rows: [{ request_id: "r-7", tool: "dangerous_tool", input: { x: 1 } }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getSinglePendingApproval("s-9"), { requestId: "r-7", tool: "dangerous_tool" });
});

// Task 4 (claw-devx-reliability): the "one turn at a time" seam. A busy
// session's running turn (or lack thereof) — see discord-messages.ts's
// folding logic and service/handler.ts's startTurn, which both key off this.
Deno.test("getRunningTurn returns the sole running turn (or null)", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [{ id: "t-1", seq: 3, started_at: new Date("2026-08-19T00:00:00Z") }] },
    { rows: [] },
  ]);
  const store = createStore(fn as never);
  assertEquals(await store.getRunningTurn("s-1"), { id: "t-1", seq: 3, startedAt: new Date("2026-08-19T00:00:00Z") });
  assert(calls[0].sql.includes("status = 'running'"));
  assertEquals(calls[0].params, ["s-1"]);
  assertEquals(await store.getRunningTurn("s-1"), null);
});

// Task 4: 21 turns were observed stuck in `running` forever because nothing
// ever ends an abandoned turn. reapStaleTurns fails only turns whose SQL
// WHERE clause the store issues — cutoff comparison is asserted via the SQL
// text since this file's fakeQuery doesn't evaluate the WHERE clause itself.
Deno.test("reapStaleTurns fails stale running turns and returns the count", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "t-1" }, { id: "t-2" }] }]);
  const store = createStore(fn as never);
  const n = await store.reapStaleTurns(2 * 60 * 60 * 1000);
  assertEquals(n, 2);
  assert(calls[0].sql.includes("UPDATE agents.turns"));
  assert(calls[0].sql.includes("status = 'running'"));
  assert(calls[0].sql.includes("started_at <"));
  assert(calls[0].sql.includes("RETURNING id"));
  assert(
    calls[0].params.includes("turn abandoned (no completion within 120 minutes)"),
    `expected the exact abandoned-turn error string in params, got: ${JSON.stringify(calls[0].params)}`,
  );
});

// Task 4: the follow-up queue a busy session folds a new message into
// (instead of racing it against the turn already running) — see
// service/handler.ts's startTurn.
Deno.test("queueFollowUp inserts and takeFollowUps drains oldest-first, removing what it returns", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [] }, // queueFollowUp
    { rows: [{ message: "also rename the tests" }, { message: "and update the docs" }] }, // takeFollowUps
  ]);
  const store = createStore(fn as never);
  await store.queueFollowUp("s-1", "also rename the tests");
  assert(calls[0].sql.includes("INSERT INTO agents.turn_followups"));
  assertEquals(calls[0].params, ["s-1", "also rename the tests"]);
  const taken = await store.takeFollowUps("s-1");
  assertEquals(taken, ["also rename the tests", "and update the docs"]);
  assert(calls[1].sql.includes("DELETE FROM agents.turn_followups"));
  assertEquals(calls[1].params, ["s-1"]);
});

Deno.test("getToolConsent returns the stored consent verb", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ consent: "always" }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getToolConsent("user-1", "toy-agent", "toy", "guarded"), "always");
  assert(calls[0].sql.includes("FROM agents.tool_consents"));
  assertEquals(calls[0].params, ["user-1", "toy-agent", "toy", "guarded"]);
});

Deno.test("getToolConsent returns null when no consent is on file", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getToolConsent("user-1", "toy-agent", "toy", "guarded"), null);
});

Deno.test("setToolConsent upserts on the (user, plugin, agent, tool) key", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.setToolConsent("user-1", "toy-agent", "toy", "guarded", "never");
  assert(calls[0].sql.includes("INSERT INTO agents.tool_consents"));
  assert(calls[0].sql.includes("ON CONFLICT"));
  assertEquals(calls[0].params, ["user-1", "toy-agent", "toy", "guarded", "never"]);
});
