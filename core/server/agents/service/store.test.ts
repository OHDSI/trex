import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { createStore, denyApprovalsForTurns, RUNNING_TURN_INDEX, type QueryFn } from "./store.ts";
import { STOPPED_BY_PARENT_ERROR } from "./orchestration.ts";

function fakeQuery(responses: Array<{ rows: unknown[] }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve(responses.shift() ?? { rows: [] });
  };
  return { fn, calls };
}

type RecordedCall = { sql: string; params?: unknown[] };

/**
 * The parameters of the nth recorded query.
 *
 * QueryFn's `params` is genuinely optional — a parameter-free query passes
 * none — so `calls[0].params[0]` is an index into a possibly-undefined value.
 * Rather than assert it away, this states the thing the test actually means:
 * THIS query must have been parameterised. A store method that silently
 * stopped passing its params now fails with that sentence instead of a bare
 * "cannot read property 0 of undefined".
 */
function paramsOf(calls: RecordedCall[], n = 0): unknown[] {
  const call = calls[n];
  assert(call, `expected at least ${n + 1} recorded quer${n ? "ies" : "y"}, got ${calls.length}`);
  assert(call.params, `query ${n} was issued with no parameters at all: ${call.sql}`);
  return call.params;
}

Deno.test("createSession inserts and returns id", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "s-1" }] }]);
  const store = createStore(fn as never);
  const id = await store.createSession("toy-agent", "toy", "user-1");
  assertEquals(id, "s-1");
  assert(calls[0].sql.includes("INSERT INTO agents.sessions"));
  assertEquals(calls[0].params, ["toy-agent", "toy", "user-1", false]);
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

// Final review, Critical 3: two DIFFERENT unique constraints can reject this
// INSERT since V9, and they mean opposite things. (session_id, seq) is a race
// worth retrying — recomputing MAX(seq) resolves it. The one-running-turn
// index is a durable state: another turn IS running, and retrying only burns
// two more round trips before rethrowing the identical error, while the
// caller's already-drained message sits in hand with nowhere to go.
Deno.test("addTurn does NOT retry the one-running-turn index — it rethrows at once", async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.reject(
      new Error(`duplicate key value violates unique constraint "${RUNNING_TURN_INDEX}"`),
    );
  };
  const store = createStore(fn as never);
  await assertRejects(
    () => store.addTurn("s-1", "hi"),
    Error,
    RUNNING_TURN_INDEX,
  );
  assertEquals(calls.length, 1, "a running-turn rejection must not be retried");
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

Deno.test("finishTurn updates status and error, scoped to a still-running turn, and reports whether it won", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "t-1" }] }]);
  const store = createStore(fn as never);
  const won = await store.finishTurn("t-1", "failed", "boom");
  assert(calls[0].sql.includes("UPDATE agents.turns"));
  assert(calls[0].sql.includes("status = 'running'"), "finishTurn must not overwrite a turn a reap already finished");
  assertEquals(calls[0].params, ["t-1", "failed", "boom"]);
  assertEquals(won, true);
});

// Fix round 1 (2026-08-27-agent-orchestration, tasks 12-13 review): before
// this, finishTurn was the one mutator among {heartbeatTurn, reapStaleTurns,
// failTurnsForSession, finishTurn} that was NOT scoped to `status =
// 'running'` — a stalled-then-resurfacing worker's finishTurn("completed")
// could silently overwrite a turn a reap had already marked `failed`, and
// handler.ts's success tail had no way to know it had lost that race and
// would still walk into the follow-up chain and deliverChildResult. This
// test proves the scoping directly: a turn already `failed` (standing in for
// "a reap won first") must not be resurrected, and the caller must be told
// it did not win.
Deno.test("finishTurn reports false (and does not affect any row) when the turn is no longer running — the reap-wins race", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]); // RETURNING id matched nothing: WHERE excluded the row
  const store = createStore(fn as never);
  const won = await store.finishTurn("t-1", "completed");
  assert(calls[0].sql.includes("status = 'running'"));
  assertEquals(won, false, "a late finishTurn on an already-reaped turn must report it did not win");
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
  const rid = await store.createApproval("s-1", "t-1", "dangerous_tool", { x: 1 }, "");
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
  const reaped = await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  assertEquals(reaped, [{ id: "t-1", metadata: undefined }, { id: "t-2", metadata: undefined }]);
  assert(calls[0].sql.includes("UPDATE agents.turns"));
  assert(calls[0].sql.includes("status = 'running'"));
  // session_id = $1 scopes the reap to the calling session — an unscoped
  // reap marked every stale running turn deployment-wide, so one session's
  // message could fail another session's genuinely live turn.
  assert(calls[0].sql.includes("session_id = $1"));
  assert(calls[0].sql.includes("started_at < $2")); // trivial parameter comparison, no in-SQL date arithmetic
  // metadata comes back with the ids because the reap notifier (reap-notify.ts)
  // reads the delivery channel off it, and by reap time the row is the only
  // place still holding it.
  assert(calls[0].sql.includes("RETURNING id, metadata"));
  assertEquals(paramsOf(calls)[0], "s-1");
  assert(
    paramsOf(calls).includes("turn abandoned (no completion within 120 minutes)"),
    `expected the exact abandoned-turn error string in params, got: ${JSON.stringify(paramsOf(calls))}`,
  );
});

