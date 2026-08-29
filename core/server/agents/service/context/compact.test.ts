import { assert, assertEquals } from "jsr:@std/assert";
import { buildSummarizationRequest, flattenForSummary, maybeCompact, summarize } from "./compact.ts";
import { SUMMARIZATION_PROMPT } from "./prompts.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./budget.ts";

Deno.test("summarization prompt is the checkpoint handoff prompt", () => {
  assert(SUMMARIZATION_PROMPT.includes("CONTEXT CHECKPOINT COMPACTION"));
  // Brief's own test used lowercase "what"; the prompt text the brief
  // specifies (byte-identical here) capitalizes it as a bullet heading.
  assert(SUMMARIZATION_PROMPT.includes("What remains to be done"));
});

Deno.test("buildSummarizationRequest honours a per-agent prompt override", () => {
  const req = buildSummarizationRequest("transcript", { ...DEFAULT_CONTEXT_CONFIG, summarizationPrompt: "CUSTOM" });
  assertEquals(req.system, "CUSTOM");
});

Deno.test("summarize returns the model's summary text", async () => {
  const out = await summarize("User: hi", DEFAULT_CONTEXT_CONFIG,
    () => Promise.resolve("did X, next do Y"));
  assertEquals(out, "did X, next do Y");
});

// The brief's own tests use modelId "claude-sonnet-5", assuming it resolves to
// a ~200k-token window. budget.ts's real CONTEXT_WINDOWS (task 2, already
// built) maps claude-sonnet-5 to 1,000,000 — at that size a 0.75 fraction
// threshold is 750,000 tokens, so an observedInputTokens of 190,000 would
// never trigger compaction and every test below would fail on
// `out.compacted`. "claude-haiku-4-5" is the entry that actually resolves to
// 200,000 in budget.ts today, which is also what the oversized-summary test's
// own comment assumes ("200k window * 0.25 * 4 = 200k chars") — swapped in
// here so the brief's numbers are consistent with the real, already-reviewed
// budget.ts instead of a stale assumption about the model catalog.
const MODEL_ID = "claude-haiku-4-5";

Deno.test("maybeCompact does nothing below the threshold", async () => {
  const out = await maybeCompact({
    turns: [], msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 1_000, callModel: () => Promise.reject(new Error("must not be called")),
  });
  assertEquals(out, { compacted: false });
});

Deno.test("maybeCompact summarizes above the threshold", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000, callModel: () => Promise.resolve("summary text"),
  });
  assertEquals(out.compacted, true);
  assertEquals((out as { via: string }).via, "summary");
});

// The ContextConfig.compactAtTokens ceiling has to reach shouldCompact through
// maybeCompact, not just be honoured by shouldCompact in isolation. On the 1M
// window below, 0.75 alone would not fire until 750k input tokens.
const BIG_WINDOW_MODEL_ID = "claude-sonnet-5";

Deno.test("maybeCompact honours a compactAtTokens ceiling below the fraction", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: { ...DEFAULT_CONTEXT_CONFIG, compactAtTokens: 200_000 },
    modelId: BIG_WINDOW_MODEL_ID,
    observedInputTokens: 200_000, callModel: () => Promise.resolve("summary text"),
  });
  assertEquals(out.compacted, true);
});

Deno.test("maybeCompact without a ceiling still waits for the fraction", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG,
    modelId: BIG_WINDOW_MODEL_ID,
    observedInputTokens: 200_000, callModel: () => Promise.reject(new Error("must not be called")),
  });
  assertEquals(out, { compacted: false });
});

Deno.test("maybeCompact falls back to dropping turns when summarization fails", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000, callModel: () => Promise.reject(new Error("502")),
  });
  assertEquals(out.compacted, true);
  assertEquals((out as { via: string }).via, "drop");
});

// The estimate fallback is the live path for a session's first turn and for
// every session persisted before lastStepInputTokens existed. It measured the
// assembled messages alone, so it under-counted the real prefill by the whole
// system-prompt-plus-tool-schemas prefix. observedInputTokens is the
// provider's own count for the final request and ALREADY includes that
// prefix, so the term must apply to the fallback only — adding it to both
// would double-count.
Deno.test("maybeCompact adds prefixTokens to the estimate fallback", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }], // a few tokens on its own
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID, // 200k window, 0.75 -> 150k
    prefixTokens: 150_000,
    callModel: () => Promise.resolve("summary text"),
  });
  assertEquals(out.compacted, true);
});

