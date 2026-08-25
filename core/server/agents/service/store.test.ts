import { assert, assertEquals } from "jsr:@std/assert";
import { createStore, denyApprovalsForTurns, type QueryFn } from "./store.ts";

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

// Backstop for reapStaleTurns/denyApprovalsForTurns's own failure mode
// (Fix 1): resolveApprovalDecision refuses to resolve an approval whose turn
// isn't running, so an approval left un-denied by a failed deny is still safe.
Deno.test("getApprovalTurnStatus joins through to the owning turn's status", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ status: "running" }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getApprovalTurnStatus("r-1"), "running");
  assert(calls[0].sql.includes("FROM agents.approvals a"));
  assert(calls[0].sql.includes("JOIN agents.turns t"));
  assertEquals(calls[0].params, ["r-1"]);
});

Deno.test("getApprovalTurnStatus returns null when the approval doesn't exist", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getApprovalTurnStatus("nope"), null);
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
// The return shape grew from a bare requestId to {requestId, tool, options?} —
// the gate-text matcher needs the tool and (for postChoice-style gates) the
// option id/label pairs to resolve a plain-text reply against the pending gate
// unambiguously.
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

// The "one turn at a time" seam. A busy session's running turn (or lack
// thereof) — see discord-messages.ts's folding logic and service/handler.ts's
// startTurn, which both key off this.
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

// 21 turns were observed stuck in `running` forever because nothing
// ever ends an abandoned turn.
//
// String-matching the SQL text alone ("started_at <") never proves the
// direction of the comparison — a reversed operator or a `NOW() + interval`
// sign bug would sail through. reapStaleTurns computes the cutoff in JS and
// passes it as a plain `Date` parameter, so the SQL is a single trivial
// `started_at < $1` with no arithmetic left to hide a sign bug. Two tests
// below cover both realistic ways this could still be reversed without a
// live Postgres: (1) the cutoff VALUE the store computes is actually in the
// past relative to call time, for a given olderThanMs (catches a
// `Date.now() + olderThanMs` sign bug), and (2) the literal SQL text says
// `started_at < $1`, not `>` (catches an operator flip — a meaningful check
// now that it's one trivial operator, not arithmetic to parse). Both
// mutations were verified live against this suite (see the report).
//
// A third test here previously claimed to prove the predicate direction via
// a fake that evaluated `started_at < cutoff` against seeded rows — but the
// fake hardcoded that same `<` and derived its rows from whatever cutoff the
// store handed it, so it could never fail under either mutation above
// (confirmed: it stayed green through both). Deleted rather than left in
// place claiming coverage it didn't provide.

Deno.test("reapStaleTurns issues the exact SQL shape and abandoned-turn error string, scoped to the given session", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "t-1" }, { id: "t-2" }] }]);
  const store = createStore(fn as never);
  const n = await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  assertEquals(n, 2);
  assert(calls[0].sql.includes("UPDATE agents.turns"));
  assert(calls[0].sql.includes("status = 'running'"));
  // session_id = $1 scopes the reap to the calling session — an unscoped
  // reap marked every stale running turn deployment-wide, so one session's
  // message could fail another session's genuinely live turn.
  assert(calls[0].sql.includes("session_id = $1"));
  assert(calls[0].sql.includes("started_at < $2")); // trivial parameter comparison, no in-SQL date arithmetic
  assert(calls[0].sql.includes("RETURNING id"));
  assertEquals(calls[0].params[0], "s-1");
  assert(
    calls[0].params.includes("turn abandoned (no completion within 120 minutes)"),
    `expected the exact abandoned-turn error string in params, got: ${JSON.stringify(calls[0].params)}`,
  );
});

Deno.test("reapStaleTurns computes a cutoff strictly in the past (catches a reversed sign)", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  const before = Date.now();
  await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000); // 2h
  const after = Date.now();
  const cutoff = calls[0].params[1] as Date;
  assert(cutoff instanceof Date, `expected a Date parameter, got: ${JSON.stringify(calls[0].params)}`);
  // cutoff must land within [before - 2h, after - 2h] — i.e. "2h ago", not
  // "2h from now" (which a Date.now() + olderThanMs bug would produce, and
  // which this range would never contain).
  assert(
    cutoff.getTime() >= before - 2 * 60 * 60 * 1000 && cutoff.getTime() <= after - 2 * 60 * 60 * 1000,
    `cutoff ${cutoff.toISOString()} is not ~2h before call time — sign of the cutoff computation looks reversed`,
  );
});

