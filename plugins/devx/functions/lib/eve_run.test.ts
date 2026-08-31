// deno test --no-check --allow-all plugins/devx/functions/lib/eve_run.test.ts
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import type { DevxSseFrame } from "./eve_sse.ts";
import { bearerFromRequest, denialSummary, NO_APPROVER_ERROR, runOnEve, UNAVAILABLE_TOOL_ERROR } from "./eve_run.ts";

interface Call {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}

// A fake eve seam that REFUSES to accept a turn before the event stream has
// been subscribed — so posting first fails loudly here instead of hanging in
// production the way Phase 1 did.
function scripted(events: unknown[], opts: { closeAfterTurn?: boolean; log?: string[] } = {}) {
  const calls: Call[] = [];
  const enc = new TextEncoder();
  let streamOpened = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = {};
    for (const [k, v] of new Headers(init?.headers).entries()) headers[k] = v;
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : "", headers });
    opts.log?.push(`${method} ${url}`);

    if (method === "POST" && url.endsWith("/session")) {
      return Promise.resolve(new Response(JSON.stringify({ sessionId: "s-1", continuationToken: "s-1" }), { status: 200 }));
    }
    if (method === "GET" && url.includes("/stream")) {
      streamOpened = true;
      return Promise.resolve(
        new Response(new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } }), { status: 200 }),
      );
    }
    if (!streamOpened) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "turn posted before the stream was subscribed" }), { status: 500 }),
      );
    }
    for (const e of events) controller?.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
    if (opts.closeAfterTurn !== false) controller?.close();
    return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
  };

  return { fetchImpl, calls };
}

const BASE = "http://eve.test/plugins/trex/devx-agent/eve/v1/session";

function baseOpts(fetchImpl: typeof fetch, send: (f: DevxSseFrame) => void) {
  return { userId: "u-1", appId: "app-1", prompt: "review this app", send, fetchImpl, baseUrl: BASE };
}

const completedRun = [
  { type: "message.appended", data: { turnId: "t1", messageDelta: "Look", messageSoFar: "Look" } },
  {
    type: "actions.requested",
    data: { turnId: "t1", actions: [{ kind: "tool-call", callId: "c1", toolName: "Read", input: { path: "a.ts" } }] },
  },
  {
    type: "action.result",
    data: { turnId: "t1", result: { kind: "tool-result", callId: "c1", toolName: "Read", output: "ok" }, status: "completed" },
  },
  { type: "message.appended", data: { turnId: "t1", messageDelta: "ing", messageSoFar: "Looking" } },
  { type: "message.completed", data: { turnId: "t1", message: "Looking good", finishReason: "stop" } },
  { type: "turn.completed", data: { turnId: "t1", finishReason: "stop", usage: { inputTokens: 3 } } },
];

Deno.test("returns the turn's assembled text and finish reason", async () => {
  const frames: DevxSseFrame[] = [];
  const { fetchImpl } = scripted(completedRun);
  const result = await runOnEve(baseOpts(fetchImpl, (f) => frames.push(f)));

  assertEquals(result.content, "Looking good");
  assertEquals(result.finishReason, "stop");
  assertEquals(result.sessionId, "s-1");
  assertEquals(result.denials, []);
});

Deno.test("forwards every mappable event to send, in stream order", async () => {
  const frames: DevxSseFrame[] = [];
  const { fetchImpl } = scripted(completedRun);
  await runOnEve(baseOpts(fetchImpl, (f) => frames.push(f)));

  assertEquals(frames, [
    { type: "chunk", content: "Look" },
    { type: "tool_call_start", callId: "c1", name: "Read", args: { path: "a.ts" } },
    { type: "tool_call_end", callId: "c1", name: "Read", result: "ok", error: undefined },
    { type: "chunk", content: "ing" },
  ]);
});

Deno.test("subscribes to the event stream BEFORE posting the turn", async () => {
  const { fetchImpl, calls } = scripted(completedRun);
  await runOnEve(baseOpts(fetchImpl, () => {}));

  assertEquals(calls.map((c) => `${c.method} ${c.url}`), [
    `POST ${BASE}`,
    `GET ${BASE}/s-1/stream?startIndex=0`,
    `POST ${BASE}/s-1`,
  ]);
  // The session is created with NO message: the create route starts a turn the
  // moment one is present, which is the events-before-subscription hang.
  assertEquals("message" in JSON.parse(calls[0].body), false);
});

