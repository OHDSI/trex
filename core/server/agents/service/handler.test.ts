import { assert, assertEquals } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { createHandler } from "./handler.ts";
import { loadAgent } from "../loader.ts";
import { createStore } from "./store.ts";

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "http://local/plugins/trex/toy";

function inMemoryQuery() {
  // Minimal in-memory impl of the SQL the store issues, keyed by table.
  const sessions = new Map<string, { status: string }>();
  const turns: Array<{ id: string; session_id: string; seq: number }> = [];
  const steps: Array<{ turn_id: string; seq: number; kind: string; name: string | null; payload: unknown }> = [];
  let n = 0;
  return (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO agents.sessions")) {
      const id = `s-${++n}`;
      sessions.set(id, { status: "active" });
      return Promise.resolve({ rows: [{ id }] });
    }
    if (sql.includes("SELECT id, status FROM agents.sessions")) {
      const s = sessions.get(params[0] as string);
      return Promise.resolve({ rows: s ? [{ id: params[0], status: s.status }] : [] });
    }
    if (sql.includes("INSERT INTO agents.turns")) {
      const seq = turns.filter((t) => t.session_id === params[0]).length + 1;
      const t = { id: `t-${++n}`, session_id: params[0] as string, seq };
      turns.push(t);
      return Promise.resolve({ rows: [{ id: t.id, seq }] });
    }
    if (sql.includes("INSERT INTO agents.steps")) {
      steps.push({ turn_id: params[0] as string, seq: params[1] as number, kind: params[2] as string, name: params[3] as string | null, payload: params[4] });
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("FROM agents.steps")) {
      const sid = params[0] as string;
      const rows = steps
        .filter((s) => turns.some((t) => t.id === s.turn_id && t.session_id === sid))
        .map((s) => ({ kind: s.kind, name: s.name, payload: s.payload }));
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  };
}

// See runner.test.ts's FINISH/sequencedModel comment: ai@6's raw doStream
// "finish" chunk nests usage under inputTokens.total/outputTokens.total and
// finishReason under {unified, raw} (was flat in the v2 shape the brief was
// drafted against); doStream itself must return a Promise, not a bare
// object. `chunks` is typed `any[]` (matching runner.test.ts's
// `sequencedModel` precedent) so the literal isn't structurally checked
// against the full LanguageModelV3StreamPart union field-by-field.
function model(text: string) {
  // deno-lint-ignore no-explicit-any
  const chunks: any[] = [
    { type: "text-start", id: "1" },
    { type: "text-delta", id: "1", delta: text },
    { type: "text-end", id: "1" },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1 }, outputTokens: { total: 2 } },
    },
  ];
  return new MockLanguageModelV3({
    doStream: () => Promise.resolve({ stream: simulateReadableStream({ chunks }) }),
  });
}

async function makeHandler() {
  const agent = await loadAgent(TOY);
  return createHandler({
    agent, store: createStore(inMemoryQuery() as never),
    plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: model("hello from toy"),
  });
}

Deno.test("POST /eve/v1/session creates a session and returns the id header", async () => {
  const handler = await makeHandler();
  const res = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  assertEquals(res.status, 200);
  const sid = res.headers.get("x-eve-session-id");
  assert(sid);
  const body = await res.json();
  assertEquals(body.sessionId, sid);
  // The response returns before the fire-and-forget turn resolves (that's
  // the point of the async start), but the mock model's simulated stream
  // still schedules real setTimeout(...,0) timers per chunk internally
  // (ai@6's simulateReadableStream default delay). If this test function
  // returns before those settle, Deno's leak sanitizer flags a timer that
  // "completes during" a later test. Draining that background work here
  // (rather than disabling sanitizeOps/sanitizeResources) keeps the
  // sanitizer defaults meaningful instead of silencing them.
  await new Promise((r) => setTimeout(r, 200));
});

Deno.test("GET /stream replays persisted events as SSE after the turn ran", async () => {
  const handler = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await new Promise((r) => setTimeout(r, 200)); // let the async turn finish (mock model is instant)
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  assertEquals(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  assert(text.includes('"finish"') || text.includes("turn-finish"));
});

Deno.test("unknown session 404s; unknown route 404s; healthz lists tools", async () => {
  const handler = await makeHandler();
  assertEquals((await handler(new Request(`${BASE}/eve/v1/session/nope/stream`))).status, 404);
  assertEquals((await handler(new Request(`${BASE}/bogus`))).status, 404);
  const health = await (await handler(new Request(`${BASE}/healthz`))).json();
  assertEquals(health.tools.sort(), ["echo", "propose_card"]);
});

Deno.test("POST /chat returns a UIMessage stream", async () => {
  const handler = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  assertEquals(res.status, 200);
  assert((res.headers.get("content-type") || "").includes("text/event-stream"));
  const body = await res.text();
  assert(body.length > 0);
});
