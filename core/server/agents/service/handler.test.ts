import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { createHandler } from "./handler.ts";
import { loadAgent } from "../loader.ts";
import type { LoadedAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import { publish, subscribe, subscriberCount } from "./stream.ts";
import type { AgentEvent } from "./events.ts";

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "http://local/plugins/trex/toy";

function inMemoryDb() {
  // Minimal in-memory impl of the SQL the store issues, keyed by table.
  // Exposed state (turns/steps/approvals) lets tests assert on persistence
  // and drive approval decisions without Postgres.
  const sessions = new Map<string, { status: string; created_by: string | null }>();
  const turns: Array<{ id: string; session_id: string; seq: number; status: string; error: string | null }> = [];
  const steps: Array<{ turn_id: string; seq: number; kind: string; name: string | null; payload: unknown; usage: unknown }> = [];
  const approvals = new Map<string, { decision: string | null; sessionId: string; tool: string }>();
  // H4: (userId, plugin, agent, tool) -> consent, keyed the same way as the
  // real table's primary key.
  const toolConsents = new Map<string, "always" | "never">();
  // Every call the store issues, in order — lets tests assert on the exact
  // params a route handed to the store (e.g. created_by, session-scoping)
  // without needing a real Postgres.
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let n = 0;
  const query = (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("INSERT INTO agents.sessions")) {
      const id = `s-${++n}`;
      sessions.set(id, { status: "active", created_by: (params[2] as string | null) ?? null });
      return Promise.resolve({ rows: [{ id }] });
    }
    if (sql.includes("SELECT id, status, created_by FROM agents.sessions")) {
      const s = sessions.get(params[0] as string);
      return Promise.resolve({ rows: s ? [{ id: params[0], status: s.status, created_by: s.created_by }] : [] });
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
      approvals.set(id, { decision: null, sessionId: params[0] as string, tool: params[2] as string });
      return Promise.resolve({ rows: [{ request_id: id }] });
    }
    if (sql.includes("UPDATE agents.approvals")) {
      // params: [requestId, decision, sessionId] — mirrors store.ts's
      // `WHERE request_id = $1 AND session_id = $3 AND decision IS NULL`.
      const a = approvals.get(params[0] as string);
      if (!a || a.decision !== null || a.sessionId !== params[2]) return Promise.resolve({ rows: [] });
      a.decision = params[1] as string;
      return Promise.resolve({ rows: [{ request_id: params[0] }] });
    }
    if (sql.includes("SELECT decision")) {
      const a = approvals.get(params[0] as string);
      return Promise.resolve({ rows: a ? [{ decision: a.decision }] : [] });
    }
    if (sql.includes("SELECT tool FROM agents.approvals")) {
      const a = approvals.get(params[0] as string);
      return Promise.resolve({ rows: a ? [{ tool: a.tool }] : [] });
    }
    if (sql.includes("SELECT consent FROM agents.tool_consents")) {
      const [userId, plugin, agentName, tool] = params as string[];
      const consent = toolConsents.get(`${userId}|${plugin}|${agentName}|${tool}`);
      return Promise.resolve({ rows: consent ? [{ consent }] : [] });
    }
    if (sql.includes("INSERT INTO agents.tool_consents")) {
      const [userId, plugin, agentName, tool, consent] = params as string[];
      toolConsents.set(`${userId}|${plugin}|${agentName}|${tool}`, consent as "always" | "never");
      return Promise.resolve({ rows: [] });
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
  return { query, turns, steps, approvals, toolConsents, calls };
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

// H3: replay maps a persisted `custom` step (from ToolContext.emit on the
// session path — runner.test.ts covers the live side) back to the same
// `tool.event` a live subscriber would have seen, same as every other step
// kind (see handler.ts's stepToEvent).
Deno.test("GET /stream replays a persisted custom step as tool.event", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.emitter = {
        description: "emits a custom progress event",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
          ctx?.emit?.("progress", { step: 1 });
          return Promise.resolve({ ok: true });
        },
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  assert(db.steps.some((s) => s.kind === "custom"), "expected a persisted custom step");
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  const text = await res.text();
  assert(text.includes('"tool.event"'), `no tool.event in replay: ${text}`);
  const lines = text.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l));
  const toolEvent = lines.find((l) => l.type === "tool.event");
  assert(toolEvent, `no tool.event line: ${text}`);
  assertEquals(toolEvent.data.name, "progress");
  assertEquals(toolEvent.data.payload, { step: 1 });
});