Deno.test("reapStaleTurns computes a cutoff strictly in the past (catches a reversed sign)", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  const before = Date.now();
  await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000); // 2h
  const after = Date.now();
  const cutoff = paramsOf(calls)[1] as Date;
  assert(cutoff instanceof Date, `expected a Date parameter, got: ${JSON.stringify(paramsOf(calls))}`);
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
  assertEquals(paramsOf(calls)[1], "claw-agent");
  assertEquals(paramsOf(calls)[2], "claw");
  assert(paramsOf(calls)[0] instanceof Date);
});

// The follow-up queue a busy session folds a new message into (instead of
// racing it against the turn already running) — see service/handler.ts's
// startTurn.
Deno.test("queueFollowUp inserts and takeFollowUps drains oldest-first, removing what it returns", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [] }, // queueFollowUp
    {
      rows: [
        { message: "also rename the tests", origin_child_session_id: null },
        { message: "and update the docs", origin_child_session_id: null },
      ],
    }, // takeFollowUps
  ]);
  const store = createStore(fn as never);
  await store.queueFollowUp("s-1", "also rename the tests");
  assert(calls[0].sql.includes("INSERT INTO agents.turn_followups"));
  // A message nobody asked for on a child's behalf has no origin — explicit
  // NULL, not an absent column, so the INSERT's shape never varies.
  assertEquals(calls[0].params, ["s-1", "also rename the tests", null]);
  const taken = await store.takeFollowUps("s-1");
  assertEquals(taken, [
    { message: "also rename the tests", originChildSessionId: null },
    { message: "and update the docs", originChildSessionId: null },
  ]);
  assert(calls[1].sql.includes("DELETE FROM agents.turn_followups"));
  assertEquals(calls[1].params, ["s-1"]);
});

// V10__followup_origin.sql: the row records WHICH child it exists because of,
// so the turn that drains it can tell a child-caused chain from one carrying
// only human messages — without consulting a session-wide stamp that belongs
// to whichever sibling wrote it last.
Deno.test("queueFollowUp records the originating child, and takeFollowUps reads it back", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [] },
    { rows: [{ message: "Agent Kepler finished:\n\nfound it", origin_child_session_id: "c-9" }] },
  ]);
  const store = createStore(fn as never);
  await store.queueFollowUp("p-1", "Agent Kepler finished:\n\nfound it", "c-9");
  assert(calls[0].sql.includes("origin_child_session_id"));
  assertEquals(calls[0].params, ["p-1", "Agent Kepler finished:\n\nfound it", "c-9"]);
  assertEquals(await store.takeFollowUps("p-1"), [{
    message: "Agent Kepler finished:\n\nfound it",
    originChildSessionId: "c-9",
  }]);
  assert(calls[1].sql.includes("origin_child_session_id"), "the drain must return the origin, not just the text");
});

// The stamp V10 replaces is gone from the store entirely — a superseded
// approximation left beside its own fix only invites the two to drift.
Deno.test("resetConsecutiveWakes zeroes the counter and no longer touches the retired session stamp", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.resetConsecutiveWakes("s-1");
  assert(calls[0].sql.includes("consecutive_wakes = 0"));
  assert(!calls[0].sql.includes("pending_wake_child_id"), calls[0].sql);
  assertEquals("markPendingWake" in store, false);
  assertEquals("readPendingWake" in store, false);
});

Deno.test("getToolConsent returns the stored consent verb", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ consent: "always" }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getToolConsent("user-1", "toy-agent", "toy", "guarded", ""), "always");
  assert(calls[0].sql.includes("FROM agents.tool_consents"));
  assertEquals(calls[0].params, ["user-1", "toy-agent", "toy", "guarded", ""]);
});