// Fix 2: the sweep query must be scoped to the calling worker's own
// (plugin, agent) — agents.turns carries no plugin/agent column itself, so
// this has to join agents.sessions. Without this scoping, a worker for one
// agent (e.g. claw) would list and reap every OTHER agent's stale sessions
// too (devx-coder, d2esupport, ...), and — since the reap winner is also the
// one who publishes turn.reaped — that notification would be silently lost
// for a foreign session it has no subscriber for.
Deno.test("listSessionsWithStaleRunningTurns scopes to the given plugin+agent via a join on agents.sessions", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ session_id: "s-1" }, { session_id: "s-2" }] }]);
  const store = createStore(fn as never);
  const ids = await store.listSessionsWithStaleRunningTurns(2 * 60 * 60 * 1000, "claw-agent", "claw");
  assertEquals(ids, ["s-1", "s-2"]);
  assert(calls[0].sql.includes("FROM agents.turns t"));
  assert(calls[0].sql.includes("JOIN agents.sessions s ON s.id = t.session_id"));
  assert(calls[0].sql.includes("status = 'running'"));
  assert(calls[0].sql.includes("s.plugin = $2"));
  assert(calls[0].sql.includes("s.agent = $3"));
  assertEquals(calls[0].params[1], "claw-agent");
  assertEquals(calls[0].params[2], "claw");
  assert(calls[0].params[0] instanceof Date);
});

// The follow-up queue a busy session folds a new message into (instead of
// racing it against the turn already running) — see service/handler.ts's
// startTurn.
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

Deno.test("reapStaleTurns also denies every still-pending approval belonging to the turns it reaps", async () => {
  const calls: Array<{ q: string; p: unknown[] }> = [];
  const query: QueryFn = async (q, p = []) => {
    calls.push({ q, p });
    if (q.includes("UPDATE agents.turns") && q.includes("RETURNING id")) {
      // Simulate two stale turns reaped.
      return { rows: [{ id: "t-1" }, { id: "t-2" }] };
    }
    if (q.includes("UPDATE agents.approvals") && q.includes("turn_id = ANY")) {
      return { rows: [{ request_id: "a-1" }] };
    }
    return { rows: [] };
  };
  const store = createStore(query);
  const n = await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  assertEquals(n, 2);
  const denyCall = calls.find((c) => c.q.includes("UPDATE agents.approvals"));
  assertEquals(denyCall !== undefined, true);
  assertEquals(denyCall!.p[0], ["t-1", "t-2"]);
});

Deno.test("reapStaleTurns denies nothing and issues no approvals query when it reaps zero turns", async () => {
  const calls: Array<{ q: string }> = [];
  const query: QueryFn = async (q) => {
    calls.push({ q });
    if (q.includes("UPDATE agents.turns")) return { rows: [] };
    return { rows: [] };
  };
  const store = createStore(query);
  const n = await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  assertEquals(n, 0);
  assertEquals(calls.some((c) => c.q.includes("UPDATE agents.approvals")), false);
});

Deno.test("getLastTurnUsage returns the most recent finish step's input tokens", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ usage: { inputTokens: 12345, outputTokens: 200 } }] }]);
  const store = createStore(fn as never);
  const usage = await store.getLastTurnUsage("s-1");
  assertEquals(usage, { inputTokens: 12345 });
  assert(calls[0].sql.includes("kind = 'finish'"));
  assertEquals(calls[0].params, ["s-1"]);
});

Deno.test("getLastTurnUsage returns null when no finish step exists yet", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getLastTurnUsage("s-1"), null);
});

Deno.test("getLastTurnUsage returns null when the finish step recorded no usable inputTokens", async () => {
  const { fn } = fakeQuery([{ rows: [{ usage: null }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getLastTurnUsage("s-1"), null);
});

Deno.test("denyApprovalsForTurns: no-ops on an empty list without querying", async () => {
  let called = false;
  const query: QueryFn = async () => { called = true; return { rows: [] }; };
  const n = await denyApprovalsForTurns([], query);
  assertEquals(n, 0);
  assertEquals(called, false);
});

Deno.test("denyApprovalsForTurns: only denies still-undecided approvals, scoped to the given turns", async () => {
  const query: QueryFn = async (q, p) => {
    assertEquals(q.includes("turn_id = ANY($1)"), true);
    assertEquals(q.includes("decision IS NULL"), true);
    assertEquals(p, [["t-1"]]);
    return { rows: [{ request_id: "a-1" }, { request_id: "a-2" }] };
  };
  const n = await denyApprovalsForTurns(["t-1"], query);
  assertEquals(n, 2);
});

Deno.test("activateTools: no-ops on an empty list without querying", async () => {
  const { fn, calls } = fakeQuery([]);
  const store = createStore(fn as never);
  await store.activateTools("s-1", []);
  assertEquals(calls.length, 0);
});

Deno.test("activateTools: appends the given names onto agents.sessions.activated_tools", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.activateTools("s-1", ["KBSearch", "ExecuteSQL"]);
  assert(calls[0].sql.includes("UPDATE agents.sessions"));
  assert(calls[0].sql.includes("activated_tools"));
  assertEquals(calls[0].params, ["s-1", ["KBSearch", "ExecuteSQL"]]);
});

Deno.test("getActivatedTools: returns the persisted array", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ activated_tools: ["KBSearch"] }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getActivatedTools("s-1"), ["KBSearch"]);
  assertEquals(calls[0].params, ["s-1"]);
});

Deno.test("getActivatedTools: returns [] when the session has never activated anything (NULL column)", async () => {
  const { fn } = fakeQuery([{ rows: [{ activated_tools: null }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getActivatedTools("s-1"), []);
});

Deno.test("getActivatedTools: returns [] when the session row doesn't exist", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getActivatedTools("missing"), []);
});