// H3 regression guard for replay ordering: a custom step (persisted through
// the shared stepSeq counter during the tool phase) must replay BEFORE the
// text step's message.completed, which in turn must replay BEFORE finish's
// turn.completed — the eve-client ordering fix (persistText before the
// finish step, see runner.ts) that a future persist-sequencing change could
// silently break.
Deno.test("replay orders tool.event before message.completed before turn.completed", async () => {
  const { handler, db } = await makeHandler({
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.emitter = {
        description: "emits a custom progress event",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
          ctx?.emit?.("progress", { step: 1 });
          return Promise.resolve({ ok: true });
        },
      };
    },
  });
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream?replayOnly=1`));
  const types = (await res.text()).split("\n").filter((l) => l !== "")
    .map((l) => (JSON.parse(l) as { type: string }).type);
  const toolEventIdx = types.indexOf("tool.event");
  const completedIdx = types.indexOf("message.completed");
  const finishIdx = types.indexOf("turn.completed");
  assert(toolEventIdx >= 0, `no tool.event in replay: [${types.join(", ")}]`);
  assert(completedIdx >= 0, `no message.completed in replay: [${types.join(", ")}]`);
  assert(finishIdx >= 0, `no turn.completed in replay: [${types.join(", ")}]`);
  assert(toolEventIdx < completedIdx, `tool.event after message.completed: [${types.join(", ")}]`);
  assert(completedIdx < finishIdx, `message.completed after turn.completed: [${types.join(", ")}]`);
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

Deno.test("POST /approval 404s a requestId that belongs to a different session", async () => {
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

  // A second, unrelated session — the pending approval belongs to `sid`,
  // not this one.
  const otherCreate = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  const otherSid = otherCreate.headers.get("x-eve-session-id")!;

  const wrongSession = await handler(new Request(`${BASE}/eve/v1/session/${otherSid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(wrongSession.status, 404);

  // The real session can still resolve it — proves the 404 above was
  // session-scoping, not the approval being consumed/expired.
  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

// H4 (sticky tool-consent decisions — task-h4-brief.md): POST /approval's
// "always"/"never" decisions resolve the pending request (as approve/deny)
// AND upsert agents.tool_consents for the authenticated user.
Deno.test("POST /approval with decision 'always' resolves as approve and upserts a sticky consent", async () => {
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
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "always" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { resolved: true });
  assertEquals(db.approvals.get(requestId)!.decision, "approve");
  assertEquals(db.toolConsents.get("user-1|toy-agent|toy|guarded"), "always");

  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /approval with decision 'never' resolves as deny and upserts a sticky consent", async () => {
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
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "never" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(db.approvals.get(requestId)!.decision, "deny");
  assertEquals(db.toolConsents.get("user-1|toy-agent|toy|guarded"), "never");

  // Drain the fire-and-forget turn (denied tool call still lets the turn
  // finish, per the pre-H4 deny path) — see the `until` helper's own comment
  // on why leaving this pending leaks a timer into the next test.
  await until(() => settled(db), 10_000);
});

Deno.test("POST /approval rejects an 'always'/'never' decision without an authenticated user (400)", async () => {
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
    method: "POST", headers: { "content-type": "application/json" }, // no x-user-id
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "always" }),
  }));
  assertEquals(rejected.status, 400);
  // Still pending — the 400 must not have resolved it as a side effect.
  assertEquals(db.approvals.get(requestId)!.decision, null);
  assertEquals(db.toolConsents.size, 0);

  // Drain the fire-and-forget turn with a plain (non-sticky) decision, which
  // needs no authenticated user — otherwise the guarded tool's poll loop
  // leaks a timer past this test.
  await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "deny" }),
  }));
  await until(() => settled(db), 10_000);
});

// Same sticky handling on the inputResponses follow-up path (POST
// /eve/v1/session/:id), not just the standalone /approval convenience route.
Deno.test("POST /eve/v1/session/:id with inputResponses optionId 'always' resolves as approve and upserts a sticky consent", async () => {
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
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "always" }] }),
  }));
  assertEquals(res.status, 202);
  assertEquals(db.toolConsents.get("user-1|toy-agent|toy|guarded"), "always");
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /eve/v1/session/:id rejects inputResponses optionId 'never' without an authenticated user (400)", async () => {
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
    method: "POST", headers: { "content-type": "application/json" }, // no x-user-id
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "never" }] }),
  }));
  assertEquals(rejected.status, 400);
  assertEquals(db.approvals.get(requestId)!.decision, null);
  // H4 review Minor: the 400 must not have produced a sticky consent row.
  assertEquals(db.toolConsents.size, 0);

  // Drain the fire-and-forget turn (see the sibling /approval test's comment).
  await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "deny" }] }),
  }));
  await until(() => settled(db), 10_000);
});