Deno.test("getToolConsent returns null when no consent is on file", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getToolConsent("user-1", "toy-agent", "toy", "guarded", ""), null);
});

Deno.test("setToolConsent upserts on the (user, plugin, agent, tool, scope_key) key", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.setToolConsent("user-1", "toy-agent", "toy", "guarded", "", "never");
  assert(calls[0].sql.includes("INSERT INTO agents.tool_consents"));
  assert(calls[0].sql.includes("ON CONFLICT"));
  assertEquals(calls[0].params, ["user-1", "toy-agent", "toy", "guarded", "", "never"]);
});

Deno.test("getToolConsent keys on the scope", async () => {
  const seen: unknown[][] = [];
  const store = createStore((_sql, params) => {
    seen.push(params ?? []);
    return Promise.resolve({ rows: [{ consent: "always" }] });
  });
  assertEquals(await store.getToolConsent("u", "p", "a", "Bash", "npm"), "always");
  assertEquals(seen[0], ["u", "p", "a", "Bash", "npm"]);
});

Deno.test("setToolConsent upserts on the five-column key", async () => {
  let sql = "";
  const store = createStore((s, _p) => { sql = s; return Promise.resolve({ rows: [] }); });
  await store.setToolConsent("u", "p", "a", "Bash", "npm", "always");
  assertStringIncludes(sql, "ON CONFLICT (user_id, plugin, agent, tool, scope_key)");
});

Deno.test("createApproval persists the scope key", async () => {
  let params: unknown[] = [];
  const store = createStore((_s, p) => { params = p ?? []; return Promise.resolve({ rows: [{ request_id: "r1" }] }); });
  await store.createApproval("s1", "t1", "Bash", { command: "rm -rf x" }, "rm");
  assertEquals(params[4], "rm");
});

Deno.test("getApprovalScope returns tool and scope together", async () => {
  const store = createStore(() => Promise.resolve({ rows: [{ tool: "Bash", scope_key: "rm" }] }));
  assertEquals(await store.getApprovalScope("r1"), { tool: "Bash", scopeKey: "rm" });
});

Deno.test("getApprovalScope returns null for an unknown request", async () => {
  const store = createStore(() => Promise.resolve({ rows: [] }));
  assertEquals(await store.getApprovalScope("nope"), null);
});

Deno.test("isChannelBound is true when a channel_sessions row exists", async () => {
  assertEquals(await createStore(() => Promise.resolve({ rows: [{ "?column?": 1 }] })).isChannelBound("s1"), true);
  assertEquals(await createStore(() => Promise.resolve({ rows: [] })).isChannelBound("s1"), false);
});

Deno.test("isUnattended reads the session flag, defaulting closed", async () => {
  assertEquals(await createStore(() => Promise.resolve({ rows: [{ unattended: true }] })).isUnattended("s1"), true);
  assertEquals(await createStore(() => Promise.resolve({ rows: [] })).isUnattended("s1"), false);
});

Deno.test("createSession persists unattended, defaulting false", async () => {
  let params: unknown[] = [];
  const store = createStore((_s, p) => { params = p ?? []; return Promise.resolve({ rows: [{ id: "s1" }] }); });
  await store.createSession("p", "a", "u");
  assertEquals(params[3], false);
  await store.createSession("p", "a", "u", true);
  assertEquals(params[3], true);
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
  const reaped = await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  assertEquals(reaped.length, 2);
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
  const reaped = await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  assertEquals(reaped, []);
  assertEquals(calls.some((c) => c.q.includes("UPDATE agents.approvals")), false);
});

Deno.test("getLastTurnUsage returns the most recent finish step's LAST-STEP input tokens", async () => {
  const { fn, calls } = fakeQuery([{
    rows: [{ usage: { inputTokens: 600_000, outputTokens: 200, lastStepInputTokens: 12345 } }],
  }]);
  const store = createStore(fn as never);
  const usage = await store.getLastTurnUsage("s-1");
  assertEquals(usage, { inputTokens: 12345 });
  assert(calls[0].sql.includes("kind = 'finish'"));
  assertEquals(calls[0].params, ["s-1"]);
});

