// plugins/claw/agent/lib/code-session.test.ts
import { assertEquals } from "jsr:@std/assert";
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

Deno.test("runCodeTurn creates a session then streams the reply", async () => {
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
    codeSessionId: null, message: "build X", mode: "plan", userId: "u1", startCursor: 0,
  });

  assertEquals(res.codeSessionId, "code-1");
  assertEquals(res.replyText, "PLAN: do the thing");
  assertEquals(res.nextCursor, 3);
  // create POST
  assertEquals(reqs[0].url, `${CODE_BASE}/eve/v1/session`);
  assertEquals(reqs[0].init.method, "POST");
  assertEquals(JSON.parse(reqs[0].init.body).metadata.mode, "plan");
  assertEquals(reqs[0].init.headers["x-user-id"], "u1");
  // stream GET from startIndex 0
  assertEquals(reqs[1].url, `${CODE_BASE}/eve/v1/session/code-1/stream?startIndex=0`);
  assertEquals(reqs[1].init.method, "GET");
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
    codeSessionId: "code-1", message: "implement it", mode: "build", startCursor: 5,
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
    await runCodeTurn(client, { codeSessionId: null, message: "x", mode: "plan", startCursor: 0 });
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
    codeSessionId: null, message: "build X", mode: "plan", startCursor: 0,
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
    codeSessionId: null, message: "build X", mode: "plan", startCursor: 10,
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
    await runCodeTurn(client, { codeSessionId: null, message: "x", mode: "plan", startCursor: 0 });
  } catch (e) { threw = (e as Error).message; }
  assertEquals(threw.includes("kaput"), true);
});