Deno.test("maybeCompact without prefixTokens is unchanged", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    callModel: () => Promise.reject(new Error("must not be called")),
  });
  assertEquals(out, { compacted: false });
});

Deno.test("maybeCompact ignores prefixTokens when the provider reported usage", async () => {
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    // The provider's own count already includes the system prompt and tool
    // schemas; 1_000 is comfortably under the 150k trigger and must stay so.
    observedInputTokens: 1_000, prefixTokens: 150_000,
    callModel: () => Promise.reject(new Error("must not be called")),
  });
  assertEquals(out, { compacted: false });
});

Deno.test("maybeCompact caps an oversized summary", async () => {
  const huge = "s".repeat(4_000_000); // ~1M tokens, larger than any window
  const out = await maybeCompact({
    turns: [{ seq: 1, message: "a", metadata: null, steps: [] }],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000, callModel: () => Promise.resolve(huge),
  });
  const summary = (out as { summary: string }).summary;
  // 200k window * 0.25 summary allowance * 4 chars/token = 200k chars
  assert(summary.length <= 200_000, `summary not capped: ${summary.length}`);
  assert(summary.includes("original length: 4000000 chars"));
});

// --- Summarization input ----------------------------------------------------
// Two defects, one fix. (1) The summarization call declares no `tools`, so
// passing the structured messages handed a provider tool-call/tool-result
// blocks for tools it was never told about — Anthropic rejects that, and the
// rejection was swallowed into the drop fallback, meaning the summarizer would
// never actually have run. (2) It summarized the ENTIRE history, including the
// turns kept verbatim right below the summary, contradicting this module's own
// header comment and wasting the budget compaction exists to reclaim.

const turn = (seq: number, message: string, steps: Array<Record<string, unknown>> = []) =>
  ({ seq, message, metadata: null, steps }) as never;

Deno.test("flattenForSummary emits no structured tool blocks, only plain text", () => {
  const text = flattenForSummary([
    { role: "user", content: "read config.ts" },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "Read", input: { path: "config.ts" } }] },
    {
      role: "tool",
      content: [{ type: "tool-result", toolCallId: "c1", toolName: "Read", output: { type: "text", value: "PORT = 8080" } }],
    },
    { role: "assistant", content: [{ type: "text", text: "It sets PORT." }] },
  ]);
  assertEquals(typeof text, "string");
  assert(text.includes("read config.ts"));
  assert(text.includes("Read"), "the tool name must survive flattening");
  assert(text.includes("PORT = 8080"), "the tool output must survive flattening");
  assert(!text.includes('"value"'), "the ToolResultOutput envelope leaked into the transcript");
  assert(text.includes("It sets PORT."));
});

Deno.test("buildSummarizationRequest sends one plain user message, no tool parts", () => {
  const req = buildSummarizationRequest("User: hi\nAssistant: hello", DEFAULT_CONTEXT_CONFIG);
  assertEquals(req.messages.length, 1);
  assertEquals(req.messages[0].role, "user");
  assertEquals(req.messages[0].content, "User: hi\nAssistant: hello");
  // Nothing a tools-less generateText call could be rejected for.
  assert(!JSON.stringify(req.messages).includes("tool-call"));
  assert(!JSON.stringify(req.messages).includes("tool-result"));
});