// The defect this field exists to fix: `inputTokens` is ai@6's totalUsage —
// the SUM over every step of the turn — so a long multi-step turn reports a
// number many times the real context size. Reading it as a window occupancy
// tripped compaction before nearly every turn.
Deno.test("getLastTurnUsage never falls back to the SUMMED inputTokens total", async () => {
  const { fn } = fakeQuery([{ rows: [{ usage: { inputTokens: 600_000, outputTokens: 200 } }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getLastTurnUsage("s-1"), null);
});

Deno.test("getLastTurnUsage returns null when no finish step exists yet", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  assertEquals(await store.getLastTurnUsage("s-1"), null);
});

Deno.test("getLastTurnUsage returns null when the finish step recorded no usable usage", async () => {
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
// --- heartbeat clock (V7__turn_heartbeat.sql) ------------------------------
// `started_at` says how long a turn has been RUNNING, which for a live turn is
// evidence of nothing — long turns are legitimate. `heartbeat_at` says when the
// turn's worker was last demonstrably alive, so a lapsed stamp is positive
// evidence the worker is gone and can be acted on in minutes instead of hours.

Deno.test("heartbeatTurn stamps only while the turn is still running", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.heartbeatTurn("t-1");
  assert(calls[0].sql.includes("UPDATE agents.turns"));
  assert(calls[0].sql.includes("heartbeat_at = NOW()"));
  // Without this guard a beat racing finishTurn could re-stamp a turn that
  // already ended, or resurrect one the sweep had just reaped.
  assert(calls[0].sql.includes("status = 'running'"));
  assertEquals(calls[0].params, ["t-1"]);
});

Deno.test("addTurn stamps heartbeat_at at insert, so a worker dying in the first interval is still covered", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "t-1", seq: 1 }] }]);
  const store = createStore(fn as never);
  await store.addTurn("s-1", "hi");
  assert(calls[0].sql.includes("heartbeat_at"));
  assert(calls[0].sql.includes("NOW()"));
});

Deno.test("reapStaleTurns: both cutoffs are passed, and the heartbeat one is the fast clock", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  const before = Date.now();
  await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000, 3 * 60 * 1000);
  const after = Date.now();

  const startedCutoff = calls[0].params![1] as Date;
  const beatCutoff = calls[0].params![3] as Date;
  assert(beatCutoff instanceof Date);
  assert(
    beatCutoff.getTime() >= before - 3 * 60 * 1000 && beatCutoff.getTime() <= after - 3 * 60 * 1000,
    `heartbeat cutoff ${beatCutoff.toISOString()} is not ~3 minutes ago`,
  );
  // The heartbeat cutoff must be the MORE RECENT of the two — that is the
  // whole point: it catches a dead worker long before started_at would.
  assert(beatCutoff.getTime() > startedCutoff.getTime());
  // A NULL-heartbeat row is never reaped on the heartbeat clock: absence of a
  // stamp is not absence of a worker.
  assert(calls[0].sql.includes("heartbeat_at IS NULL AND started_at < $2"));
  assert(calls[0].params!.some((p) => typeof p === "string" && p.includes("no heartbeat for over 3 minutes")));
});

Deno.test("reapStaleTurns: omitting the heartbeat cutoff keeps the pure started_at behaviour", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.reapStaleTurns("s-1", 2 * 60 * 60 * 1000);
  // NULL disables the heartbeat arm of the predicate entirely ($4 IS NOT NULL
  // guards every use of it), so a caller that has not opted in reaps exactly
  // what it reaped before.
  assertEquals(calls[0].params![3], null);
});

Deno.test("listSessionsWithStaleRunningTurns: mirrors reapStaleTurns's two cutoffs", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.listSessionsWithStaleRunningTurns(2 * 60 * 60 * 1000, "claw-agent", "claw", 3 * 60 * 1000);
  // If the list and the reap disagreed, the sweep would either churn on
  // sessions the reap declines to touch, or skip ones it would have cleared.
  assert(calls[0].sql.includes("t.heartbeat_at IS NOT NULL AND t.heartbeat_at < $4"));
  assert(calls[0].sql.includes("t.heartbeat_at IS NULL AND t.started_at < $1"));
  assert(calls[0].params![3] instanceof Date);
});

Deno.test("channelForSession is not part of the turn store (it lives on the channel store)", () => {
  const store = createStore((() => Promise.resolve({ rows: [] })) as never);
  assertEquals("channelForSession" in store, false);
});

// --- child sessions (V9__orchestration.sql) --------------------------------
// Ownership is a security boundary, not a convenience: agent_id reaches these
// queries straight from the model (via agent_wait/agent_send/agent_stop), so
// a child belonging to another session must be indistinguishable from one
// that never existed — the WHERE clause must do the scoping, never a
// fetch-then-filter in JS.

