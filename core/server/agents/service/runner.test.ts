import { assert, assertEquals } from "jsr:@std/assert";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { runTurn } from "./runner.ts";
import { loadAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;

// Multi-step conversations call doStream once per step; cycle through the
// given responses (last one repeats) so a tool call is followed by a
// terminating text step instead of looping to the step cap.
//
// ai@6's LanguageModelV3.doStream is `(options) => PromiseLike<...>` (was
// sync-or-promise in v2) — the constructor's function-form doStream must
// return a Promise or the resolved package's types reject it.
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

// ai@6 / @ai-sdk/provider@3 (LanguageModelV3) changed the raw doStream
// "finish" part's shape vs the v2 shape this brief was drafted against:
// `finishReason` is now `{unified, raw}` (was a plain string) and `usage`
// nests token counts under `inputTokens.total` / `outputTokens.total`
// (was flat `inputTokens`/`outputTokens` numbers). Verified against the
// resolved ai@^6 package via a scratch probe of `result.fullStream` — the
// SDK still normalizes these back to a flat `finishReason` string and
// `totalUsage.{inputTokens,outputTokens}` numbers at the fullStream level,
// which is what runner.ts already reads. Only these mock input chunks need
// the nested shape; runner.ts is unchanged from the brief.
const FINISH = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
};
const textChunks = (text: string) => [
  { type: "text-start", id: "1" },
  { type: "text-delta", id: "1", delta: text },
  { type: "text-end", id: "1" },
  FINISH,
];
const toolCallChunks = (toolName: string, input: unknown) => [
  { type: "tool-call", toolCallId: "c-1", toolName, input: JSON.stringify(input) },
  {
    type: "finish",
    finishReason: { unified: "tool-calls", raw: "tool-calls" },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
  },
];

function memoryStoreCalls() {
  // store backed by a recording fake — we only assert persistence happened
  const calls: string[] = [];
  const fn = (sql: string) => {
    calls.push(sql.trim().split(/\s+/).slice(0, 4).join(" "));
    if (sql.includes("RETURNING id, seq")) return Promise.resolve({ rows: [{ id: "t-1", seq: 1 }] });
    if (sql.includes("RETURNING id")) return Promise.resolve({ rows: [{ id: "s-1" }] });
    if (sql.includes("RETURNING request_id")) return Promise.resolve({ rows: [{ request_id: "r-1" }] });
    return Promise.resolve({ rows: [] });
  };
  return { store: createStore(fn as never), calls };
}

Deno.test("runTurn streams text deltas and a finish event, persists steps", async () => {
  const agent = await loadAgent(TOY);
  const { store, calls } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const res = await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "hello", store, emit: (e) => events.push(e),
    model: sequencedModel(textChunks("hi there")),
  });
  assertEquals(res.text, "hi there");
  assert(events.some((e) => e.type === "message.appended"));
  // message.completed is what eve's own client reads the final reply off
  // (see events.ts) — verified missing via a live `eve eval --url` run
  // before this was added; regression-guard it here.
  const completed = events.find((e) => e.type === "message.completed");
  assert(completed, "expected a message.completed event carrying the final reply");
  assertEquals((completed as { data: { message: string; finishReason: string } }).data.message, "hi there");
  assertEquals((completed as { data: { message: string; finishReason: string } }).data.finishReason, "stop");
  // message.completed must come before turn.completed — eve's client treats
  // it as part of the same turn's epilogue, read before the boundary event.
  const completedIdx = events.indexOf(completed);
  const finishIdx = events.findIndex((e) => e.type === "turn.completed");
  assert(completedIdx >= 0 && finishIdx >= 0 && completedIdx < finishIdx);
  const finish = events.find((e) => e.type === "turn.completed");
  assert(finish && (finish as { data: { usage: { outputTokens?: number } } }).data.usage.outputTokens === 1);
  assert(calls.some((c) => c.startsWith("INSERT INTO agents.steps")));
});

