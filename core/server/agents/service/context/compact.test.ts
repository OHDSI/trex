import { assert, assertEquals } from "jsr:@std/assert";
import { buildSummarizationRequest, maybeCompact, summarize, SUMMARIZATION_PROMPT } from "./compact.ts";
import { DEFAULT_CONTEXT_CONFIG } from "./budget.ts";

Deno.test("summarization prompt is the checkpoint handoff prompt", () => {
  assert(SUMMARIZATION_PROMPT.includes("CONTEXT CHECKPOINT COMPACTION"));
  // Brief's own test used lowercase "what"; the prompt text the brief
  // specifies (byte-identical here) capitalizes it as a bullet heading.
  assert(SUMMARIZATION_PROMPT.includes("What remains to be done"));
});

Deno.test("buildSummarizationRequest honours a per-agent prompt override", () => {
  const req = buildSummarizationRequest([], { ...DEFAULT_CONTEXT_CONFIG, summarizationPrompt: "CUSTOM" });
  assertEquals(req.system, "CUSTOM");
});

Deno.test("summarize returns the model's summary text", async () => {
  const out = await summarize([{ role: "user", content: "hi" }], DEFAULT_CONTEXT_CONFIG,
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