Deno.test("getChild scopes by parent — a foreign child is not returned", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  const got = await store.getChild("child-1", "parent-A");
  assertEquals(got, null);
  assert(calls[0].sql.includes("parent_session_id"), "ownership must be enforced in SQL, not in JS");
  assertEquals(calls[0].params, ["child-1", "parent-A"]);
});

Deno.test("createChildSession writes parent pointers and nickname", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "c-1" }] }]);
  const store = createStore(fn as never);
  const id = await store.createChildSession({
    plugin: "devx",
    agent: "devx",
    parentSessionId: "p-1",
    parentTurnId: "t-1",
    subagent: "code-reviewer",
    nickname: "Kepler",
    detached: true,
  });
  assertEquals(id, "c-1");
  assert(calls[0].sql.includes("parent_session_id"));
  assert(calls[0].params?.includes("Kepler"));
});

// A child of an unattended parent has no human approver either, so the flag
// must reach the child row too — not just the top-level createSession.
Deno.test("createChildSession persists unattended, defaulting false", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ id: "c-1" }] }, { rows: [{ id: "c-2" }] }]);
  const store = createStore(fn as never);
  await store.createChildSession({
    plugin: "devx",
    agent: "devx",
    parentSessionId: "p-1",
    parentTurnId: "t-1",
    subagent: "code-reviewer",
    nickname: "Kepler",
    detached: true,
  });
  assert(calls[0].sql.includes("unattended"));
  assertEquals(calls[0].params?.at(-1), false);

  await store.createChildSession({
    plugin: "devx",
    agent: "devx",
    parentSessionId: "p-1",
    parentTurnId: "t-1",
    subagent: "code-reviewer",
    nickname: "Faraday",
    detached: true,
    unattended: true,
  });
  assertEquals(calls[1].params?.at(-1), true);
});

Deno.test("countChildren returns live and total separately", async () => {
  const { fn } = fakeQuery([{ rows: [{ live: 2, total: 7 }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.countChildren("p-1"), { live: 2, total: 7 });
});

Deno.test("bumpConsecutiveWakes returns the new value", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ consecutive_wakes: 3 }] }]);
  const store = createStore(fn as never);
  assertEquals(await store.bumpConsecutiveWakes("p-1"), 3);
  assert(calls[0].sql.includes("consecutive_wakes"));
});

Deno.test("resetConsecutiveWakes zeroes the counter", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createStore(fn as never);
  await store.resetConsecutiveWakes("p-1");
  assert(calls[0].sql.includes("consecutive_wakes = 0"));
  assertEquals(calls[0].params, ["p-1"]);
});

// `status` is a DISPLAY value derived from the child's latest turn — it is
// never written to a DB column, and 'stopped' in particular does not exist
// in agents.turns' CHECK constraint (only running/completed/failed do).

Deno.test("getChild derives status 'running' for a child with no turns yet", async () => {
  const { fn } = fakeQuery([{
    rows: [{
      id: "c-1",
      nickname: "Kepler",
      subagent: null,
      detached: false,
      created_at: new Date("2026-08-27T00:00:00Z"),
      turn_status: null,
      turn_error: null,
    }],
  }]);
  const store = createStore(fn as never);
  const child = await store.getChild("c-1", "p-1");
  assertEquals(child?.status, "running");
});

Deno.test("getChild derives status 'stopped' from a failed turn carrying the stop marker", async () => {
  const { fn } = fakeQuery([{
    rows: [{
      id: "c-1",
      nickname: "Kepler",
      subagent: null,
      detached: false,
      created_at: new Date("2026-08-27T00:00:00Z"),
      turn_status: "failed",
      turn_error: STOPPED_BY_PARENT_ERROR,
    }],
  }]);
  const store = createStore(fn as never);
  const child = await store.getChild("c-1", "p-1");
  assertEquals(child?.status, "stopped");
});

Deno.test("getChild derives status 'failed' as-is for an ordinary failure (not the stop marker)", async () => {
  const { fn } = fakeQuery([{
    rows: [{
      id: "c-1",
      nickname: "Kepler",
      subagent: null,
      detached: false,
      created_at: new Date("2026-08-27T00:00:00Z"),
      turn_status: "failed",
      turn_error: "the model refused",
    }],
  }]);
  const store = createStore(fn as never);
  const child = await store.getChild("c-1", "p-1");
  assertEquals(child?.status, "failed");
});

