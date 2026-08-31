// plugins/claw/agent/lib/code-session.test.ts
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { attachCodeStream, CODE_BASE, reattachCodeTurn, resolveCodeApproval, runCodeTurn, type TokioClient } from "./code-session.ts";

function ndjson(...events: unknown[]): Response {
  const body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

// Builds a Response whose body is a real ReadableStream that enqueues each
// string in `chunks` as a separate chunk (separate reader.read() calls),
// so cross-chunk line buffering and early-stop behavior are actually exercised.
function ndjsonChunks(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}

// Builds a Response whose ReadableStream body stays open under an externally
// held controller, and records whether the reader was cancelled. ndjson()/
// ndjsonChunks() both close their body synchronously in `start()`, so neither
// can express a stream that goes quiet for a while — needed to drive the
// heartbeat/timeout with FakeTime instead of a real multi-minute wait.
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const state = { cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const response = new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
  return { response, get controller() { return controller; }, state };
}

// Records requests; returns queued responses in order. GET .../pending-approval
// is intercepted separately (and does NOT consume `responses`) since every
// consumeStream() call now issues one — see resultOrPendingGate in
// code-session.ts — and the vast majority of existing tests here have nothing
// to do with that query. Defaults to "nothing pending"; pass `pendingApproval`
// to simulate a gate the query itself discovers.
function fakeClient(responses: Response[], opts: { pendingApproval?: { requestId: string; tool: string } } = {}) {
  const reqs: { url: string; init: any }[] = [];
  const client: TokioClient = {
    req(url, init) {
      reqs.push({ url, init });
      if (url.includes("/pending-approval")) {
        return Promise.resolve(
          new Response(JSON.stringify({ pending: opts.pendingApproval ?? null }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(responses.shift()!);
    },
  };
  return { client, reqs };
}

Deno.test("runCodeTurn creates a session then streams the reply (no mode = full tools)", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-1", continuationToken: "code-1" }), {
    headers: { "content-type": "application/json" },
  });
  const stream = ndjson(
    { type: "turn.started", data: { turnId: "t1", sequence: 0 } },
    { type: "message.completed", data: { text: "PLAN: do the thing" } },
    { type: "session.waiting", data: { wait: "next-user-message" } },
  );
  const { client, reqs } = fakeClient([create, stream]);

  const res = await runCodeTurn(client, {
    codeSessionId: null, message: "build X", userId: "u1", startCursor: 0,
  });

  assertEquals(res.codeSessionId, "code-1");
  assertEquals(res.replyText, "PLAN: do the thing");
  assertEquals(res.restarted, undefined); // an ordinary create is not a restart
  // Only message.completed is replayable; turn.started/session.waiting are
  // live-only and must not move the cursor (see REPLAYABLE).
  assertEquals(res.nextCursor, 1);
  // create POST
  assertEquals(reqs[0].url, `${CODE_BASE}/eve/v1/session`);
  assertEquals(reqs[0].init.method, "POST");
  const body = JSON.parse(reqs[0].init.body);
  assertEquals(body.message, "build X");
  // No devx mode is sent — an unset mode means the Code agent gets its full
  // toolset (the only mode its superpowers skills/subagents are available in).
  assertEquals(body.metadata, undefined);
  assertEquals(reqs[0].init.headers["x-user-id"], "u1");
  // stream GET from startIndex 0
  assertEquals(reqs[1].url, `${CODE_BASE}/eve/v1/session/code-1/stream?startIndex=0`);
  assertEquals(reqs[1].init.method, "GET");
});

Deno.test("runCodeTurn sends metadata.appId on create AND continue when an app is chosen", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-1" }), {
    headers: { "content-type": "application/json" },
  });
  const stream1 = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client, reqs } = fakeClient([create, stream1]);
  await runCodeTurn(client, { codeSessionId: null, message: "build X", startCursor: 0, appId: "app-7" });
  assertEquals(JSON.parse(reqs[0].init.body).metadata, { appId: "app-7" });

  const cont = new Response(JSON.stringify({ accepted: true }), { status: 202 });
  const stream2 = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client: client2, reqs: reqs2 } = fakeClient([cont, stream2]);
  await runCodeTurn(client2, { codeSessionId: "code-1", message: "continue", startCursor: 2, appId: "app-7" });
  assertEquals(JSON.parse(reqs2[0].init.body).metadata, { appId: "app-7" });
});