// Ride-along security fix (task-h5-brief.md, from the H4 review): approval
// resolution must verify the caller is the session's owner, not just
// (requestId, sessionId) — otherwise any authenticated user who learns
// those ids could resolve someone else's pending approval and, with H4's
// sticky verbs, accrue a durable consent on their behalf.
Deno.test("POST /approval: the session owner (matching x-user-id) can resolve their own approval", async () => {
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
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(db.approvals.get(requestId)!.decision, "approve");
  await until(() => settled(db), 10_000);
  assertEquals(db.turns[0].status, "completed");
});

Deno.test("POST /approval: a non-owner user is rejected with 403, the pending request is untouched, and no consent row is created", async () => {
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
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // A different authenticated user learns (sessionId, requestId) somehow and
  // tries to resolve it — including a sticky "always", which would have
  // accrued a consent under their own identity if unchecked.
  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-2" },
    body: JSON.stringify({ requestId, decision: "always" }),
  }));
  assertEquals(rejected.status, 403);
  assertEquals(await rejected.json(), { error: "approval can only be resolved by the session owner" });
  assertEquals(db.approvals.get(requestId)!.decision, null);
  assertEquals(db.toolConsents.size, 0);

  // The real owner can still resolve it — proves the 403 was ownership, not
  // approval corruption.
  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  await until(() => settled(db), 10_000);
});

Deno.test("POST /eve/v1/session/:id inputResponses: a non-owner user is rejected with 403 and the pending request is untouched", async () => {
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
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  const rejected = await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-2" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  }));
  assertEquals(rejected.status, 403);
  assertEquals(db.approvals.get(requestId)!.decision, null);
  assertEquals(db.toolConsents.size, 0);

  // Drain with the real owner so no timer leaks into the next test.
  await handler(new Request(`${BASE}/eve/v1/session/${sid}`, {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "user-1" },
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  }));
  await until(() => settled(db), 10_000);
});

Deno.test("POST /approval: an anonymous session (no created_by) can still be resolved by anyone", async () => {
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
    method: "POST", headers: { "content-type": "application/json" }, // no x-user-id
    body: JSON.stringify({ message: "go" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => db.approvals.size > 0);
  const requestId = [...db.approvals.keys()][0];

  // No x-user-id at all on the resolve either — pre-existing anonymous
  // behavior must be unaffected by the ownership check.
  const ok = await handler(new Request(`${BASE}/eve/v1/session/${sid}/approval`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, decision: "approve" }),
  }));
  assertEquals(ok.status, 200);
  assertEquals(db.approvals.get(requestId)!.decision, "approve");
  await until(() => settled(db), 10_000);
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