Deno.test("listChildren is scoped to the parent and orders by created_at", async () => {
  const rows = [
    {
      id: "c-1",
      nickname: "Kepler",
      subagent: "code-reviewer",
      detached: true,
      created_at: new Date("2026-08-27T00:00:00Z"),
      turn_status: "completed",
      turn_error: null,
    },
    {
      id: "c-2",
      nickname: "Faraday",
      subagent: null,
      detached: false,
      created_at: new Date("2026-08-27T00:01:00Z"),
      turn_status: null,
      turn_error: null,
    },
  ];
  const { fn, calls } = fakeQuery([{ rows }]);
  const store = createStore(fn as never);
  const children = await store.listChildren("p-1");
  assertEquals(children.map((c) => c.agentId), ["c-1", "c-2"]);
  assertEquals(children[0].status, "completed");
  assertEquals(children[1].status, "running");
  assert(calls[0].sql.includes("parent_session_id = $1"));
  assert(calls[0].sql.includes("ORDER BY"));
  // The second parameter is listChildren's liveOnly flag, false by default.
  assertEquals(calls[0].params, ["p-1", false]);
});

Deno.test("listChildren defaults to the unfiltered listing and passes liveOnly to SQL when asked", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }, { rows: [] }]);
  const store = createStore(fn as never);
  await store.listChildren("p-1");
  assertEquals(calls[0].params, ["p-1", false], "the default listing must not filter");
  await store.listChildren("p-1", { liveOnly: true });
  assertEquals(calls[1].params, ["p-1", true]);
  // The filter must happen in the database, not by discarding rows in JS.
  assert(calls[1].sql.includes("$2::boolean"), calls[1].sql);
});

Deno.test("countChildren's live filter is the same predicate the child status derives from", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ live: 2, total: 7 }] }]);
  const store = createStore(fn as never);
  await store.countChildren("p-1");
  // A child between createChildSession and its first addTurn has no turn row,
  // so lt.status is NULL — deriveChildStatus calls that "running" and the cap
  // must agree, or a burst of spawns admits more than MAX_LIVE_CHILDREN.
  assert(calls[0].sql.includes("lt.status IS NULL"), calls[0].sql);
  assert(calls[0].sql.includes("LATERAL"), "must count off the LATEST turn, not an independent EXISTS probe");
});

Deno.test("failTurnsForSession marks the session's running turns failed and returns the count", async () => {
  const calls: Array<{ q: string; p: unknown[] }> = [];
  const query: QueryFn = async (q, p = []) => {
    calls.push({ q, p });
    if (q.includes("UPDATE agents.turns")) return { rows: [{ id: "t-1" }, { id: "t-2" }] };
    return { rows: [] };
  };
  const store = createStore(query);
  const n = await store.failTurnsForSession("c-1", STOPPED_BY_PARENT_ERROR);
  assertEquals(n, 2);
  const turnsCall = calls.find((c) => c.q.includes("UPDATE agents.turns"));
  assert(turnsCall);
  assert(turnsCall!.q.includes("status = 'running'"));
  assertEquals(turnsCall!.p, ["c-1", STOPPED_BY_PARENT_ERROR]);
});

Deno.test("failTurnsForSession also denies still-pending approvals for the turns it fails", async () => {
  const calls: Array<{ q: string; p: unknown[] }> = [];
  const query: QueryFn = async (q, p = []) => {
    calls.push({ q, p });
    if (q.includes("UPDATE agents.turns")) return { rows: [{ id: "t-1" }] };
    if (q.includes("UPDATE agents.approvals") && q.includes("turn_id = ANY")) {
      return { rows: [{ request_id: "a-1" }] };
    }
    return { rows: [] };
  };
  const store = createStore(query);
  await store.failTurnsForSession("c-1", STOPPED_BY_PARENT_ERROR);
  const denyCall = calls.find((c) => c.q.includes("UPDATE agents.approvals"));
  assert(denyCall, "must deny approvals for the turns it just failed");
  assertEquals(denyCall!.p[0], ["t-1"]);
});

Deno.test("failTurnsForSession returns 0 and denies nothing when the session has no running turns", async () => {
  const calls: Array<{ q: string }> = [];
  const query: QueryFn = async (q) => {
    calls.push({ q });
    return { rows: [] };
  };
  const store = createStore(query);
  const n = await store.failTurnsForSession("c-1", STOPPED_BY_PARENT_ERROR);
  assertEquals(n, 0);
  assertEquals(calls.some((c) => c.q.includes("UPDATE agents.approvals")), false);
});