Deno.test("runCodeTurn relays attachments as metadata.attachments, in devx's expected shape, on create AND continue", async () => {
  const attachments = [{ name: "shot.png", url: "https://cdn.example/shot.png", contentType: "image/png" }];

  const create = new Response(JSON.stringify({ sessionId: "code-1" }), {
    headers: { "content-type": "application/json" },
  });
  const stream1 = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client, reqs } = fakeClient([create, stream1]);
  await runCodeTurn(client, {
    codeSessionId: null, message: "build X", startCursor: 0, appId: "app-7", attachments,
  });
  // appId must still ride the turn alongside attachments, not be displaced by it.
  assertEquals(JSON.parse(reqs[0].init.body).metadata, { appId: "app-7", attachments });

  const cont = new Response(JSON.stringify({ accepted: true }), { status: 202 });
  const stream2 = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client: client2, reqs: reqs2 } = fakeClient([cont, stream2]);
  await runCodeTurn(client2, {
    codeSessionId: "code-1", message: "continue", startCursor: 2, appId: "app-7", attachments,
  });
  assertEquals(JSON.parse(reqs2[0].init.body).metadata, { appId: "app-7", attachments });
});

Deno.test("runCodeTurn sends no attachments key at all when there are none", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-1" }), {
    headers: { "content-type": "application/json" },
  });
  const stream = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client, reqs } = fakeClient([create, stream]);
  await runCodeTurn(client, { codeSessionId: null, message: "build X", startCursor: 0, appId: "app-7" });
  const metadata = JSON.parse(reqs[0].init.body).metadata;
  assertEquals("attachments" in metadata, false);
});

Deno.test("runCodeTurn continues an existing session with startCursor", async () => {
  const cont = new Response(JSON.stringify({ accepted: true }), {
    status: 202, headers: { "content-type": "application/json" },
  });
  const stream = ndjson(
    { type: "message.completed", data: { text: "done: 0 checks failing" } },
    { type: "session.waiting", data: { wait: "next-user-message" } },
  );
  const { client, reqs } = fakeClient([cont, stream]);

  const res = await runCodeTurn(client, {
    codeSessionId: "code-1", message: "implement it", startCursor: 5,
  });

  assertEquals(res.codeSessionId, "code-1");
  assertEquals(res.replyText, "done: 0 checks failing");
  assertEquals(res.nextCursor, 6); // 5 + the one replayable event (message.completed)
  assertEquals(reqs[0].url, `${CODE_BASE}/eve/v1/session/code-1`);
  assertEquals(reqs[1].url, `${CODE_BASE}/eve/v1/session/code-1/stream?startIndex=5`);
});

Deno.test("runCodeTurn throws on turn.failed", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-2" }), {
    headers: { "content-type": "application/json" },
  });
  const stream = ndjson({ type: "turn.failed", data: { turnId: "t1", message: "boom" } });
  const { client } = fakeClient([create, stream]);
  let threw = "";
  try {
    await runCodeTurn(client, { codeSessionId: null, message: "x", startCursor: 0 });
  } catch (e) { threw = (e as Error).message; }
  assertEquals(threw.includes("boom"), true);
});

Deno.test("runCodeTurn parses a JSON event line split across two stream chunks", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-3" }), {
    headers: { "content-type": "application/json" },
  });
  // The message.completed event's JSON is split mid-line across two chunks;
  // only the trailing chunk completes the line and adds the terminal event.
  const stream = ndjsonChunks([
    '{"type":"message.comp',
    'leted","data":{"text":"HELLO"}}\n{"type":"session.waiting","data":{}}\n',
  ]);
  const { client } = fakeClient([create, stream]);

  const res = await runCodeTurn(client, {
    codeSessionId: null, message: "build X", startCursor: 0,
  });

  assertEquals(res.codeSessionId, "code-3");
  assertEquals(res.replyText, "HELLO");
  assertEquals(res.nextCursor, 1);
});

