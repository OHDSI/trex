// Resolves eve/AI-Gateway-style model strings ("provider/model-id") to AI SDK
// models using trex-configured credentials from env. Consolidates the two
// hand-rolled provider setups in devx (functions/agent.ts createModel) and
// Pythia (sdk.cljs).
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { AgentConfig, HookCtx, ModelSpec } from "../eve-shim/types.ts";

export function parseModelString(s: string): { provider: string; modelId: string } {
  const i = s.indexOf("/");
  if (i <= 0 || i === s.length - 1) {
    throw new Error(`agents: model must be "provider/model-id", got "${s}"`);
  }
  return { provider: s.slice(0, i), modelId: s.slice(i + 1) };
}

type EnvFn = (k: string) => string | undefined;

const defaultEnv: EnvFn = (k) => Deno.env.get(k);

// deno-lint-ignore no-explicit-any
export function resolveModel(modelString?: string, env: EnvFn = defaultEnv): any {
  const s = modelString || env("TREX_AGENTS_DEFAULT_MODEL");
  if (!s) {
    throw new Error(
      "agents: no model configured — set model in agent.ts (defineAgent) or TREX_AGENTS_DEFAULT_MODEL",
    );
  }
  const { provider, modelId } = parseModelString(s);
  return buildModel(provider, modelId, {}, env);
}

// Same provider constructors as resolveModel, but credentials come from the
// spec when present, env otherwise. Used by the resolveModel hook's
// ModelSpec-returning path (see resolveModelForTurn below) — kept separate
// from resolveModel because a ModelSpec is already parsed (no "provider/id"
// string to split) and never falls back to TREX_AGENTS_DEFAULT_MODEL.
// deno-lint-ignore no-explicit-any
export function resolveModelSpec(spec: ModelSpec, env: EnvFn = defaultEnv): any {
  return buildModel(spec.provider, spec.modelId, { apiKey: spec.apiKey, baseURL: spec.baseURL }, env);
}

interface Creds {
  apiKey?: string;
  baseURL?: string;
}

// deno-lint-ignore no-explicit-any
function buildModel(provider: string, modelId: string, creds: Creds, env: EnvFn): any {
  switch (provider) {
    case "anthropic":
      return createAnthropic({
        apiKey: creds.apiKey ?? env("ANTHROPIC_API_KEY"),
        ...(creds.baseURL ? { baseURL: creds.baseURL } : {}),
      })(modelId);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: creds.apiKey ?? env("GOOGLE_GENERATIVE_AI_API_KEY"),
        ...(creds.baseURL ? { baseURL: creds.baseURL } : {}),
      })(modelId);
    case "bedrock":
      // A spec apiKey is used as the bearer token (bedrock has no plain
      // apiKey concept — see bedrockModel's bearer-token auth path).
      return bedrockModel(modelId, env, creds.apiKey);
    case "openai":
    default: {
      // openai and openai-compatible (custom base url)
      const baseURL = creds.baseURL ?? env("OPENAI_BASE_URL");
      return createOpenAI({ apiKey: creds.apiKey ?? env("OPENAI_API_KEY"), ...(baseURL ? { baseURL } : {}) })(modelId);
    }
  }
}

// Resolution order for a single turn/chat request (spec H1): config.resolveModel
// hook wins when present — its rejection propagates (never falls back to
// config.model / env credentials, a wrong-account risk) — else the existing
// config.model → resolveModel(...) path. Called per request, never cached.
export async function resolveModelForTurn(
  config: AgentConfig,
  hookCtx?: HookCtx,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  if (config.resolveModel) {
    if (!hookCtx) {
      throw new Error("agents: resolveModel hook configured but no request context (hookCtx) available");
    }
    const result = await config.resolveModel(hookCtx);
    return typeof result === "string" ? resolveModel(result, hookCtx.env) : resolveModelSpec(result, hookCtx.env);
  }
  return resolveModel(config.model, hookCtx?.env);
}

