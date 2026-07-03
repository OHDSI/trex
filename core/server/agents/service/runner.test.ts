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
  assert(events.some((e) => e.type === "text-delta"));
  const finish = events.find((e) => e.type === "turn-finish");
  assert(finish && (finish as { usage: { outputTokens?: number } }).usage.outputTokens === 1);
  assert(calls.some((c) => c.startsWith("INSERT INTO agents.steps")));
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
  const call = events.find((e) => e.type === "tool-call") as { clientOnly?: boolean; toolName: string };
  assert(call);
  assertEquals(call.toolName, "propose_card");
  assertEquals(call.clientOnly, true);
  assert(!events.some((e) => e.type === "tool-result")); // never executed
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
  assert(events.some((e) => e.type === "approval-request"));
  assert(events.some((e) => e.type === "tool-result"));
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
  const result = events.find((e) => e.type === "tool-result") as { output?: { content?: string } };
  assert(result, "skill tool should have executed");
  assert(String((result as { output: unknown }).output).includes("Ahoy") ||
    JSON.stringify((result as { output: unknown }).output).includes("Ahoy"));
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
  const result = events.find((e) => e.type === "tool-result");
  assert(JSON.stringify((result as { output: unknown }).output).includes("greeting-style"));
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
  const result = events.find(
    (e) => e.type === "tool-result" && (e as { toolName: string }).toolName === "agent",
  ) as { output?: { text?: string } };
  assert(result, "agent tool should have executed");
  assertEquals(result.output?.text, "BANANA");
});

Deno.test("subagent runs do not get a nested agent tool (one level only)", async () => {
  const agent = await loadAgent(TOY);
  const { buildSdkTools } = await import("./toolset.ts");
  const nested = buildSdkTools({ agent: agent.subagents.shouter, sessionId: "s-1", depth: 1 });
  assert(!("agent" in nested));
  const top = buildSdkTools({ agent, sessionId: "s-1", depth: 0 });
  assert("agent" in top);
  assert("skill" in top);
});