Deno.test("channel turn: a throwing delivery registration (onTurnCreated) does NOT abort the turn (Task 19 robustness)", async () => {
  const agent = await loadAgent(TOY);
  // A channel whose `events` access throws — this fires inside startTurn's
  // onTurnCreated (the delivery-registration callback: layer.ts's registerForTurn
  // reads channel.events). Pre-fix that throw unwound the turn's IIFE BEFORE
  // turn.started/runTurn, so the turn died with no turn.failed/session.failed and
  // any /stream reader hung forever. The turn must now run to completion and emit
  // its own lifecycle regardless of a delivery-registration failure.
  // deno-lint-ignore no-explicit-any
  (agent.channels as any).boomevt = {
    __trexChannel: true,
    get events() { throw new Error("registration boom"); },
    routes: [{
      method: "POST",
      path: "/in",
      // deno-lint-ignore no-explicit-any
      handler: async (_req: Request, args: any) => {
        const s = await args.send("hi", { auth: null, continuationToken: "u-1" });
        return Response.json({ sessionId: s.id });
      },
    }],
  };

  const db = inMemoryDb();
  const channelStore = {
    resolveOrCreateSession: () => Promise.resolve({ sessionId: "chan-sess", created: true }),
    setContinuationToken: () => Promise.resolve(),
  };
  const handler = createHandler({
    agent,
    store: createStore(db.query as never),
    plugin: "toy-agent",
    agentName: "toy",
    basePath: "/plugins/trex/toy",
    model: model("hello from toy"),
    channelStore: channelStore as never,
  });

  // Deterministic sessionId from the fake channelStore -> subscribe before the POST.
  const live: AgentEvent[] = [];
  const unsub = subscribe("chan-sess", (e) => live.push(e));
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    const res = await handler(new Request(`${BASE}/eve/v1/boomevt/in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    assertEquals(res.status, 200); // send() already returned before the async throw
    await until(() => settled(db)); // pre-fix this would hang (turn stuck "running")
  } finally {
    console.error = origError;
    unsub();
  }

  // The turn ran to completion despite the registration throw...
  assertEquals(db.turns[0].status, "completed");
  // ...and published its full lifecycle on the wire (turn.started + a terminal).
  assert(live.some((e) => e.type === "turn.started"), "turn.started was published");
  assert(live.some((e) => e.type === "turn.completed"), "turn.completed was published");
  assert(live.some((e) => e.type === "session.waiting"), "session parked (terminal reached)");
  // The registration failure was logged, not silently swallowed.
  assert(logged.some((l) => l.includes("delivery registration failed")), "logged the registration failure");
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

// task-u1: usage must reach the wire via the finish part's messageMetadata —
// toUIMessageStream() previously ran with no options, so totalUsage was only
// persisted to agents.steps (observability) and never sent to the client.
Deno.test("POST /chat: finish part carries usage in messageMetadata", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  const text = await res.text();
  assert(text.includes('"type":"finish"'), `no finish part in stream: ${text}`);
  assert(text.includes('"messageMetadata"'), `finish part missing messageMetadata: ${text}`);
  // model("hello from toy") -> textChunks' usage: inputTokens.total=1, outputTokens.total=2
  assert(text.includes('"inputTokens"'), `messageMetadata missing usage.inputTokens: ${text}`);
  assert(text.includes('"outputTokens"'), `messageMetadata missing usage.outputTokens: ${text}`);
});

// H3: ToolContext.emit on /chat interleaves a `data-${name}` UIMessage part
// into the SAME stream useChat consumes (createUIMessageStream +
// writer.merge — see handler.ts and task-h3-report.md for the v6 API
// verification). No agents.steps write on this path (unlike the session
// path) — /chat never persisted tool-call/tool-result steps either.
Deno.test("POST /chat interleaves ToolContext.emit as a data-* UIMessage part", async () => {
  const { handler } = await makeHandler({
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
    mutate: (agent) => {
      agent.tools.emitter = {
        description: "emits a custom progress event",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
          ctx?.emit?.("progress", { step: 1 });
          return Promise.resolve({ ok: true });
        },
      };
    },
  });
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }] }),
  }));
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(text.includes('"type":"data-progress"'), `no data-progress part in stream: ${text}`);
  assert(text.includes('"step":1'), `emitted payload missing from stream: ${text}`);
});

// H3 review fix: /chat setup-phase failures must keep pre-H3 HTTP-error
// semantics. buildSdkTools (and its filterTools hook) runs BEFORE
// createUIMessageStream, so a throwing hook rejects the route — it must
// NOT be demoted to a 200 response carrying an in-stream SSE error frame
// (which is what moving tool building inside the stream's execute() would
// have done). Matches hooks.test.ts's pre-H3 assertRejects posture for a
// throwing resolveModel on /chat.
Deno.test("POST /chat: a throwing filterTools hook rejects the request (setup phase, no 200+SSE-error demotion)", async () => {
  const { handler } = await makeHandler({
    mutate: (agent) => {
      agent.config.filterTools = () => {
        throw new Error("filterTools exploded");
      };
    },
  });
  await assertRejects(
    () =>
      handler(new Request(`${BASE}/chat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
      })),
    Error,
    "filterTools exploded",
  );
});

// A tool that never calls ctx.emit must not add any data-* part — same
// no-op-when-unused posture as the session path (runner.test.ts).
Deno.test("POST /chat: a tool that never calls ctx.emit adds no data-* part", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  const text = await res.text();
  assert(!/"type":"data-/.test(text), `unexpected data-* part: ${text}`);
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

// The proxy (plugin/function.ts) injects x-user-id from auth-context
// middleware into the worker request headers; handler.ts must read it back
// off and pass it through as created_by so a session's owner is
// recoverable — it was previously always NULL regardless of who created it.
Deno.test("x-user-id header populates created_by on session creation (POST /eve/v1/session)", async () => {
  const { handler, db } = await makeHandler();
  await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "user-42" },
    body: JSON.stringify({}),
  }));
  const insert = db.calls.find((c) => c.sql.includes("INSERT INTO agents.sessions"));
  assert(insert, "expected an agents.sessions insert");
  assertEquals(insert!.params, ["toy-agent", "toy", "user-42"]);
});