Deno.test("runCodeTurn stops reading at the terminal event and ignores trailing events", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-4" }), {
    headers: { "content-type": "application/json" },
  });
  // session.waiting is the terminal event; a replayable action.result arrives
  // after it in the same stream (simulating a keep-alive tail that stays open).
  // If the reader kept draining instead of stopping at the terminal event,
  // nextCursor would count that second event too.
  const stream = ndjsonChunks([
    '{"type":"message.completed","data":{"text":"DONE"}}\n' +
      '{"type":"session.waiting","data":{}}\n' +
      '{"type":"action.result","data":{"turnId":"t2"}}\n',
  ]);
  const { client } = fakeClient([create, stream]);

  const res = await runCodeTurn(client, {
    codeSessionId: null, message: "build X", startCursor: 10,
  });

  assertEquals(res.codeSessionId, "code-4");
  assertEquals(res.replyText, "DONE");
  assertEquals(res.nextCursor, 11);
});

Deno.test("runCodeTurn throws on session.failed", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-5" }), {
    headers: { "content-type": "application/json" },
  });
  const stream = ndjson({ type: "session.failed", data: { message: "kaput" } });
  const { client } = fakeClient([create, stream]);
  let threw = "";
  try {
    await runCodeTurn(client, { codeSessionId: null, message: "x", startCursor: 0 });
  } catch (e) { threw = (e as Error).message; }
  assertEquals(threw.includes("kaput"), true);
});

// Timer wiring, mirroring code-stream.test.ts's heartbeat test: the beat is
// driven by a timer started when the stream opens, not by incoming events, so
// it must keep firing through a stretch with no events and stop the instant
// the turn returns.
Deno.test("runCodeTurn's heartbeat fires on its own timer while the stream is silent, and is cleared when the turn returns", async () => {
  const time = new FakeTime();
  try {
    const create = new Response(JSON.stringify({ sessionId: "code-6" }), {
      headers: { "content-type": "application/json" },
    });
    const { response: stream, controller } = openStream();
    const { client } = fakeClient([create, stream]);

    let beats = 0;
    const turn = runCodeTurn(client, {
      codeSessionId: null, message: "x", startCursor: 0, onHeartbeat: () => beats++,
    });

    // Two full heartbeat intervals pass with the stream open and no events
    // ever sent — an event-driven beat would never fire here.
    await time.tickAsync(300_000);
    await time.tickAsync(300_000);
    assertEquals(beats, 2);

    const enc = new TextEncoder();
    controller.enqueue(enc.encode(
      `${JSON.stringify({ type: "message.completed", data: { text: "done" } })}\n` +
        `${JSON.stringify({ type: "session.waiting", data: {} })}\n`,
    ));
    controller.close();
    const res = await turn;
    assertEquals(res.replyText, "done");

    // The finally block clears the interval once the turn returns; advancing
    // the clock further must not produce another beat.
    await time.tickAsync(300_000);
    assertEquals(beats, 2, "onHeartbeat must not fire after the turn has returned");
  } finally {
    time.restore();
  }
});

Deno.test("runCodeTurn rejects and cancels the reader when timeoutMs is exceeded", async () => {
  const time = new FakeTime();
  try {
    const create = new Response(JSON.stringify({ sessionId: "code-7" }), {
      headers: { "content-type": "application/json" },
    });
    const { response: stream, state } = openStream();
    const { client } = fakeClient([create, stream]);

    const turn = runCodeTurn(client, {
      codeSessionId: null, message: "x", startCursor: 0, timeoutMs: 10_000,
    });
    // Swallow the eventual rejection so it isn't reported as an unhandled
    // rejection while the clock is advanced below.
    turn.catch(() => {});

    await time.tickAsync(10_000);

    let threw = "";
    try {
      await turn;
    } catch (e) {
      threw = (e as Error).message;
    }
    // Let the pipeThrough machinery's internal pipe promises settle (they
    // resolve via microtasks driven off the same fake clock).
    await time.tickAsync(0);
    await time.tickAsync(0);
    assert(threw.toLowerCase().includes("timeout") || threw.toLowerCase().includes("timed out"), threw);
    assert(threw.includes("10000") || threw.includes("10 000") || threw.includes("10s"), threw);
    assertEquals(state.cancelled, true, "the stream must be actively cancelled, not merely abandoned");
  } finally {
    time.restore();
  }
});