Deno.test("does not claim an approver on the session it creates", async () => {
  const { fetchImpl, calls } = scripted(completedRun);
  await runOnEve(baseOpts(fetchImpl, () => {}));

  const createBody = JSON.parse(calls[0].body);
  assertEquals("approverReachable" in createBody, false);
  assertEquals(createBody.unattended, true);
});

Deno.test("carries appId, mode and the skill context onto the turn — and the scope NOT at all", async () => {
  const { fetchImpl, calls } = scripted(completedRun);
  await runOnEve({
    ...baseOpts(fetchImpl, () => {}),
    mode: "ask" as const,
    skillContext: "You are a security reviewer.",
    allowedTools: ["Read", "Grep"],
    workspacePathOverride: "/w/run-1",
    sql: () => Promise.resolve({ rows: [{ id: "s-1" }] }),
  });

  const turn = JSON.parse(calls[2].body);
  assertEquals(turn.metadata.appId, "app-1");
  assertEquals(turn.metadata.mode, "ask");
  // The scope is enforced from the session ROW (V14). Sending it as turn
  // metadata too would give the same restriction a second, per-turn source.
  assertEquals("allowedTools" in turn.metadata, false);
  assertEquals("workspacePathOverride" in turn.metadata, false);
  assertStringIncludes(turn.message, "You are a security reviewer.");
  assertStringIncludes(turn.message, "review this app");
});

Deno.test("rejects on a mid-stream turn failure instead of resolving empty", async () => {
  const frames: DevxSseFrame[] = [];
  const { fetchImpl } = scripted([
    { type: "message.appended", data: { turnId: "t1", messageDelta: "partial", messageSoFar: "partial" } },
    { type: "turn.failed", data: { turnId: "t1", message: "model exploded" } },
  ]);
  const err = await assertRejects(() => runOnEve(baseOpts(fetchImpl, (f) => frames.push(f))));
  assertStringIncludes(String(err), "model exploded");
  assertEquals(frames, [{ type: "chunk", content: "partial" }]);
});

Deno.test("reports a hard-tier no-approver denial as an outcome, not a hang", async () => {
  const { fetchImpl } = scripted([
    {
      type: "action.result",
      data: {
        turnId: "t1",
        result: { kind: "tool-result", callId: "c9", toolName: "GitPush", output: { error: NO_APPROVER_ERROR } },
        status: "completed",
      },
    },
    { type: "message.completed", data: { turnId: "t1", message: "could not push", finishReason: "stop" } },
    { type: "turn.completed", data: { turnId: "t1", finishReason: "stop" } },
  ]);
  const result = await runOnEve(baseOpts(fetchImpl, () => {}));

  assertEquals(result.denials, [{ toolName: "GitPush", reason: NO_APPROVER_ERROR }]);
  assertEquals(result.content, "could not push");
});

Deno.test("fails fast when a turn parks on an approval nobody can answer", async () => {
  const { fetchImpl } = scripted([
    {
      type: "input.requested",
      data: { turnId: "t1", requests: [{ requestId: "r1", action: { kind: "tool-call", callId: "r1", toolName: "GitPush", input: {} } }] },
    },
  ], { closeAfterTurn: false });
  const err = await assertRejects(() => runOnEve(baseOpts(fetchImpl, () => {})));
  assertStringIncludes(String(err), "GitPush");
});

Deno.test("gives up on a stream that never reports a terminal event", async () => {
  const { fetchImpl } = scripted([
    { type: "message.appended", data: { turnId: "t1", messageDelta: "hi", messageSoFar: "hi" } },
  ], { closeAfterTurn: false });
  const err = await assertRejects(() => runOnEve({ ...baseOpts(fetchImpl, () => {}), timeoutMs: 25 }));
  assertStringIncludes(String(err), "timed out");
});

Deno.test("surfaces a create failure rather than starting a turn", async () => {
  const calls: string[] = [];
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    return Promise.resolve(new Response(JSON.stringify({ error: "nope" }), { status: 503 }));
  };
  const err = await assertRejects(() => runOnEve(baseOpts(fetchImpl, () => {})));
  assertStringIncludes(String(err), "503");
  assertEquals(calls.length, 1);
});

