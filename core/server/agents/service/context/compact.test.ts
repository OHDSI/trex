import { assert, assertEquals } from "jsr:@std/assert";
import { buildSummarizationRequest, summarize, SUMMARIZATION_PROMPT } from "./compact.ts";
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