// --- approval gates: input.requested, terminal reason, re-attach ------------

Deno.test("runCodeTurn surfaces an input.requested gate instead of waiting on it, in toolset.ts's emitted shape", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-8" }), {
    headers: { "content-type": "application/json" },
  });
  // Exactly what toolset.ts emits: { turnId, requests: [{ requestId, action:
  // { kind, callId, toolName, input } }] }.
  const stream = ndjson(
    { type: "turn.started", data: { turnId: "t1", sequence: 0 } },
    {
      type: "input.requested",
      data: {
        turnId: "t1",
        requests: [{
          requestId: "req-1",
          action: { kind: "tool-call", callId: "req-1", toolName: "runCommand", input: { cmd: "rm -rf build" } },
        }],
      },
    },
  );
  const { client } = fakeClient([create, stream]);

  const res = await runCodeTurn(client, { codeSessionId: null, message: "clean up", startCursor: 0 });

  assertEquals(res.reason, "input-requested");
  assertEquals(res.pending, [{ requestId: "req-1", toolName: "runCommand", input: { cmd: "rm -rf build" } }]);
  // Neither turn.started nor input.requested is persisted, so neither advances
  // the cursor — the re-attach must resume at the same index.
  assertEquals(res.nextCursor, 0);
});

Deno.test("runCodeTurn reports which terminal state it hit — completed vs waiting vs parked", async () => {
  const mk = (terminal: unknown) => {
    const create = new Response(JSON.stringify({ sessionId: "code-9" }), {
      headers: { "content-type": "application/json" },
    });
    return fakeClient([create, ndjson({ type: "message.completed", data: { text: "ok" } }, terminal)]);
  };

  const done = await runCodeTurn(mk({ type: "turn.completed", data: { turnId: "t1" } }).client, {
    codeSessionId: null,
    message: "x",
    startCursor: 0,
  });
  assertEquals(done.reason, "completed");
  assertEquals(done.pending, []);

  const waiting = await runCodeTurn(mk({ type: "session.waiting", data: { wait: "next-user-message" } }).client, {
    codeSessionId: null,
    message: "x",
    startCursor: 0,
  });
  assertEquals(waiting.reason, "waiting");

  const parkedEvent = {
    type: "input.requested",
    data: { turnId: "t1", requests: [{ requestId: "r", action: { toolName: "t" } }] },
  };
  const parked = await runCodeTurn(mk(parkedEvent).client, { codeSessionId: null, message: "x", startCursor: 0 });
  assertEquals(parked.reason, "input-requested");
  // A caller can always tell the parked case from the finished ones.
  assert(parked.reason !== done.reason && parked.reason !== waiting.reason);
});

