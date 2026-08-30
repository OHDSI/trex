// deno test --no-check --allow-all plugins/devx/functions/lib/eve_run.test.ts
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import type { DevxSseFrame } from "./eve_sse.ts";
import { NO_APPROVER_ERROR, runOnEve } from "./eve_run.ts";

interface Call {
  url: string;
  method: string;
  body: string;
}

// A fake eve seam that REFUSES to accept a turn before the event stream has
// been subscribed — so posting first fails loudly here instead of hanging in
// production the way Phase 1 did.
function scripted(events: unknown[], opts: { closeAfterTurn?: boolean } = {}) {
  const calls: Call[] = [];
  const enc = new TextEncoder();
  let streamOpened = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : "" });

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

Deno.test("carries appId, mode and the skill context onto the turn", async () => {
  const { fetchImpl, calls } = scripted(completedRun);
  await runOnEve({
    ...baseOpts(fetchImpl, () => {}),
    mode: "ask" as const,
    skillContext: "You are a security reviewer.",
    allowedTools: ["Read", "Grep"],
    workspacePathOverride: "/w/run-1",
  });

  const turn = JSON.parse(calls[2].body);
  assertEquals(turn.metadata.appId, "app-1");
  assertEquals(turn.metadata.mode, "ask");
  assertEquals(turn.metadata.allowedTools, ["Read", "Grep"]);
  assertEquals(turn.metadata.workspacePathOverride, "/w/run-1");
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