// ── The declared session scope (V14) ───────────────────────────────────────
// A fake db whose writes land in the SAME ordered log as the eve calls, so
// "written before the turn was posted" is asserted as an order, not merely as
// a value that happened to be present by the end.
function scriptedWithDb(events: unknown[], opts: { updated?: Record<string, unknown>[] } = {}) {
  const log: string[] = [];
  const updates: Array<{ query: string; params: unknown[] }> = [];
  const { fetchImpl, calls } = scripted(events, { log });
  // The scope UPDATE carries RETURNING id, so the default fake reports the one
  // row it matched; `updated: []` is the session that no longer exists.
  const sql = (query: string, params: unknown[] = []) => {
    log.push(`sql ${query.trim().split(/\s+/).slice(0, 3).join(" ")}`);
    updates.push({ query, params });
    return Promise.resolve({ rows: opts.updated ?? [{ id: "s-1" }] });
  };
  return { fetchImpl, calls, sql, log, updates };
}

Deno.test("writes the declared allowlist and workspace onto the session row BEFORE posting the turn", async () => {
  const { fetchImpl, sql, log, updates } = scriptedWithDb(completedRun);
  await runOnEve({
    ...baseOpts(fetchImpl, () => {}),
    allowedTools: ["Read", "Grep"],
    workspacePathOverride: "/w/u-1/app-1/.worktrees/run-1",
    sql,
  });

  assertEquals(log, [
    `POST ${BASE}`,
    "sql UPDATE agents.sessions SET",
    `GET ${BASE}/s-1/stream?startIndex=0`,
    `POST ${BASE}/s-1`,
  ]);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].params, [["Read", "Grep"], true, "/w/u-1/app-1/.worktrees/run-1", "s-1"]);
});

Deno.test("an EMPTY declared allowlist is a declaration of nothing, not the absence of one", async () => {
  const { fetchImpl, sql, updates } = scriptedWithDb(completedRun);
  await runOnEve({ ...baseOpts(fetchImpl, () => {}), allowedTools: [], sql });

  assertEquals(updates[0].params, [[], true, "", "s-1"]);
});

Deno.test("declares nothing when the caller declared nothing", async () => {
  const { fetchImpl, sql, updates, log } = scriptedWithDb(completedRun);
  await runOnEve({ ...baseOpts(fetchImpl, () => {}), sql });

  assertEquals(updates.length, 0);
  assertEquals(log.some((l) => l.startsWith("sql")), false);
});

// Whole-branch review must-fix 1: an explicit allowlist outranks deferral.
// filterTools runs before deferral (toolset.ts Step 4 then Step 6) and
// ToolSearch cannot recover a deferred tool inside the same turn, so the
// declared set is pre-activated on the row in that same statement — otherwise a
// QA review's six Browser* tools are dropped and it reports "no issues" from
// static reading alone.
Deno.test("pre-activates the declared allowlist so deferral cannot drop it inside the turn", async () => {
  const { fetchImpl, sql, updates } = scriptedWithDb(completedRun);
  await runOnEve({ ...baseOpts(fetchImpl, () => {}), allowedTools: ["Read", "BrowserNavigate"], sql });

  assertStringIncludes(updates[0].query, "activated_tools");
  // The same $1 the allowlist is written from: the two cannot drift.
  assertEquals(updates[0].params[0], ["Read", "BrowserNavigate"]);
});

Deno.test("declaring only a workspace leaves activated_tools alone", async () => {
  const { fetchImpl, sql, updates } = scriptedWithDb(completedRun);
  await runOnEve({ ...baseOpts(fetchImpl, () => {}), workspacePathOverride: "/w/u-1/app-1/.worktrees/run-1", sql });

  // No allowlist declared, so the CASE arm must not overwrite whatever
  // ToolSearch has activated on this session.
  assertEquals(updates[0].params[1], false);
  assertStringIncludes(updates[0].query, "ELSE activated_tools END");
});

// Zero rows is not an error to Postgres. Without the RETURNING check the turn
// posts unrestricted into the derived workspace: the ordering is proven, the
// effect is not.
Deno.test("refuses to start a turn whose declared scope matched no session row", async () => {
  const { fetchImpl, sql, calls } = scriptedWithDb(completedRun, { updated: [] });
  const err = await assertRejects(() => runOnEve({ ...baseOpts(fetchImpl, () => {}), allowedTools: ["Read"], sql }));
  assertStringIncludes(String(err), "matched no agents.sessions row");
  assertEquals(calls.length, 1);
});

Deno.test("refuses to start a turn whose declared scope it cannot write", async () => {
  const { fetchImpl, calls } = scripted(completedRun);
  const err = await assertRejects(() => runOnEve({ ...baseOpts(fetchImpl, () => {}), allowedTools: ["Read"] }));
  assertStringIncludes(String(err), "session row");
  // Nothing past the create: an unenforceable allowlist must not reach a turn.
  assertEquals(calls.length, 1);
});