Deno.test("created_by is null when x-user-id header is absent (POST /eve/v1/session)", async () => {
  const { handler, db } = await makeHandler();
  await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  const insert = db.calls.find((c) => c.sql.includes("INSERT INTO agents.sessions"));
  assert(insert, "expected an agents.sessions insert");
  assertEquals(insert!.params, ["toy-agent", "toy", null]);
});

Deno.test("x-user-id header populates created_by on the /chat endpoint's session", async () => {
  const { handler, db } = await makeHandler();
  const res = await handler(new Request(`${BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-id": "user-7" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }] }),
  }));
  // Drain the UIMessage stream (same as "POST /chat returns a UIMessage
  // stream" below) — simulateReadableStream schedules real setTimeout(...)
  // timers per chunk; leaving the body unread leaks them into later tests.
  await res.text();
  const insert = db.calls.find((c) => c.sql.includes("INSERT INTO agents.sessions"));
  assert(insert, "expected an agents.sessions insert");
  assertEquals(insert!.params, ["toy-agent", "toy", "user-7"]);
});

Deno.test("GET /stream (live tail) delivers events published after replay completes", async () => {
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));
  const res = await handler(new Request(`${BASE}/eve/v1/session/${sid}/stream`));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const readUntil = async (needle: string, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!text.includes(needle)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${needle}: ${text}`);
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
  };
  await readUntil('"turn.completed"'); // the replay snapshot
  publish(sid, { type: "session.waiting", data: { wait: "next-user-message" } });
  await readUntil('"session.waiting"'); // the live event, published well after replay
  await reader.cancel();
});

