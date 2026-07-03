import { assert, assertEquals } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { createHandler } from "./handler.ts";
import { loadAgent } from "../loader.ts";
import type { LoadedAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import { subscribe } from "./stream.ts";
import type { AgentEvent } from "./events.ts";

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "http://local/plugins/trex/toy";

function inMemoryDb() {
  // Minimal in-memory impl of the SQL the store issues, keyed by table.
  // Exposed state (turns/steps/approvals) lets tests assert on persistence
  // and drive approval decisions without Postgres.
  const sessions = new Map<string, { status: string }>();
  const turns: Array<{ id: string; session_id: string; seq: number; status: string; error: string | null }> = [];
  const steps: Array<{ turn_id: string; seq: number; kind: string; name: string | null; payload: unknown; usage: unknown }> = [];
  const approvals = new Map<string, { decision: string | null }>();
  let n = 0;
  const query = (sql: string, params: unknown[] = []) => {
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
      const t = { id: `t-${++n}`, session_id: params[0] as string, seq, status: "running", error: null };
      turns.push(t);
      return Promise.resolve({ rows: [{ id: t.id, seq }] });
    }
    if (sql.includes("UPDATE agents.turns")) {
      const t = turns.find((t) => t.id === params[0]);
      if (t) {
        t.status = params[1] as string;
        t.error = (params[2] as string | null) ?? null;
      }
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("INSERT INTO agents.steps")) {
      steps.push({
        turn_id: params[0] as string, seq: params[1] as number, kind: params[2] as string,
        name: params[3] as string | null, payload: params[4], usage: params[5],
      });
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("INSERT INTO agents.approvals")) {
      const id = `r-${++n}`;
      approvals.set(id, { decision: null });
      return Promise.resolve({ rows: [{ request_id: id }] });
    }
    if (sql.includes("UPDATE agents.approvals")) {
      const a = approvals.get(params[0] as string);
      if (!a || a.decision !== null) return Promise.resolve({ rows: [] });
      a.decision = params[1] as string;
      return Promise.resolve({ rows: [{ request_id: params[0] }] });
    }
    if (sql.includes("SELECT decision")) {
      const a = approvals.get(params[0] as string);
      return Promise.resolve({ rows: a ? [{ decision: a.decision }] : [] });
    }
    if (sql.includes("FROM agents.steps")) {
      const sid = params[0] as string;
      // store.addStep JSON.stringifies payload/usage before the "insert" (it
      // targets a jsonb column on real Postgres, which parses the text back
      // into an object on SELECT) — parse them back here too, or every
      // consumer of listEvents() sees strings instead of objects, unlike
      // production.
      const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
      const rows = steps
        .filter((s) => turns.some((t) => t.id === s.turn_id && t.session_id === sid))
        .map((s) => ({ turn_id: s.turn_id, kind: s.kind, name: s.name, payload: parse(s.payload), usage: parse(s.usage) }));
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  };
  return { query, turns, steps, approvals };
}

// See runner.test.ts's FINISH/sequencedModel comment: ai@6's raw doStream
// "finish" chunk nests usage under inputTokens.total/outputTokens.total and
// finishReason under {unified, raw} (was flat in the v2 shape the brief was
// drafted against); doStream itself must return a Promise, not a bare
// object. Chunk arrays are typed `any[]` (matching runner.test.ts's
// `sequencedModel` precedent) so the literals aren't structurally checked
// against the full LanguageModelV3StreamPart union field-by-field.
// deno-lint-ignore no-explicit-any
const textChunks = (text: string): any[] => [
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: text },
  { type: "text-end", id: "1" },
  {
    type: "finish",
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 2 } },
  },
];
// deno-lint-ignore no-explicit-any
const toolCallChunks = (toolName: string, input: unknown): any[] => [
  { type: "tool-call", toolCallId: "c-1", toolName, input: JSON.stringify(input) },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: "tool-calls" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  },
];

// Multi-step conversations call doStream once per step; cycle through the
// given responses (last one repeats) — same pattern as runner.test.ts.
// deno-lint-ignore no-explicit-any
function sequencedModel(...responses: any[][]) {
  let call = 0;
  return new MockLanguageModelV3({
    doStream: () => {
      const chunks = responses[Math.min(call++, responses.length - 1)];
      return Promise.resolve({ stream: simulateReadableStream({ chunks }) });
    },
  });
}

