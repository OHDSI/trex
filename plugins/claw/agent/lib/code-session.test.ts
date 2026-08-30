// plugins/claw/agent/lib/code-session.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { FakeTime } from "jsr:@std/testing/time";
import { runCodeTurn, CODE_BASE, type TokioClient } from "./code-session.ts";

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

// Records requests; returns queued responses in order.
function fakeClient(responses: Response[]) {
  const reqs: { url: string; init: any }[] = [];
  const client: TokioClient = {
    req(url, init) {
      reqs.push({ url, init });
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
  assertEquals(res.nextCursor, 3);
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
  assertEquals(res.nextCursor, 7);
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
  assertEquals(res.nextCursor, 2);
});

Deno.test("runCodeTurn stops reading at the terminal event and ignores trailing events", async () => {
  const create = new Response(JSON.stringify({ sessionId: "code-4" }), {
    headers: { "content-type": "application/json" },
  });
  // session.waiting is the terminal event; turn.started arrives after it in
  // the same stream (simulating a keep-alive tail that stays open). If the
  // reader kept draining instead of stopping at the terminal event, nextCursor
  // would count 3 events instead of 2.
  const stream = ndjsonChunks([
    '{"type":"message.completed","data":{"text":"DONE"}}\n' +
      '{"type":"session.waiting","data":{}}\n' +
      '{"type":"turn.started","data":{"turnId":"t2","sequence":99}}\n',
  ]);
  const { client } = fakeClient([create, stream]);

  const res = await runCodeTurn(client, {
    codeSessionId: null, message: "build X", startCursor: 10,
  });

  assertEquals(res.codeSessionId, "code-4");
  assertEquals(res.replyText, "DONE");
  assertEquals(res.nextCursor, 12);
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
