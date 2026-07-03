// Resolves eve/AI-Gateway-style model strings ("provider/model-id") to AI SDK
// models using trex-configured credentials from env. Consolidates the two
// hand-rolled provider setups in devx (functions/agent.ts createModel) and
// Pythia (sdk.cljs).
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

export function parseModelString(s: string): { provider: string; modelId: string } {
  const i = s.indexOf("/");
  if (i <= 0 || i === s.length - 1) {
    throw new Error(`agents: model must be "provider/model-id", got "${s}"`);
  }
  return { provider: s.slice(0, i), modelId: s.slice(i + 1) };
}

type EnvFn = (k: string) => string | undefined;

// deno-lint-ignore no-explicit-any
export function resolveModel(modelString?: string, env: EnvFn = (k) => Deno.env.get(k)): any {
  const s = modelString || env("TREX_AGENTS_DEFAULT_MODEL");
  if (!s) {
    throw new Error(
      "agents: no model configured — set model in agent.ts (defineAgent) or TREX_AGENTS_DEFAULT_MODEL",
    );
  }
  const { provider, modelId } = parseModelString(s);
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey: env("ANTHROPIC_API_KEY") })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey: env("GOOGLE_GENERATIVE_AI_API_KEY") })(modelId);
    case "bedrock":
      return bedrockModel(modelId, env);
    case "openai":
    default: {
      // openai and openai-compatible (custom base url)
      const baseURL = env("OPENAI_BASE_URL");
      return createOpenAI({ apiKey: env("OPENAI_API_KEY"), ...(baseURL ? { baseURL } : {}) })(modelId);
    }
  }
}

// deno-lint-ignore no-explicit-any
function bedrockModel(modelId: string, env: EnvFn): any {
  // deno-lint-ignore no-explicit-any
  const config: Record<string, any> = { region: env("AWS_REGION") || "us-east-1" };
  const bearerToken = env("AWS_BEARER_TOKEN_BEDROCK") || "";
  if (bearerToken) {
    // Bearer-token auth: dummy static credentials bypass SigV4, a custom fetch
    // injects the Authorization header. Bedrock also rejects assistant messages
    // whose content is toolUse-only, which happens in multi-step tool calling —
    // patch a "." text part in. Lifted from plugins/devx/functions/agent.ts.
    config.accessKeyId = "bearer-token-auth";
    config.secretAccessKey = "bearer-token-auth";
    const origFetch = globalThis.fetch;
    config.fetch = (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${bearerToken}`);
      let body = init?.body;
      if (body && typeof body === "string") {
        try {
          const parsed = JSON.parse(body);
          if (parsed.messages) {
            for (const msg of parsed.messages) {
              if (msg.role === "assistant" && Array.isArray(msg.content)) {
                const hasText = msg.content.some((p: { text?: unknown }) => p.text != null);
                const hasToolUse = msg.content.some((p: { toolUse?: unknown }) => p.toolUse != null);
                if (hasToolUse && !hasText) msg.content.unshift({ text: "." });
              }
            }
            body = JSON.stringify(parsed);
          }
        } catch { /* non-JSON body — leave untouched */ }
      }
      return origFetch(url, { ...init, body, headers });
    };
  }
  return createAmazonBedrock(config)(modelId);
}