function model(text: string) {
  return sequencedModel(textChunks(text));
}

async function makeHandler(opts: { model?: unknown; mutate?: (agent: LoadedAgent) => void } = {}) {
  const agent = await loadAgent(TOY);
  opts.mutate?.(agent);
  const db = inMemoryDb();
  const handler = createHandler({
    agent, store: createStore(db.query as never),
    plugin: "toy-agent", agentName: "toy",
    basePath: "/plugins/trex/toy", model: opts.model ?? model("hello from toy"),
  });
  return { handler, db };
}

// Poll until the fire-and-forget turn work settles. Draining background work
// inside the test that starts it (rather than disabling sanitizeOps /
// sanitizeResources) keeps Deno's sanitizer defaults meaningful — ai@6's
// simulateReadableStream schedules real setTimeout(...,0) timers per chunk,
// and returning before the async turn resolves would leak them into the
// next test.
async function until(cond: () => boolean, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const settled = (db: ReturnType<typeof inMemoryDb>) =>
  db.turns.length > 0 && db.turns.every((t) => t.status !== "running");

Deno.test("POST /eve/v1/session creates a session and returns the id header", async () => {
  const { handler, db } = await makeHandler();
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
  await until(() => settled(db)); // drain the fire-and-forget turn (see until())
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("GET /stream replays persisted events as NDJSON after the turn ran", async () => {
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db)); // let the async turn finish (mock model is instant)
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  assertEquals(res.headers.get("content-type"), "application/x-ndjson");
  const text = await res.text();
  assert(text.includes('"turn.completed"'));
  // Replay of the persisted "text" step maps to message.completed, not
  // message.appended (see handler.ts's stepToEvent) — that's the event
  // eve's own client reads the final reply off (see events.ts).
  assert(text.includes('"message.completed"'));
  assert(text.includes('"hello from toy"'));
  // NDJSON framing (ndjsonEncode contract): every non-blank line is exactly
  // one JSON object, no SSE "data: " prefix or blank-line separators.
  const lines = text.split("\n").filter((l) => l !== "");
  assert(lines.length > 0);
  for (const line of lines) {
    assert(/^\{.*\}$/.test(line), `bad NDJSON line: ${JSON.stringify(line)}`);
    JSON.parse(line); // throws if malformed
  }
});

Deno.test("replay preserves live event order: message.completed before turn.completed", async () => {
  // Live order (asserted in runner.test.ts) is message.completed →
  // turn.completed; replay is seq-ordered over agents.steps, so the "text"
  // step must be persisted BEFORE the "finish" step (runner.ts's
  // persistText) or replay inverts the order eve clients depend on
  // (extractCompletedMessage reads the reply before the turn boundary).
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  const types = (await res.text()).split("\n").filter((l) => l !== "")
    .map((l) => (JSON.parse(l) as { type: string }).type);
  const completedIdx = types.indexOf("message.completed");
  const finishIdx = types.indexOf("turn.completed");
  assert(completedIdx >= 0, `no message.completed in replay: [${types.join(", ")}]`);
  assert(finishIdx >= 0, `no turn.completed in replay: [${types.join(", ")}]`);
  assert(completedIdx < finishIdx, `replay order inverted: [${types.join(", ")}]`);
});

Deno.test("unknown session 404s; unknown route 404s; healthz/eve-info list tools", async () => {
  const { handler } = await makeHandler();
  assertEquals((await handler(new Request(`${BASE}/eve/v1/session/nope/stream`))).status, 404);
  assertEquals((await handler(new Request(`${BASE}/eve/v1/session/nope`, { method: "POST", body: "{}" }))).status, 404);
  assertEquals((await handler(new Request(`${BASE}/bogus`))).status, 404);
  // basePath is anchored: unprefixed paths never hit our routes.
  assertEquals((await handler(new Request(`http://local/healthz`))).status, 404);
  const health = await (await handler(new Request(`${BASE}/healthz`))).json();
  assertEquals(health.tools.sort(), ["echo", "propose_card"]);
  assertEquals((await handler(new Request(`${BASE}/eve/v1/health`))).status, 200);
  const info = await (await handler(new Request(`${BASE}/eve/v1/info`))).json();
  assertEquals(info.kind, "eve-agent-info");
  assertEquals(info.tools.authored.map((t: { name: string }) => t.name).sort(), ["echo", "propose_card"]);
  // trex extension: /info surfaces clientOnly (always present as a boolean).
  const byName = Object.fromEntries(info.tools.authored.map((t: { name: string; clientOnly: boolean }) => [t.name, t.clientOnly]));
  assertEquals(byName.propose_card, true);
  assertEquals(byName.echo, false);
});

Deno.test("POST /eve/v1/session/:id (bare) on an existing session accepts and records a turn", async () => {
  const { handler, db } = await makeHandler();
  // Create the session without a first message — no turn starts.
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  assertEquals(db.turns.length, 0);
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  assertEquals(res.status, 202);
  await until(() => settled(db));
  assertEquals(db.turns.length, 1);
  assertEquals(db.turns[0].status, "completed");
  assert(db.steps.some((s) => s.turn_id === db.turns[0].id));
});

Deno.test("POST /eve/v1/session/:id with inputResponses resolves a pending approval", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const bad = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "ask_question" }] }),
  }));
  assertEquals(bad.status, 400);

  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  }));
  assertEquals(res.status, 202);
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /approval resolves a pending approval and unblocks the turn; unknown requestId 404s", async () => {
  // Toy agent + an in-memory needsApproval tool (same pattern as runner.test.ts).
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.guarded = {
        description: "guarded", inputSchema: { type: "object", properties: {} },
        needsApproval: true,
        execute: () => Promise.resolve({ ran: true }),
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  // The turn blocks inside the guarded tool until an approval decision lands.
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // Unknown requestId → 404 (checked while the real one is still pending).
  const missing = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: "nope", decision: "approve" }),
  }));
  assertEquals(missing.status, 404);

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { resolved: true });

  // Toolset default poll is 500ms; give the turn time to observe the decision.
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
  assert(db.steps.some((s) => s.kind === "tool-result" && s.name === "guarded"));
});