Deno.test("a parked turn's cursor carries into the re-attach: monotonic, and only the remainder is counted", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-10" }), {
    headers: { "content-type": "application/json" },
  });
  const parkStream = ndjson(
    { type: "turn.started", data: { turnId: "t1", sequence: 0 } },
    { type: "message.completed", data: { text: "about to run it" } },
    {
      type: "input.requested",
      data: { turnId: "t1", requests: [{ requestId: "req-1", action: { toolName: "runCommand", input: {} } }] },
    },
  );
  const { client, reqs } = fakeClient([create, parkStream]);
  const parked = await runCodeTurn(client, { codeSessionId: null, message: "go", startCursor: 0 });
  assertEquals(parked.reason, "input-requested");
  // One replayable event before the gate (message.completed).
  assertEquals(parked.nextCursor, 1);

  // The remainder of the SAME turn, from the cursor the park reported.
  const restStream = ndjson(
    { type: "action.result", data: { turnId: "t1" } },
    { type: "message.completed", data: { text: "done" } },
    { type: "turn.completed", data: { turnId: "t1" } },
  );
  const { client: c2, reqs: reqs2 } = fakeClient([restStream]);
  const rest = await reattachCodeTurn(c2, { codeSessionId: parked.codeSessionId, startCursor: parked.nextCursor });

  assertEquals(reqs2[0].url, `${CODE_BASE}/eve/v1/session/code-10/stream?startIndex=1`);
  assertEquals(reqs2[0].init.method, "GET");
  // No fresh message: a re-attach must never start a second turn. The second
  // request is consumeStream's own pending-approval query (resultOrPendingGate),
  // issued before the first read — not a message, and not counted by REPLAYABLE.
  assertEquals(reqs2.length, 2);
  assertEquals(reqs2[1].url, `${CODE_BASE}/eve/v1/session/code-10/pending-approval`);
  assertEquals(rest.reason, "completed");
  assertEquals(rest.replyText, "done");
  // Monotonic, and counting ONLY the three replayable events not already seen.
  assert(rest.nextCursor > parked.nextCursor, `${rest.nextCursor} must exceed ${parked.nextCursor}`);
  assertEquals(rest.nextCursor, parked.nextCursor + 3);
  // The first attach really did start at 0, so the re-attach skipped it rather
  // than replaying it.
  assertEquals(reqs[1].url.endsWith("startIndex=0"), true);
});

Deno.test("a re-attach that finds the turn still parked returns rather than spinning", async () => {
  const stream = ndjson({
    type: "input.requested",
    data: { turnId: "t1", requests: [{ requestId: "req-2", action: { toolName: "writeFile", input: { path: "a" } } }] },
  });
  const { client } = fakeClient([stream]);
  const res = await reattachCodeTurn(client, { codeSessionId: "code-11", startCursor: 4 });
  assertEquals(res.reason, "input-requested");
  assertEquals(res.pending.map((p) => p.requestId), ["req-2"]);
  assertEquals(res.nextCursor, 4); // input.requested is live-only: the cursor stands still
});

// The bug this pins: input.requested is live-only, so a re-attach that opens
// AFTER a gate was published sees nothing on the stream and used to block
// until timeoutMs (90 minutes — see DEFAULT_TIMEOUT_MS). openStream() never
// enqueues or closes, so if resultOrPendingGate's check did not run before the
// first read, this test would hang rather than resolve.
Deno.test("a re-attach to a turn parked on a gate it never saw live renders that gate instead of blocking on the stream", async () => {
  const { response: stream, state } = openStream();
  const gate = { requestId: "req-9", tool: "runCommand" };
  const { client, reqs } = fakeClient([stream], { pendingApproval: gate });

  const res = await reattachCodeTurn(client, { codeSessionId: "code-20", startCursor: 3 });

  assertEquals(res.reason, "input-requested");
  assertEquals(res.pending, [{ requestId: "req-9", toolName: "runCommand", input: undefined }]);
  // Nothing was ever read from the stream — the cursor stands still, and the
  // never-used reader is released rather than left open.
  assertEquals(res.nextCursor, 3);
  assertEquals(state.cancelled, true);
  assertEquals(reqs[1].url, `${CODE_BASE}/eve/v1/session/code-20/pending-approval`);
});

// The dedup guarantee: a gate that is BOTH sitting live on the stream AND
// visible to the pending-approval query must still surface exactly once.
// resultOrPendingGate runs before the first read, so when it finds something
// it returns immediately — the live event for that same requestId is never
// even reached, by construction, not by filtering it out after the fact.
Deno.test("a gate visible on the stream AND via the pending-approval query still surfaces exactly once", async () => {
  const stream = ndjson({
    type: "input.requested",
    data: { turnId: "t1", requests: [{ requestId: "req-9", action: { toolName: "runCommand", input: {} } }] },
  });
  const gate = { requestId: "req-9", tool: "runCommand" };
  const { client } = fakeClient([stream], { pendingApproval: gate });

  const res = await reattachCodeTurn(client, { codeSessionId: "code-21", startCursor: 0 });

  assertEquals(res.reason, "input-requested");
  assertEquals(res.pending.length, 1);
  assertEquals(res.pending[0].requestId, "req-9");
});