Deno.test("runTurn does not emit message.completed for a clientOnly tool-call turn (no trailing text)", async () => {
  // clientOnly tools have no `execute` (toolset.ts), so the AI SDK ends the
  // turn right after the tool call with finishReason "tool-calls" and no
  // model text at all — same shape as the existing clientOnly test above.
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "propose", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("propose_card", { title: "Diabetes cohort" })),
  });
  assert(!events.some((e) => e.type === "message.completed"));
});

// Task 5 (claw-devx-reliability), no-silent-turn guarantee — four branches at
// the "finish" case:
//   1. text present -> emit as always (covered by the first test in this file).
//   2. clientOnly call, no text -> stay silent (covered just above).
//   3. no tool calls at all, no text -> "Nothing was changed" (true: nothing ran).
//   4. tools ran, none posted, no text -> a line making NO claim about changes.
//   5. the LAST tool call posted to the channel, no text -> emit nothing (the
//      channel already heard the turn's closing act — see the "final act,
//      not sticky" tests below the postsToChannel test for why this is
//      recency-based, not "did any tool call ever post this turn").

Deno.test("runTurn delivers 'Nothing was changed' when a turn calls no tool at all and produces no text", async () => {
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const res = await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "...", store, emit: (e) => events.push(e),
    // A finish with no preceding text-delta or tool-call parts at all — the
    // model produced literally nothing.
    model: sequencedModel([FINISH]),
  });
  const completed = events.find((e) => e.type === "message.completed") as
    | { data: { message: string; finishReason: string } }
    | undefined;
  assert(completed, "expected a fallback message.completed event");
  assertEquals(
    completed!.data.message,
    'That step finished without producing a reply. Nothing was changed — say "retry" and I\'ll run it again.',
  );
  assertEquals(res.text, completed!.data.message);
  const completedIdx = events.indexOf(completed as AgentEvent);
  const finishIdx = events.findIndex((e) => e.type === "turn.completed");
  assert(completedIdx >= 0 && finishIdx >= 0 && completedIdx < finishIdx);
});

Deno.test("runTurn delivers a no-claim fallback when tools ran but none posted and no text followed", async () => {
  // The step cap cuts the loop off mid tool-call loop — the model never
  // produces closing text, and "echo" is an ordinary server tool with no
  // postsToChannel flag, so the channel never heard anything either.
  const agent = await loadAgent(TOY);
  agent.config.maxSteps = 2; // keep the tool-call loop short
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const res = await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "echo forever", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("echo", { text: "hi" })),
  });
  const completed = events.find((e) => e.type === "message.completed") as
    | { data: { message: string; finishReason: string } }
    | undefined;
  assert(completed, "expected a fallback message.completed event");
  // Must NOT claim anything about whether work happened — echo may or may
  // not have changed anything, and this branch genuinely doesn't know.
  assertEquals(completed!.data.message, 'That step ended without a reply. Say "retry" and I\'ll run it again.');
  assert(!completed!.data.message.toLowerCase().includes("nothing was changed"));
  assertEquals(res.text, completed!.data.message);
  const completedIdx = events.indexOf(completed as AgentEvent);
  const finishIdx = events.findIndex((e) => e.type === "turn.completed");
  assert(completedIdx >= 0 && finishIdx >= 0 && completedIdx < finishIdx);
});

// The regression this exists for: a turn that calls a postsToChannel
// tool (e.g. claw's postUpdate) and then ends with no text must NOT get the
// fallback — the channel already heard from the agent, and appending
// "Nothing was changed" could be an outright false claim if a later step in
// the SAME turn (e.g. askCodeAgent, an ordinary non-posting tool) did
// something.
Deno.test("runTurn emits NO fallback when a postsToChannel tool ran and the turn produced no text", async () => {
  const agent = await loadAgent(TOY);
  agent.config.maxSteps = 2;
  agent.tools.notify = {
    description: "posts a status line to the channel (test double for postUpdate)",
    inputSchema: { type: "object", properties: {} },
    postsToChannel: true,
    execute: () => Promise.resolve({ posted: true }),
  };
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const res = await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "notify forever", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("notify", {})),
  });
  assert(!events.some((e) => e.type === "message.completed"), "expected NO fallback — the channel already heard from the agent");
  assertEquals(res.text, "");
});