Deno.test("model failure marks the turn failed and persists an error event (no unhandled rejection)", async () => {
  const failing = new MockLanguageModelV3({
    doStream: () => Promise.reject(new Error("model exploded")),
  });
  const { handler, db } = await makeHandler({ model: failing });
  // The fake DB ids are deterministic (first session is always "s-1"), so we
  // can subscribe to the live stream registry BEFORE the POST — no race with
  // the fire-and-forget turn — and count lifecycle events on the wire.
  const live: AgentEvent[] = [];
  const unsub = subscribe("s-1", (e) => live.push(e));
  // streamText's default onError logs the stream error via console.error;
  // capture it so the expected diagnostic becomes an assertion instead of
  // noise in the test output.
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const res = await handler(new Request(`${BASE}/eve/v1/session`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    }));
    assertEquals(res.status, 200); // the failure is async — session creation still succeeds
    await until(() => settled(db));
  } finally {
    console.error = origError;
    unsub();
  }
  assertEquals(db.turns[0].status, "failed");
  assert(db.turns[0].error && db.turns[0].error.includes("model exploded"));
  assert(db.steps.some((s) => s.kind === "error"));
  assert(logged.some((l) => l.includes("model exploded")));
  // Exactly ONE turn.failed on the wire: handler.ts's startTurn catch owns
  // turn-lifecycle events; runner.ts's error case must not emit a second
  // one (it only persists the error step).
  assertEquals(live.filter((e) => e.type === "turn.failed").length, 1);
  assertEquals(live.filter((e) => e.type === "session.failed").length, 1);
  // No unhandled rejection / leaked timer: the test failing on Deno's default
  // sanitizers or an uncaught-error crash IS the assertion here.
});

Deno.test("POST /chat returns a UIMessage stream", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  assertEquals(res.status, 200);
  assert((res.headers.get("content-type") || "").includes("text/event-stream"));
  const body = await res.text();
  assert(body.length > 0);
});

Deno.test("POST /chat rejects a missing or empty messages array with 400", async () => {
  const { handler } = await makeHandler();
  for (const payload of [{}, { messages: [] }]) {
    const res = await handler(new Request(`${BASE}/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: "messages[] required" });
  }
});
