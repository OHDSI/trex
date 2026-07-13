import { defineEvalConfig } from "eve/evals";
import { buildBedrockJudgeModel } from "./lib/judge-model.ts";

// Default judge model for `t.judge.autoevals.*` assertions across every eval
// (currently just quality/*.eval.ts) — see evals/lib/judge-model.ts for why
// this is a runner-side (Node) Bedrock client, distinct from the
// container-side agent-under-test's own Bedrock wiring.
export default defineEvalConfig({
  judge: { model: buildBedrockJudgeModel() },
});