Deno.test("resolveCodeApproval posts the decision to the approval route and reports success", async () => {
  const { client, reqs } = fakeClient([new Response(JSON.stringify({ resolved: true }), { status: 200 })]);
  const out = await resolveCodeApproval(client, {
    codeSessionId: "code-12",
    requestId: "req-1",
    decision: "approve",
    userId: "u1",
  });
  assertEquals(out, { resolved: true });
  assertEquals(reqs[0].url, `${CODE_BASE}/eve/v1/session/code-12/approval`);
  assertEquals(reqs[0].init.method, "POST");
  assertEquals(JSON.parse(reqs[0].init.body), { requestId: "req-1", decision: "approve" });
  assertEquals(reqs[0].init.headers["x-user-id"], "u1");
});

Deno.test("resolveCodeApproval reports a refused/expired request instead of throwing", async () => {
  const { client } = fakeClient([
    new Response(JSON.stringify({ error: "unknown or already-decided request" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const out = await resolveCodeApproval(client, { codeSessionId: "code-13", requestId: "req-9", decision: "deny" });
  assertEquals(out.resolved, false);
  assert(out.error?.includes("404"), out.error);
  assert(out.error?.includes("already-decided"), out.error);
});

// The bug this pins: message.appended is emitted PER TOKEN DELTA
// (runner.ts:395) and has no stepToEvent mapping, so counting it made the
// cursor run hundreds ahead of the server's index and slice(startIndex)
// returned nothing on every re-attach — replay was not "skipping what was seen",
// it was off entirely.
Deno.test("nextCursor counts only replayable events — a turn of token deltas advances it by two, not by hundreds", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-14" }), {
    headers: { "content-type": "application/json" },
  });
  const deltas = Array.from({ length: 200 }, (_, i) => ({
    type: "message.appended",
    data: { turnId: "t1", messageDelta: "x", messageSoFar: "x".repeat(i + 1) },
  }));
  const stream = ndjson(
    { type: "turn.started", data: { turnId: "t1", sequence: 0 } },
    ...deltas,
    { type: "message.completed", data: { text: "done" } },
    { type: "turn.completed", data: { turnId: "t1" } },
  );
  const { client } = fakeClient([create, stream]);

  const res = await runCodeTurn(client, { codeSessionId: null, message: "x", startCursor: 0 });

  // text -> message.completed and finish -> turn.completed are the only two
  // persisted steps this turn produced.
  assertEquals(res.nextCursor, 2);
  assertEquals(res.replyText, "done");
});

Deno.test("every replayable kind advances the cursor, and no live-only kind does", async () => {
  const replayable = ndjson(
    { type: "actions.requested", data: { turnId: "t1", actions: [] } },
    { type: "action.result", data: { turnId: "t1" } },
    { type: "tool.event", data: { name: "n", payload: {} } },
    { type: "message.completed", data: { text: "done" } },
    { type: "turn.completed", data: { turnId: "t1" } },
  );
  const counted = await reattachCodeTurn(fakeClient([replayable]).client, { codeSessionId: "c", startCursor: 0 });
  assertEquals(counted.nextCursor, 5);

  const liveOnly = ndjson(
    { type: "turn.started", data: { turnId: "t1", sequence: 0 } },
    { type: "message.appended", data: { turnId: "t1", messageDelta: "a" } },
    { type: "message.queued", data: {} },
    { type: "session.waiting", data: {} },
  );
  const ignored = await reattachCodeTurn(fakeClient([liveOnly]).client, { codeSessionId: "c", startCursor: 9 });
  assertEquals(ignored.nextCursor, 9);
});

// attachCodeStream is split out precisely so a caller can subscribe before it
// causes the events it needs; the GET must have happened by the time it returns.
Deno.test("attachCodeStream issues the stream GET before collect() is ever called", async () => {
  const stream = ndjson(
    { type: "message.completed", data: { text: "done" } },
    { type: "turn.completed", data: { turnId: "t1" } },
  );
  const { client, reqs } = fakeClient([stream]);

  const attached = await attachCodeStream(client, { codeSessionId: "code-15", startCursor: 4 });
  // Subscribed already — nothing has been read yet.
  assertEquals(reqs.length, 1);
  assertEquals(reqs[0].url, `${CODE_BASE}/eve/v1/session/code-15/stream?startIndex=4`);
  assertEquals(reqs[0].init.method, "GET");

  const res = await attached.collect();
  assertEquals(res.replyText, "done");
  assertEquals(res.nextCursor, 6);
});

// Claw WATCHES the coder session and relays its gates to the channel
// (postApprovalGates posts them, resolveCoderApproval carries the answer
// back), but the session is neither channel-bound nor unattended. Without this
// flag eve's hard escalate tier reads it as unapprovable and the ship step's
// `git push` is denied outright instead of being asked — see
// core/server/agents/service/approval-policy.ts.
Deno.test("runCodeTurn declares a reachable approver on create, and only on create", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-1" }), {
    headers: { "content-type": "application/json" },
  });
  const stream1 = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client, reqs } = fakeClient([create, stream1]);
  await runCodeTurn(client, { codeSessionId: null, message: "ship it", startCursor: 0 });
  assertEquals(JSON.parse(reqs[0].init.body).approverReachable, true);

  // The continue POST must not carry it: handler.ts reads it once, at
  // createSession, and a per-turn flag that looks like it widens a gate
  // invites someone to start honouring it.
  const cont = new Response(JSON.stringify({ accepted: true }), { status: 202 });
  const stream2 = ndjson(
    { type: "message.completed", data: { text: "ok" } },
    { type: "session.waiting", data: {} },
  );
  const { client: client2, reqs: reqs2 } = fakeClient([cont, stream2]);
  await runCodeTurn(client2, { codeSessionId: "code-1", message: "again", startCursor: 2 });
  assertEquals(JSON.parse(reqs2[0].init.body).approverReachable, undefined);
});

