import { defineEvalConfig } from "eve/evals";

// No judge model wired yet: claw's behavioral evals assert tool-call DECISIONS
// (succeeded / notCalledTool), which are deterministic and need no LLM judge.
// Add `judge: { model: ... }` here if a quality eval (e.g. "was the clarifying
// question actually focused?") is added later — see the devx suite's
// evals/lib/judge-model.ts for the runner-side Bedrock judge pattern.
export default defineEvalConfig({});
