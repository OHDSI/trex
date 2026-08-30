// deno test --no-check --allow-all plugins/devx/functions/lib/agent_run.test.ts
//
// The autonomous-run seam (index.ts's /agent-runs/:id/start). Extracted from
// the route so the migration off streamAgentChat/streamClaudeCodeChat is
// testable at all — the route body lives inside Deno.serve and cannot be
// imported.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { NO_APPROVER_ERROR } from "./eve_run.ts";
import { buildRunPrompt, isPlanRun, runAgentRunOnEve } from "./agent_run.ts";

const BASE = "http://eve.test/plugins/trex/devx-agent/eve/v1/session";

interface Call {
  url: string;
  method: string;
  body: string;
}

function scripted(events: unknown[]) {
  const calls: Call[] = [];
  const log: string[] = [];
  const updates: Array<{ query: string; params: unknown[] }> = [];
  const enc = new TextEncoder();
  let streamOpened = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : "" });
    log.push(`${method} ${url}`);

    if (method === "POST" && url.endsWith("/session")) {
      return Promise.resolve(new Response(JSON.stringify({ sessionId: "s-1" }), { status: 200 }));
    }
    if (method === "GET" && url.includes("/stream")) {
      streamOpened = true;
      return Promise.resolve(
        new Response(new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } }), { status: 200 }),
      );
    }
    if (!streamOpened) {
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    for (const e of events) controller?.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
    controller?.close();
    return Promise.resolve(new Response("{}", { status: 202 }));
  };

  const sql = (query: string, params: unknown[] = []) => {
    log.push(`sql ${query.trim().split(/\s+/).slice(0, 3).join(" ")}`);
    updates.push({ query, params });
    return Promise.resolve({ rows: [] });
  };

  return { fetchImpl, sql, calls, log, updates };
}

const completed = (text: string) => [
  { type: "message.completed", data: { turnId: "t1", message: text, finishReason: "stop" } },
  { type: "turn.completed", data: { turnId: "t1", finishReason: "stop" } },
];

const PLAN_RUN = { run_kind: "agent", plan_id: "p-1", task: "Add a settings page", app_id: "app-1" };
const PLAIN_RUN = { run_kind: "agent", plan_id: null, task: "Audit the router", app_id: "app-1" };

Deno.test("isPlanRun: only an agent run carrying a plan", () => {
  assertEquals(isPlanRun(PLAN_RUN), true);
  assertEquals(isPlanRun(PLAIN_RUN), false);
  assertEquals(isPlanRun({ run_kind: "subagent", plan_id: "p-1" }), false);
});

Deno.test("buildRunPrompt: a plan run pre-decides subagent-driven execution; a plain run does not", () => {
  const plan = buildRunPrompt(PLAN_RUN);
  assertStringIncludes(plan, "subagent-driven-development");
  assertStringIncludes(plan, "Add a settings page");

  const plain = buildRunPrompt(PLAIN_RUN);
  assertStringIncludes(plain, "Audit the router");
  assertEquals(plain.includes("subagent-driven-development"), false);
});

Deno.test("an autonomous run completes on eve and returns its final text", async () => {
  const { fetchImpl, sql, calls } = scripted(completed("Audited: 3 routes."));
  const frames: unknown[] = [];
  const result = await runAgentRunOnEve({
    userId: "u-1",
    run: PLAIN_RUN,
    send: (f) => frames.push(f),
    sql,
    fetchImpl,
    baseUrl: BASE,
  });

  assertEquals(result.content, "Audited: 3 routes.");
  assertEquals(result.finishReason, "stop");
  assertEquals(result.denials, []);
  assertStringIncludes(JSON.parse(calls[2].body).message, "Audit the router");
});

// resolveEngine (agent/lib/resolve_engine.test.ts) hands a claude-code
// account's turn to the sidecar engine off the provider row alone. So this
// seam must NOT branch on the provider — it takes none, and the traffic a
// claude-code plan run produces is byte-identical to any other provider's.
// Whether the DELEGATED path then honours the declared scope is enforced in
// sidecar_engine.ts and covered by its own tests, not here.
Deno.test("a plan run reaches eve through the one seam, with no provider special case", async () => {
  const a = scripted(completed("done"));
  await runAgentRunOnEve({
    userId: "u-1",
    run: PLAN_RUN,
    skillContext: "Skill body",
    send: () => {},
    sql: a.sql,
    fetchImpl: a.fetchImpl,
    baseUrl: BASE,
  });

  assertEquals(a.log, [
    `POST ${BASE}`,
    `GET ${BASE}/s-1/stream?startIndex=0`,
    `POST ${BASE}/s-1`,
  ]);
  const turn = JSON.parse(a.calls[2].body);
  assertStringIncludes(turn.message, "Skill body");
  assertStringIncludes(turn.message, "subagent-driven-development");
  // The session is unattended and claims no approver: hard-tier tools deny
  // rather than park on a gate nobody is watching.
  const create = JSON.parse(a.calls[0].body);
  assertEquals(create.unattended, true);
  assertEquals("approverReachable" in create, false);
});

Deno.test("a plan run's isolated worktree and allowlist are on the session row BEFORE the turn", async () => {
  const { fetchImpl, sql, log, updates } = scripted(completed("done"));
  await runAgentRunOnEve({
    userId: "u-1",
    run: PLAN_RUN,
    allowedTools: ["Read", "Write"],
    workspacePathOverride: "/w/u-1/app-1/.worktrees/run-1",
    send: () => {},
    sql,
    fetchImpl,
    baseUrl: BASE,
  });

  assertEquals(log, [
    `POST ${BASE}`,
    "sql UPDATE agents.sessions SET",
    `GET ${BASE}/s-1/stream?startIndex=0`,
    `POST ${BASE}/s-1`,
  ]);
  assertEquals(updates[0].params, [["Read", "Write"], true, "/w/u-1/app-1/.worktrees/run-1", "s-1"]);
});

Deno.test("a hard-tier tool denied for want of an approver completes the run and is reported", async () => {
  const { fetchImpl, sql } = scripted([
    {
      type: "action.result",
      data: {
        turnId: "t1",
        result: { kind: "tool-result", callId: "c1", toolName: "GitPush", output: { error: NO_APPROVER_ERROR } },
        status: "completed",
      },
    },
    ...completed("Implemented, but could not push."),
  ]);
  const result = await runAgentRunOnEve({
    userId: "u-1",
    run: PLAN_RUN,
    send: () => {},
    sql,
    fetchImpl,
    baseUrl: BASE,
  });

  assertEquals(result.finishReason, "stop");
  assertEquals(result.denials, [{ toolName: "GitPush", reason: NO_APPROVER_ERROR }]);
});