Deno.test("GET /stream subscribes before replay: an event published during the replay window is not lost, and buffered events flush after the replay snapshot", async () => {
  // Regression test for the replay/live gap: previously the route did
  // listEvents() → replay → subscribe(), so anything published in that
  // window was neither in the replay snapshot nor caught live — genuinely
  // lost. Now it subscribes first (buffering into memory), replays, then
  // flushes the buffer — so a same-window event is delivered exactly once
  // more than it would have been (after the replay snapshot), never zero.
  const { handler, db } = await makeHandler();
  const create = await handler(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = create.headers.get("x-eve-session-id")!;
  await until(() => settled(db));

  // A store wrapper whose listEvents() blocks on `gate` — simulates the
  // window between "start replaying" and "replay snapshot ready" during
  // which a live event can land.
  const baseStore = createStore(db.query as never);
  let releaseGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  const gatedStore = {
    ...baseStore,
    listEvents: async (id: string) => {
      await gate;
      return baseStore.listEvents(id);
    },
  };
  const agent = await loadAgent(TOY);
  const gatedHandler = createHandler({
    agent, store: gatedStore, plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
  });

  const streamPromise = gatedHandler(new Request(`${BASE}/eve/v1/session/${sid}/stream`));
  // Let microtasks run: the route's async start() calls subscribe()
  // synchronously before its first await (on the gated listEvents()), so by
  // the time this resolves, the subscription is already live.
  await new Promise((r) => setTimeout(r, 10));
  // Published "during the replay window" — subscribe() already happened,
  // listEvents() has not resolved yet.
  publish(sid, { type: "session.waiting", data: { wait: "next-user-message" } });
  releaseGate();

  const res = await streamPromise;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 5000;
  while (!text.includes('"session.waiting"') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  await reader.cancel();

  const types = text.split("\n").filter((l) => l !== "").map((l) => (JSON.parse(l) as { type: string }).type);
  assert(types.includes("message.completed"), `no message.completed in output: [${types.join(", ")}]`);
  assert(types.includes("session.waiting"), `buffered event was lost: [${types.join(", ")}]`);
  // Buffer flush ordering: the replay snapshot (message.completed /
  // turn.completed) precedes the buffered live event in the output.
  const lastReplayedIdx = Math.max(types.lastIndexOf("message.completed"), types.lastIndexOf("turn.completed"));
  const waitingIdx = types.indexOf("session.waiting");
  assert(lastReplayedIdx < waitingIdx, `replay/buffer order inverted: [${types.join(", ")}]`);
});

Deno.test("GET /stream releases the subscriber when replay (listEvents) fails", async () => {
  // subscribe() now runs BEFORE the awaited listEvents(); if that query
  // rejects, the subscriber must be released (unsub + controller.error) or
  // it leaks permanently in buffering mode — buffer growing on every
  // publish, with the abort listener never attached and cancel() never
  // firing on an errored stream.
  const { handler: _seed, db } = await makeHandler();
  await _seed(new Request(`${BASE}/eve/v1/session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  }));
  const sid = "s-1"; // deterministic fake-DB id (see model-failure test)
  await until(() => settled(db));

  const baseStore = createStore(db.query as never);
  const failingStore = {
    ...baseStore,
    listEvents: () => Promise.reject(new Error("replay query exploded")),
  };
  const agent = await loadAgent(TOY);
  const failingHandler = createHandler({
    agent, store: failingStore, plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
  });

  const before = subscriberCount(sid);
  const res = await failingHandler(new Request(`${BASE}/eve/v1/session/${sid}/stream`));
  // The rejection surfaces through the errored stream body, not the
  // (already-sent) 200 response head.
  let errored = false;
  try {
    const reader = res.body!.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (e) {
    errored = true;
    assert(String(e).includes("replay query exploded"));
  }
  assert(errored, "stream body should error when replay fails");
  // No leaked subscriber: the registry is back to its pre-request count.
  assertEquals(subscriberCount(sid), before);
});

// ── OAuth broker routes (task-7) ─────────────────────────────────────────────
import { signState } from "../connections/oauth/state.ts";
import type { OAuthConnector, OAuthStore, OAuthToken } from "../connections/oauth/store.ts";

const OAUTH_SECRET = "handler-oauth-secret";

function oauthHandler() {
  const puts: Array<{ pt: string; pid: string; c: string; token: OAuthToken }> = [];
  const connectors: Record<string, OAuthConnector> = {
    github: {
      authorizationUrl: "https://prov.example/authorize",
      tokenUrl: "https://prov.example/token",
      clientId: "cid",
      clientSecret: "csecret",
      scopes: "repo",
      principalScope: "user",
    },
  };
  const store: OAuthStore = {
    getToken: () => Promise.resolve(null),
    putToken: (pt, pid, c, token) => {
      puts.push({ pt, pid, c, token });
      return Promise.resolve();
    },
    getConnector: (id) => Promise.resolve(connectors[id] ?? null),
  } as OAuthStore;
  return { store, puts, connectors };
}

Deno.test("oauth route: 404 when no broker is configured", async () => {
  const { handler } = await makeHandler();
  const res = await handler(new Request(`${BASE}/eve/v1/oauth/github/start?state=x`));
  assertEquals(res.status, 404);
});

Deno.test("oauth start route is mounted and 302s on a valid signed state", async () => {
  const agent = await loadAgent(TOY);
  const db = inMemoryDb();
  const { store } = oauthHandler();
  const handler = createHandler({
    agent, store: createStore(db.query as never),
    plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
    oauth: { store, secret: OAUTH_SECRET, startUrlBase: "/plugins/trex/toy/eve/v1/oauth", basePath: "/plugins/trex/toy" },
  });
  const state = await signState(
    { session: "s", principalType: "user", principalId: "u", connector: "github", nonce: "n", exp: Date.now() + 600_000 },
    OAUTH_SECRET,
  );
  const res = await handler(new Request(`${BASE}/eve/v1/oauth/github/start?state=${encodeURIComponent(state)}`));
  assertEquals(res.status, 302);
  assert((res.headers.get("location") ?? "").startsWith("https://prov.example/authorize"));
});

Deno.test("oauth callback route rejects a tampered state with 400 (no token write)", async () => {
  const agent = await loadAgent(TOY);
  const db = inMemoryDb();
  const { store, puts } = oauthHandler();
  const handler = createHandler({
    agent, store: createStore(db.query as never),
    plugin: "toy-agent", agentName: "toy", basePath: "/plugins/trex/toy",
    oauth: { store, secret: OAUTH_SECRET, startUrlBase: "/plugins/trex/toy/eve/v1/oauth", basePath: "/plugins/trex/toy" },
  });
  const res = await handler(new Request(`${BASE}/eve/v1/oauth/github/callback?code=X&state=forged.sig`));
  assertEquals(res.status, 400);
  assertEquals(puts.length, 0);
});