// sawChannelPost was STICKY (true forever once ANY postsToChannel tool ran
// this turn), but claw's skill
// makes postUpdate immediately before every askCodeAgent an invariant
// (facilitate-coding-task.md:125) — so claw's canonical turn is
// postUpdate("starting X") -> askCodeAgent (long) -> step cap, no closing
// text. The sticky flag suppressed the fallback for that whole shape,
// leaving "starting X" as the channel's last word. The fix tracks only the
// MOST RECENT tool call; a channel post that is NOT the turn's last act must
// no longer suppress the fallback.
Deno.test("runTurn emits the fallback when a postsToChannel tool ran but was NOT the last tool call of the turn", async () => {
  const agent = await loadAgent(TOY);
  agent.config.maxSteps = 2; // cuts the loop off after exactly 2 steps, no closing text
  agent.tools.notify = {
    description: "posts a status line to the channel (test double for postUpdate)",
    inputSchema: { type: "object", properties: {} },
    postsToChannel: true,
    execute: () => Promise.resolve({ posted: true }),
  };
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const res = await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    // Claw's canonical shape: postUpdate first, then a long non-posting call
    // (askCodeAgent stand-in: "echo", an ordinary server tool) that ends the
    // turn with no text.
    message: "notify then echo", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("notify", {}), toolCallChunks("echo", { text: "hi" })),
  });
  const completed = events.find((e) => e.type === "message.completed") as
    | { data: { message: string; finishReason: string } }
    | undefined;
  assert(completed, "expected the fallback to fire — the channel post was not the turn's last act");
  assert(!completed!.data.message.toLowerCase().includes("nothing was changed"));
  assertEquals(res.text, completed!.data.message);
});

// The other half of the same fix: a channel post that genuinely IS the
// turn's last act still suppresses the fallback, even when an earlier,
// non-posting tool call preceded it (proves this is about recency, not mere
// presence-anywhere-in-the-turn).
Deno.test("runTurn emits NO fallback when a postsToChannel tool IS the last tool call of the turn", async () => {
  const agent = await loadAgent(TOY);
  agent.config.maxSteps = 2;
  agent.tools.notify = {
    description: "posts a status line to the channel (test double for postUpdate)",
    inputSchema: { type: "object", properties: {} },
    postsToChannel: true,
    execute: () => Promise.resolve({ posted: true }),
  };
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  const res = await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "echo then notify", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("echo", { text: "hi" }), toolCallChunks("notify", {})),
  });
  assert(!events.some((e) => e.type === "message.completed"), "expected NO fallback — the channel post was the turn's last act");
  assertEquals(res.text, "");
});

Deno.test("runTurn emits clientOnly tool call and does not execute it", async () => {
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "propose", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("propose_card", { title: "Diabetes cohort" })),
  });
  const ev = events.find((e) => e.type === "actions.requested") as { data: { actions: Array<{ clientOnly?: boolean; toolName: string }> } };
  assert(ev);
  const call = ev.data.actions[0];
  assertEquals(call.toolName, "propose_card");
  assertEquals(call.clientOnly, true);
  assert(!events.some((e) => e.type === "action.result")); // never executed
});

Deno.test("needsApproval tool waits for approval before executing", async () => {
  const agent = await loadAgent(TOY);
  // add a needsApproval tool in-memory
  agent.tools.guarded = {
    description: "guarded", inputSchema: { type: "object", properties: {} },
    needsApproval: true,
    execute: () => Promise.resolve({ ran: true }),
  };
  const decisions: Record<string, string | null> = { "r-1": null };
  const fn = (sql: string) => {
    if (sql.includes("INSERT INTO agents.approvals")) return Promise.resolve({ rows: [{ request_id: "r-1" }] });
    if (sql.includes("SELECT decision")) return Promise.resolve({ rows: [{ decision: decisions["r-1"] }] });
    if (sql.includes("RETURNING id, seq")) return Promise.resolve({ rows: [{ id: "t-1", seq: 1 }] });
    return Promise.resolve({ rows: [] });
  };
  const store = createStore(fn as never);
  const events: AgentEvent[] = [];
  const p = runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [], message: "go",
    store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("guarded", {}), textChunks("done")),
    approvalPollMs: 10,
  });
  // approve shortly after the approval-request lands
  setTimeout(() => { decisions["r-1"] = "approve"; }, 50);
  await p;
  assert(events.some((e) => e.type === "input.requested"));
  assert(events.some((e) => e.type === "action.result"));
});

