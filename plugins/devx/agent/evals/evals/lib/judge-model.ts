import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { LanguageModel } from "ai";

// Runner-side judge model for `t.judge.autoevals.*` assertions (quality/).
// This runs in the Node process executing `npm run eval` — NOT inside the
// trex container — so it needs its own credentials in this process's env,
// separate from (but sourced from the same secret as) the container-side
// agent-under-test's Bedrock wiring documented in the README's "Model auth
// setup" section.
//
// Only credential available anywhere in this environment is the Bedrock
// bearer token (AWS_BEARER_TOKEN_BEDROCK); there is no Anthropic/OpenAI key.
// This replicates the bearer-token auth path from
// core/server/agents/service/model.ts's bedrockModel() (dummy static
// credentials bypass SigV4; a custom fetch injects the Authorization
// header) for this package's Node/npm context.
const JUDGE_MODEL_ID = process.env.EVE_JUDGE_MODEL_ID || "us.anthropic.claude-sonnet-4-6";

// NOTE: evals.config.ts is loaded unconditionally for every `npm run eval`
// invocation, including families that never touch `t.judge.*` (tools/,
// modes/, smoke/, subagents/). So this must NOT throw at construction time
// just because AWS_BEARER_TOKEN_BEDROCK is unset in the runner's shell —
// that would break every non-quality family too. The token is read lazily
// inside the per-request `fetch` override instead; a missing token only
// surfaces as an auth failure on the actual judge call (quality/* evals),
// which the assertion collector already turns into a clear failed-assertion
// message (see judge.js's settleEntry catch).
export function buildBedrockJudgeModel(): LanguageModel {
  const region = process.env.AWS_REGION || "us-east-1";
  const bedrock = createAmazonBedrock({
    region,
    // Bearer-token auth: dummy static credentials bypass SigV4, a custom
    // fetch injects the real Authorization header below.
    accessKeyId: "bearer-token-auth",
    secretAccessKey: "bearer-token-auth",
    fetch: (url, init) => {
      const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
      if (!bearerToken) {
        throw new Error(
          "quality evals need a judge model: set AWS_BEARER_TOKEN_BEDROCK in the environment " +
            "(see README 'Model auth setup — Bedrock bearer token'; export it from ./.env before " +
            "`npm run eval`).",
        );
      }
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${bearerToken}`);
      return fetch(url, { ...init, headers });
    },
  });
  return bedrock(JUDGE_MODEL_ID);
}
