// Checkpoint-compaction prompt text, shared by compact.ts (builds the
// summarization request) and history.ts (frames the summary back into
// assembled history). Kept in its own module, imported by BOTH, so neither
// of those two needs to import the other's runtime values — compact.ts
// already imports history.ts's `ModelMessage` type, and a reverse runtime
// import from history.ts back into compact.ts would be a circular import
// (tolerated today only because a type-only import erases at build time,
// which is one refactor away from breaking).
export const SUMMARIZATION_PROMPT =
  `You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.`;

export const SUMMARY_PREFIX =
  `Another language model started to solve this problem and produced a summary of its thinking process. You also have access to the state of the tools that were used by that language model. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis: `;