Deno.test("built-in skill tool loads skill content on demand", async () => {
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "how should you greet?", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("skill", { name: "greeting-style" }), textChunks("Ahoy!")),
  });
  const ev = events.find((e) => e.type === "action.result") as { data: { result: { output: unknown } } };
  assert(ev, "skill tool should have executed");
  const output = ev.data.result.output;
  assert(String(output).includes("Ahoy") || JSON.stringify(output).includes("Ahoy"));
});

Deno.test("built-in skill tool returns available list for unknown skill", async () => {
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "load bogus", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("skill", { name: "bogus" }), textChunks("ok")),
  });
  const ev = events.find((e) => e.type === "action.result") as { data: { result: { output: unknown } } };
  assert(JSON.stringify(ev.data.result.output).includes("greeting-style"));
});

Deno.test("built-in agent tool runs a named subagent and returns its text", async () => {
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  // Outer model delegates to the shouter; the SAME sequenced mock then serves
  // the nested run (call 2: subagent calls shout) and the follow-ups.
  const model = sequencedModel(
    toolCallChunks("agent", { agent: "shouter", prompt: "shout banana" }), // outer step 1
    toolCallChunks("shout", { text: "banana" }),                            // nested step 1
    textChunks("BANANA"),                                                   // nested step 2 (+ any further)
  );
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "delegate", store, emit: (e) => events.push(e), model,
  });
  const ev = events.find(
    (e) => e.type === "action.result" && (e as { data: { result: { toolName: string } } }).data.result.toolName === "agent",
  ) as { data: { result: { output?: { text?: string } } } };
  assert(ev, "agent tool should have executed");
  assertEquals(ev.data.result.output?.text, "BANANA");
});

Deno.test("subagent runs do not get a nested agent tool (one level only)", async () => {
  const agent = await loadAgent(TOY);
  const { buildSdkTools } = await import("./toolset.ts");
  const nested = await buildSdkTools({ agent: agent.subagents.shouter, sessionId: "s-1", depth: 1 });
  assert(!("agent" in nested));
  const top = await buildSdkTools({ agent, sessionId: "s-1", depth: 0 });
  assert("agent" in top);
  assert("skill" in top);
});

// H3: ToolContext.emit — see task-h3-brief.md. The session path publishes a
// live tool.event and persists a `custom` step through the SAME stepSeq
// counter as every other step (asserted via the raw insert params here), so
// every persisted step this turn — including this one — has a unique,
// monotonically assigned seq and replays in real call order.
Deno.test("ToolContext.emit publishes a live tool.event and persists a custom step", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.emitter = {
    description: "emits a custom progress event",
    inputSchema: { type: "object", properties: {} },
    execute: (_input: unknown, ctx?: { emit?: (name: string, data: unknown) => void }) => {
      ctx?.emit?.("progress", { step: 1 });
      return Promise.resolve({ ok: true });
    },
  };
  const inserted: Array<{ seq: number; kind: string; name: string | null; payload: unknown }> = [];
  const fn = (sql: string, params: unknown[] = []) => {
    if (sql.includes("RETURNING id, seq")) return Promise.resolve({ rows: [{ id: "t-1", seq: 1 }] });
    if (sql.includes("INSERT INTO agents.steps")) {
      inserted.push({ seq: params[1] as number, kind: params[2] as string, name: params[3] as string | null, payload: params[4] });
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  };
  const store = createStore(fn as never);
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "go", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("emitter", {}), textChunks("done")),
  });

  const live = events.find((e) => e.type === "tool.event") as { data: { name: string; payload: unknown } } | undefined;
  assert(live, "expected a live tool.event");
  assertEquals(live.data, { name: "progress", payload: { step: 1 } });

  const persisted = inserted.find((s) => s.kind === "custom");
  assert(persisted, "expected a persisted custom step");
  assertEquals(persisted!.name, "progress");
  assertEquals(persisted!.payload, JSON.stringify({ step: 1 }));

  // toolEmit shares the runner's single stepSeq counter, not a side
  // channel: every persisted step this turn has a distinct seq (no
  // collision with the surrounding tool-call/tool-result/text/finish
  // steps). NOTE: the custom step's seq is NOT guaranteed to fall between
  // its own tool-call and tool-result — the AI SDK invokes tool.execute()
  // as part of its own internal step processing, which can complete before
  // this loop's `await persist("tool-call", ...)` for the very call that
  // triggered it (verified empirically with this synchronous mock tool);
  // only seq-uniqueness/monotonicity is a runner.ts guarantee (see
  // runner.ts's toolEmit comment).
  const seqs = inserted.map((s) => s.seq);
  assertEquals(new Set(seqs).size, seqs.length, `duplicate seq: [${inserted.map((s) => `${s.kind}#${s.seq}`).join(", ")}]`);
});