// session_scope.ts's acceptDeclaredWorkspace round-trips the declared path
// through devx's own run-worktree generator for this user — an equality test on
// the exact string. So the declaration must reach the row VERBATIM: any
// normalising here (a trimmed slash, a resolved segment) would make a
// legitimate worktree fail that equality and silently fall back.
Deno.test("writes the declared workspace verbatim — the validator compares the exact string", async () => {
  const { fetchImpl, sql, updates } = scriptedWithDb(completedRun);
  const declared = "/w/u-1/app-1/.worktrees/run-1";
  await runOnEve({ ...baseOpts(fetchImpl, () => {}), workspacePathOverride: declared, sql });

  assertEquals(updates[0].params[2], declared);
});

Deno.test("sends the caller's bearer token on every eve call", async () => {
  const { fetchImpl, calls } = scripted(completedRun);
  await runOnEve({ ...baseOpts(fetchImpl, () => {}), bearerToken: "jwt-abc" });

  for (const c of calls) {
    assertEquals(c.headers.authorization, "Bearer jwt-abc");
    assertEquals(c.headers["x-user-id"], "u-1");
  }
});

Deno.test("bearerFromRequest reads the caller's Authorization header, and nothing else", () => {
  const h = (v: string | null) => new Request("http://x/", v === null ? undefined : { headers: { authorization: v } });
  assertEquals(bearerFromRequest(h("Bearer jwt-abc")), "jwt-abc");
  assertEquals(bearerFromRequest(h("bearer jwt-abc")), "jwt-abc");
  assertEquals(bearerFromRequest(h("Basic abc")), undefined);
  assertEquals(bearerFromRequest(h(null)), undefined);
});

// Whole-branch review must-fix 2: on the delegated (claude-code) path a
// declared tool with no SDK built-in and no MCP equivalent is never CALLED, so
// it produces no result of its own. sidecar_engine.ts publishes one carrying
// UNAVAILABLE_TOOL_ERROR; matching only NO_APPROVER_ERROR made a review that
// ran 3 of its 7 tools byte-identical to a clean one.
Deno.test("a declared tool the execution path cannot provide is a denial, not silence", async () => {
  const { fetchImpl } = scripted([
    {
      type: "action.result",
      data: {
        turnId: "t1",
        result: {
          kind: "tool-result",
          callId: "unavailable:t1:GitDiff",
          toolName: "GitDiff",
          output: { error: `GitDiff ${UNAVAILABLE_TOOL_ERROR} (claude-code)` },
        },
        status: "failed",
      },
    },
    { type: "message.completed", data: { turnId: "t1", message: "No issues found.", finishReason: "stop" } },
    { type: "turn.completed", data: { turnId: "t1", finishReason: "stop" } },
  ]);
  const result = await runOnEve(baseOpts(fetchImpl, () => {}));

  assertEquals(result.denials.map((d) => d.toolName), ["GitDiff"]);
  assertStringIncludes(String(denialSummary(result.denials)), "cannot provide every declared tool");
});

// An ordinary tool error is still not a denial — a review that hit one bad path
// must not be reported as having lost its declared toolset.
Deno.test("an ordinary tool failure is not counted as a denial", async () => {
  const { fetchImpl } = scripted([
    {
      type: "action.result",
      data: {
        turnId: "t1",
        result: { kind: "tool-result", callId: "c1", toolName: "Read", output: { error: "ENOENT: no such file" } },
        status: "failed",
      },
    },
    { type: "turn.completed", data: { turnId: "t1", finishReason: "stop" } },
  ]);
  const result = await runOnEve(baseOpts(fetchImpl, () => {}));
  assertEquals(result.denials, []);
});

Deno.test("denialSummary names the refused tools, and is null on a clean run", () => {
  assertEquals(denialSummary([]), null);
  const s = denialSummary([
    { toolName: "GitPush", reason: NO_APPROVER_ERROR },
    { toolName: "GitPush", reason: NO_APPROVER_ERROR },
    { toolName: "ExecuteSQL", reason: NO_APPROVER_ERROR },
  ]);
  assertStringIncludes(String(s), "GitPush");
  assertStringIncludes(String(s), "ExecuteSQL");
  assertStringIncludes(String(s), "no approver");
});