// A stored id the server no longer knows — a devx chat id written before claw
// moved to eve, a pruned session, a restored database. The thread must not
// strand on it.
Deno.test("a continue that 404s opens a fresh session once, from cursor 0", async () => {
  const gone = new Response(JSON.stringify({ error: "session not found" }), { status: 404 });
  const create = new Response(JSON.stringify({ sessionId: "code-new" }), {
    headers: { "content-type": "application/json" },
  });
  const stream = ndjson(
    { type: "message.completed", data: { text: "picked it up" } },
    { type: "turn.completed", data: {} },
  );
  const { client, reqs } = fakeClient([gone, create, stream]);

  const res = await runCodeTurn(client, {
    codeSessionId: "devx-chat-id", message: "carry on", userId: "u1", startCursor: 5,
  });

  assertEquals(res.codeSessionId, "code-new");
  assertEquals(res.replyText, "picked it up");
  // Flagged so askCore can tell the channel the coder lost this thread.
  assertEquals(res.restarted, true);
  // The fresh session has no history: the cursor restarts with it, and the
  // stream must be attached at 0, not at the dead session's 5.
  assertEquals(res.nextCursor, 2);
  assert(reqs[1].url.endsWith("/eve/v1/session"), "expected a session create after the 404");
  assertEquals(JSON.parse(reqs[1].init.body).approverReachable, true);
  assert(reqs[2].url.includes("startIndex=0"), `streamed from the wrong index: ${reqs[2].url}`);
});

Deno.test("a second failure after the 404 re-create is a real error, not another retry", async () => {
  const gone = new Response(JSON.stringify({ error: "session not found" }), { status: 404 });
  const createFailed = new Response("nope", { status: 500 });
  const { client } = fakeClient([gone, createFailed]);
  await assertRejects(
    () => runCodeTurn(client, { codeSessionId: "stale", message: "go", startCursor: 1 }),
    Error,
    "code create failed: 500",
  );
});

Deno.test("a non-404 continue failure still fails the turn — only a gone session self-heals", async () => {
  const boom = new Response("upstream exploded", { status: 500 });
  const { client } = fakeClient([boom]);
  await assertRejects(
    () => runCodeTurn(client, { codeSessionId: "code-1", message: "go", startCursor: 1 }),
    Error,
    "code continue failed: 500",
  );
});