// A tool that never calls ctx.emit (every other toy-agent tool, and the toy
// agent's own eve-eval-covered echo tool) must not produce a tool.event —
// the channel is opt-in per tool, not automatic.
Deno.test("a tool that never calls ctx.emit produces no tool.event", async () => {
  const agent = await loadAgent(TOY);
  const { store } = memoryStoreCalls();
  const events: AgentEvent[] = [];
  await runTurn({
    agent, sessionId: "s-1", turnId: "t-1", history: [],
    message: "echo", store, emit: (e) => events.push(e),
    model: sequencedModel(toolCallChunks("echo", { text: "hi" }), textChunks("done")),
  });
  assert(!events.some((e) => e.type === "tool.event"));
});

// H4 (sticky tool-consent decisions — task-h4-brief.md): authoredTool's
// needsApproval branch checks store.getToolConsent(userId, plugin, agent,
// tool) BEFORE creating a one-shot approval request.
Deno.test("needsApproval tool with an 'always' consent on file executes immediately, no approval request", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.guarded = {
    description: "guarded", inputSchema: { type: "object", properties: {} },
    needsApproval: true,
    execute: () => Promise.resolve({ ran: true }),
  };
  const { buildSdkTools } = await import("./toolset.ts");
  const consents = new Map([["user-1|toy-agent|toy|guarded", "always"]]);
  const store = {
    getToolConsent: (userId: string, plugin: string, agentName: string, tool: string) =>
      Promise.resolve(consents.get(`${userId}|${plugin}|${agentName}|${tool}`) ?? null),
    // Any call into the one-shot approval flow is a bug for this test.
    createApproval: () => Promise.reject(new Error("should not create an approval request")),
  };
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", depth: 0, userId: "user-1", plugin: "toy-agent", agentName: "toy",
    // deno-lint-ignore no-explicit-any
    store: store as any,
  });
  const result = await (tools.guarded as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(result, { ran: true });
});

Deno.test("needsApproval tool with a 'never' consent on file is denied immediately, no approval request", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.guarded = {
    description: "guarded", inputSchema: { type: "object", properties: {} },
    needsApproval: true,
    execute: () => Promise.resolve({ ran: true }),
  };
  const { buildSdkTools } = await import("./toolset.ts");
  const store = {
    getToolConsent: () => Promise.resolve("never" as const),
    createApproval: () => Promise.reject(new Error("should not create an approval request")),
  };
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", depth: 0, userId: "user-1", plugin: "toy-agent", agentName: "toy",
    // deno-lint-ignore no-explicit-any
    store: store as any,
  });
  const result = await (tools.guarded as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(result, { error: "denied by user" });
});