// deno-lint-ignore no-explicit-any
function bedrockModel(modelId: string, env: EnvFn, bearerTokenOverride?: string): any {
  // deno-lint-ignore no-explicit-any
  const config: Record<string, any> = { region: env("AWS_REGION") || "us-east-1" };
  const bearerToken = bearerTokenOverride || env("AWS_BEARER_TOKEN_BEDROCK") || "";
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

// Task 15: Bedrock prompt caching for the stable TOOLS+SYSTEM prefix.
// `model.provider` ("amazon-bedrock" — verified against the installed
// @ai-sdk/amazon-bedrock@4.0.133's bedrock-chat-language-model.ts: `readonly
// provider = 'amazon-bedrock'`) is the only signal callers have for which
// wire format streamText will use; there's no separate "is this bedrock"
// flag threaded through resolveModelForTurn/resolveModel. Gate on it here so
// model objects of other providers are left completely untouched by the
// caller — see withSystemCachePoint (anthropic gets its own cacheControl
// branch via isAnthropicModel below; openai/google stay plain strings).
// deno-lint-ignore no-explicit-any
export function isBedrockModel(model: any): boolean {
  return model?.provider === "amazon-bedrock";
}

// Bedrock prompt caching is model-specific, not provider-wide: Anthropic Claude
// on Bedrock supports it, but other Bedrock models (e.g. Z.AI `zai.glm-*`)
// reject ANY request that carries a `cachePoint` with
// `AccessDeniedException: "You invoked an unsupported model or your request did
// not allow prompt caching."` — which, on a streaming turn, kills it silently
// (typing indicator, no reply). So `isBedrockModel` alone is too broad a gate
// for the cachePoint injection below: additionally require an Anthropic model
// id. The tools -> system -> messages ordering this caching relies on (see
// withSystemCachePoint) is Anthropic's Converse layout, which is exactly what
// it was designed and verified against; non-Anthropic Bedrock models are
// invoked plain (no cache point).
// deno-lint-ignore no-explicit-any
export function bedrockSupportsPromptCaching(model: any): boolean {
  return isBedrockModel(model) && /(^|\.)anthropic\./i.test(model?.modelId ?? "");
}

// The direct Anthropic provider. Its language-model objects report
// provider === "anthropic.messages" — NOT "anthropic" — verified against the
// installed @ai-sdk/anthropic@4.0.15: createAnthropic's providerName defaults
// to "anthropic.messages" and is passed through as the model's `provider`
// (and confirmed at runtime via a stub-fetch streamText probe). The
// providerOptions key it reads cacheControl from is still the plain
// "anthropic" (get-cache-control.ts reads providerMetadata.anthropic), so
// only this predicate — not the marker below — uses the dotted name.
// deno-lint-ignore no-explicit-any
export function isAnthropicModel(model: any): boolean {
  return model?.provider === "anthropic.messages";
}

// deno-lint-ignore no-explicit-any
export function isOpenAIModel(model: any): boolean {
  // @ai-sdk/openai language models report provider "openai.responses" (default
  // callable) or "openai.chat"; a custom baseURL (e.g. an openai-compatible
  // gateway) keeps the same "openai.*" prefix.
  return typeof model?.provider === "string" && model.provider.startsWith("openai");
}

// OpenAI/Responses does AUTOMATIC prompt caching for prompts over ~1024 tokens
// (verified live: a repeated stable prefix reports ~all input tokens as
// cachedInputTokens on the 2nd call) — there is no cachePoint to place, which
// is why withSystemCachePoint no-ops for openai. A stable `promptCacheKey`
// only affects cache-hit ROUTING: OpenAI routes requests sharing a key to the
// same cache, so the stable TOOLS+SYSTEM prefix reuses its cache reliably
// across a session's turns (and as the deployment scales to multiple backends).
// Returns streamText-level providerOptions; empty ({}) for every non-openai
// provider (their caching is handled by withSystemCachePoint's cache markers).
// deno-lint-ignore no-explicit-any
export function cacheProviderOptions(model: any, cacheKey: string): Record<string, any> {
  if (cacheKey && isOpenAIModel(model)) {
    return { openai: { promptCacheKey: cacheKey } };
  }
  return {};
}

// A SystemModelMessage carrying a provider cache marker (Bedrock cachePoint
// or Anthropic cacheControl), or the plain-string no-op for every other
// provider.
export type SystemPrompt = string | {
  role: "system";
  content: string;
  providerOptions:
    | { bedrock: { cachePoint: { type: "default" } } }
    | { anthropic: { cacheControl: { type: "ephemeral" } } };
};

// Wraps a plain system-prompt string in the AI SDK's SystemModelMessage
// shape with a provider cache marker covering everything up to and including
// the system block — a Bedrock cachePoint when the resolved model is a
// caching-capable (Anthropic) bedrock model,
// an Anthropic ephemeral cacheControl when it's the direct anthropic
// provider; returns the original string unchanged for every other provider
// (a true no-op: openai/google never see a providerOptions key).
//
// Why a cache point on `system` also covers the TOOLS prefix (the other half
// of the brief's "cache the stable TOOLS+SYSTEM prefix" target): the
// installed @ai-sdk/amazon-bedrock@^4.0.115 (resolves to 4.0.133 in the dx
// image's npm set) has NO mechanism to attach a cache point to the tools
// array — `BedrockCachePoint` is a valid member of
// `BedrockToolConfiguration.tools` per bedrock-api-types.ts, but
// bedrock-prepare-tools.ts's `prepareTools()` never constructs one; tool
// definitions cannot be cache-pointed directly in this SDK version. Bedrock's
// Converse API (for Anthropic models) builds the model context in the fixed
// order tools -> system -> messages — the same ordering Anthropic's own
// Messages API prompt-caching docs describe — so a cache point placed on the
// system block caches the entire prefix up to and including it, tool
// definitions included, as long as both are byte-identical across requests
// (true here: buildSystemPrompt/resolveInstructions and the built tool set
// are both deterministic per agent+metadata+turn). Confirmed against
// convert-to-bedrock-chat-messages.ts: a system message's
// `providerOptions.bedrock.cachePoint` becomes a second `{ cachePoint: {...} }`
// entry appended to the wire `system` array — a field bedrockModel()'s
// bearer-token custom fetch above never touches (it only rewrites
// `parsed.messages`), so the marker survives that rewrite unmodified.
// deno-lint-ignore no-explicit-any
export function withSystemCachePoint(model: any, system: string): SystemPrompt {
  if (bedrockSupportsPromptCaching(model)) {
    return {
      role: "system",
      content: system,
      providerOptions: { bedrock: { cachePoint: { type: "default" } } },
    };
  }
  // Anthropic prompt caching: an ephemeral cache_control on the system block
  // caches the stable TOOLS+SYSTEM prefix (Anthropic composes context in the
  // same tools -> system -> messages order as Bedrock's Converse API), so a
  // multi-turn session only pays to write that prefix once and reads it back
  // cheaply thereafter. Verified against the installed @ai-sdk/anthropic@4:
  // convert-to-anthropic-messages-api reads providerOptions.anthropic
  // .cacheControl on a system message and emits `cache_control` on the wire
  // system text block. openai/google fall through to the plain string below.
  if (isAnthropicModel(model)) {
    return {
      role: "system",
      content: system,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    };
  }
  return system;
}
