// Context-checkpoint summarization: builds the request that asks a model for
// a handoff summary of the turns being compacted away, and runs it. See
// prompts.ts for why SUMMARIZATION_PROMPT/SUMMARY_PREFIX live outside this
// file (avoiding a circular import with history.ts).
import type { ModelMessage } from "./history.ts";
import type { ContextConfig } from "./budget.ts";
import { SUMMARIZATION_PROMPT, SUMMARY_PREFIX } from "./prompts.ts";

// Re-exported so this module's own public surface still carries both
// constants, matching what callers of a "summarization module" expect to
// find here — the split into prompts.ts is an internal-import-cycle
// concern, not a change to compact.ts's API.
export { SUMMARIZATION_PROMPT, SUMMARY_PREFIX };

export function buildSummarizationRequest(
  msgs: ModelMessage[],
  config: ContextConfig,
): { system: string; messages: ModelMessage[] } {
  return { system: config.summarizationPrompt ?? SUMMARIZATION_PROMPT, messages: msgs };
}

export async function summarize(
  msgs: ModelMessage[],
  config: ContextConfig,
  callModel: (req: { system: string; messages: ModelMessage[] }) => Promise<string>,
): Promise<string> {
  return await callModel(buildSummarizationRequest(msgs, config));
}