Deno.test("maybeCompact summarizes ONLY the turns being compacted away", async () => {
  // 5 turns, verbatimTurnsAfterCompaction 3 -> cutoff 2, so turns 1-2 are
  // compacted and turns 3-5 survive verbatim.
  const turns = [
    turn(1, "OLDEST-ONE"),
    turn(2, "OLDEST-TWO"),
    turn(3, "KEPT-THREE"),
    turn(4, "KEPT-FOUR"),
    turn(5, "KEPT-FIVE"),
  ];
  let seen = "";
  const out = await maybeCompact({
    turns,
    msgs: [{ role: "user", content: "irrelevant" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000,
    callModel: (req) => {
      seen = JSON.stringify(req.messages);
      return Promise.resolve("summary text");
    },
  });
  assertEquals((out as { replacedTurnSeqTo: number }).replacedTurnSeqTo, 2);
  assert(seen.includes("OLDEST-ONE"), "the compacted turns must reach the summarizer");
  assert(seen.includes("OLDEST-TWO"), "the compacted turns must reach the summarizer");
  for (const kept of ["KEPT-THREE", "KEPT-FOUR", "KEPT-FIVE"]) {
    assert(!seen.includes(kept), `${kept} survives verbatim and must NOT also be summarized`);
  }
});

Deno.test("maybeCompact sends the summarizer plain text, never tool blocks", async () => {
  const turns = [
    turn(1, "read it", [
      { kind: "tool-call", name: "Read", payload: { toolCallId: "c1", input: { path: "a.ts" } } },
      { kind: "tool-result", name: "Read", payload: { toolCallId: "c1", output: "SECRET-OUTPUT" } },
    ]),
    turn(2, "next"),
  ];
  let seen: unknown = null;
  await maybeCompact({
    turns,
    msgs: [{ role: "user", content: "irrelevant" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000,
    callModel: (req) => {
      seen = req.messages;
      return Promise.resolve("summary text");
    },
  });
  const serialized = JSON.stringify(seen);
  assert(!serialized.includes('"type":"tool-call"'), "structured tool-call parts reached a tools-less request");
  assert(!serialized.includes('"type":"tool-result"'), "structured tool-result parts reached a tools-less request");
  // Flattened, but the substance is still there for the summarizer to use.
  assert(serialized.includes("SECRET-OUTPUT"));
  assert(serialized.includes("Read"));
});

// --- Warning event ----------------------------------------------------------
// Spec error table: "Summarization call fails ... Emit a warning event." Only
// a console.warn existed, which nobody watching the session ever sees.

Deno.test("maybeCompact emits a warning event when summarization fails", async () => {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const out = await maybeCompact({
    turns: [turn(1, "a")],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000,
    callModel: () => Promise.reject(new Error("provider said 400")),
    emit: (e) => events.push(e as never),
  });
  assertEquals((out as { via: string }).via, "drop");
  const warn = events.find((e) => e.type === "context.compacted");
  assert(warn, `no context.compacted event emitted; got ${JSON.stringify(events)}`);
  assertEquals(warn.data.via, "drop");
  assertEquals(warn.data.replacedTurnSeqTo, 1);
  assert(String(warn.data.warning).includes("provider said 400"), "the event must carry why summarization failed");
});

Deno.test("maybeCompact emits a non-warning event on a successful summary", async () => {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  await maybeCompact({
    turns: [turn(1, "a")],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000,
    callModel: () => Promise.resolve("summary text"),
    emit: (e) => events.push(e as never),
  });
  const ev = events.find((e) => e.type === "context.compacted");
  assert(ev);
  assertEquals(ev.data.via, "summary");
  assertEquals(ev.data.warning, undefined);
});

Deno.test("maybeCompact emits nothing when it does not compact", async () => {
  const events: unknown[] = [];
  await maybeCompact({
    turns: [turn(1, "a")],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 1_000,
    callModel: () => Promise.reject(new Error("must not be called")),
    emit: (e) => events.push(e),
  });
  assertEquals(events, []);
});

// A throwing subscriber must never turn a successful summarization into a
// drop, nor a successful drop-fallback into a thrown compaction.
Deno.test("a throwing emit subscriber does not change the compaction outcome", async () => {
  const boom = () => { throw new Error("subscriber exploded"); };
  const ok = await maybeCompact({
    turns: [turn(1, "a")],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000, callModel: () => Promise.resolve("summary text"),
    emit: boom,
  });
  assertEquals((ok as { via: string }).via, "summary");
  assertEquals((ok as { summary: string }).summary, "summary text");

  const dropped = await maybeCompact({
    turns: [turn(1, "a")],
    msgs: [{ role: "user", content: "hi" }],
    config: DEFAULT_CONTEXT_CONFIG, modelId: MODEL_ID,
    observedInputTokens: 190_000, callModel: () => Promise.reject(new Error("502")),
    emit: boom,
  });
  assertEquals((dropped as { via: string }).via, "drop");
});