Deno.test("needsApproval tool with no consent on file falls through to the one-shot approval flow", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.guarded = {
    description: "guarded", inputSchema: { type: "object", properties: {} },
    needsApproval: true,
    execute: () => Promise.resolve({ ran: true }),
  };
  const { buildSdkTools } = await import("./toolset.ts");
  let created = false;
  const store = {
    getToolConsent: () => Promise.resolve(null),
    createApproval: () => {
      created = true;
      return Promise.resolve("r-1");
    },
    getApprovalDecision: () => Promise.resolve("approve"),
  };
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", turnId: "t-1", depth: 0, userId: "user-1", plugin: "toy-agent", agentName: "toy",
    emit: () => {}, approvalPollMs: 5,
    // deno-lint-ignore no-explicit-any
    store: store as any,
  });
  const result = await (tools.guarded as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assert(created, "expected createApproval to be called");
  assertEquals(result, { ran: true });
});

Deno.test("needsApproval tool with no userId skips the sticky lookup entirely (anonymous session)", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.guarded = {
    description: "guarded", inputSchema: { type: "object", properties: {} },
    needsApproval: true,
    execute: () => Promise.resolve({ ran: true }),
  };
  const { buildSdkTools } = await import("./toolset.ts");
  const store = {
    getToolConsent: () => Promise.reject(new Error("should not be called without a userId")),
    createApproval: () => Promise.resolve("r-1"),
    getApprovalDecision: () => Promise.resolve("approve"),
  };
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", turnId: "t-1", depth: 0, plugin: "toy-agent", agentName: "toy",
    emit: () => {}, approvalPollMs: 5,
    // deno-lint-ignore no-explicit-any
    store: store as any,
  });
  const result = await (tools.guarded as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(result, { ran: true });
});

Deno.test("built-in agent tool guards subagent lookup against prototype-polluting names", async () => {
  // "__proto__"/"constructor" resolve through the prototype chain on a
  // plain `subagents[name]` lookup (returning Object.prototype/Function
  // itself, not undefined) — must fall into the ordinary "unknown
  // subagent" result instead of crashing the turn on a bogus target.
  const agent = await loadAgent(TOY);
  const { buildSdkTools } = await import("./toolset.ts");
  const tools = await buildSdkTools({ agent, sessionId: "s-1", depth: 0 });
  const agentTool = tools.agent as { execute: (input: unknown) => Promise<unknown> };
  for (const bogus of ["__proto__", "constructor"]) {
    const result = await agentTool.execute({ agent: bogus, prompt: "hi" });
    assertEquals(result, { error: `unknown subagent "${bogus}"`, available: Object.keys(agent.subagents) });
  }
});

// Adjudicated core fix: ToolContext.sql must be restricted to authored
// (static agent.tools) tools. A provider-sourced (dynamic-tools.ts/MCP) tool
// is less trusted than a static, code-reviewed authored tool, so it must not
// get a live Postgres query function — see authoredTool's `isAuthored` param
// in toolset.ts.
Deno.test("authored tools get ToolContext.sql; provider-sourced (dynamic-tools) tools do not", async () => {
  const agent = await loadAgent(TOY);
  agent.tools.authoredEcho = {
    description: "authored tool reporting whether ctx.sql is wired",
    inputSchema: { type: "object", properties: {} },
    execute: (_input: unknown, ctx?: { sql?: unknown }) => Promise.resolve({ hasSql: typeof ctx?.sql === "function" }),
  };
  agent.toolProvider = () =>
    Promise.resolve({
      dynamicEcho: {
        description: "provider-sourced tool reporting whether ctx.sql is wired",
        inputSchema: { type: "object", properties: {} },
        execute: (_input: unknown, ctx?: { sql?: unknown }) => Promise.resolve({ hasSql: typeof ctx?.sql === "function" }),
      },
    });
  const { buildSdkTools } = await import("./toolset.ts");
  const tools = await buildSdkTools({
    agent, sessionId: "s-1", depth: 0,
    hookCtx: { sessionId: "s-1", env: () => undefined, sql: (_q: string) => Promise.resolve({ rows: [] }) },
  });

  const authoredResult = await (tools.authoredEcho as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(authoredResult, { hasSql: true });

  const dynamicResult = await (tools.dynamicEcho as { execute: (input: unknown) => Promise<unknown> }).execute({});
  assertEquals(dynamicResult, { hasSql: false });
});
