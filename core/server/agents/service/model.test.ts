import { assertEquals, assertThrows } from "jsr:@std/assert";
import { bedrockSupportsPromptCaching, cacheProviderOptions, isAnthropicModel, isBedrockModel, isOpenAIModel, parseModelString, resolveModel, withSystemCachePoint, withToolCachePoint } from "./model.ts";

Deno.test("parseModelString splits on first slash only", () => {
  assertEquals(parseModelString("anthropic/claude-sonnet-5"), {
    provider: "anthropic", modelId: "claude-sonnet-5",
  });
  // Bedrock model ids contain dots and can contain slashes-free ARN-ish ids
  assertEquals(parseModelString("bedrock/us.anthropic.claude-sonnet-4-6"), {
    provider: "bedrock", modelId: "us.anthropic.claude-sonnet-4-6",
  });
});

Deno.test("parseModelString rejects strings without provider prefix", () => {
  assertThrows(() => parseModelString("claude-sonnet-5"));
});

Deno.test("resolveModel falls back to TREX_AGENTS_DEFAULT_MODEL", () => {
  const env = (k: string) =>
    ({ TREX_AGENTS_DEFAULT_MODEL: "openai/gpt-5.4-mini", OPENAI_API_KEY: "sk-test" } as Record<string, string>)[k];
  const m = resolveModel(undefined, env);
  assertEquals(m.modelId, "gpt-5.4-mini");
});

Deno.test("resolveModel throws with no model and no default", () => {
  assertThrows(() => resolveModel(undefined, () => undefined));
});

Deno.test("resolveModel builds a model for each supported provider", () => {
  const env = (k: string) =>
    ({
      ANTHROPIC_API_KEY: "sk-a", OPENAI_API_KEY: "sk-o",
      GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
      AWS_BEARER_TOKEN_BEDROCK: "bearer", AWS_REGION: "us-east-1",
    } as Record<string, string>)[k];
  for (const s of [
    "anthropic/claude-sonnet-5", "openai/gpt-5.4-mini",
    "google/gemini-2.5-pro", "bedrock/us.anthropic.claude-sonnet-4-6",
  ]) {
    const m = resolveModel(s, env);
    assertEquals(typeof m.modelId, "string");
  }
});

Deno.test("isBedrockModel is true only for provider === amazon-bedrock", () => {
  assertEquals(isBedrockModel({ provider: "amazon-bedrock" }), true);
  assertEquals(isBedrockModel({ provider: "anthropic" }), false);
  assertEquals(isBedrockModel({ provider: "openai" }), false);
  assertEquals(isBedrockModel({ provider: undefined }), false);
  assertEquals(isBedrockModel(undefined), false);
  assertEquals(isBedrockModel(null), false);
  assertEquals(isBedrockModel({}), false);
});

Deno.test("isAnthropicModel is true only for provider === anthropic.messages", () => {
  // "anthropic.messages" is what @ai-sdk/anthropic's language-model objects
  // actually report (see isAnthropicModel's comment) — a bare "anthropic"
  // never occurs on a model object and must NOT match.
  assertEquals(isAnthropicModel({ provider: "anthropic.messages" }), true);
  assertEquals(isAnthropicModel({ provider: "anthropic" }), false);
  assertEquals(isAnthropicModel({ provider: "amazon-bedrock" }), false);
  assertEquals(isAnthropicModel({ provider: "openai" }), false);
  assertEquals(isAnthropicModel({ provider: undefined }), false);
  assertEquals(isAnthropicModel(undefined), false);
  assertEquals(isAnthropicModel(null), false);
  assertEquals(isAnthropicModel({}), false);
});

Deno.test("bedrockSupportsPromptCaching is true only for Anthropic-on-Bedrock model ids", () => {
  // Anthropic Claude on Bedrock (with and without a cross-region prefix) caches.
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "us.anthropic.claude-sonnet-4-6" }), true);
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0" }), true);
  // Non-Anthropic Bedrock models (e.g. Z.AI GLM) do NOT support prompt caching —
  // sending a cachePoint makes Bedrock reject the whole request with
  // AccessDeniedException, so these must be excluded.
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "zai.glm-5" }), false);
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock", modelId: "amazon.nova-pro-v1:0" }), false);
  // A bedrock model object with no modelId is treated as non-caching (safe default).
  assertEquals(bedrockSupportsPromptCaching({ provider: "amazon-bedrock" }), false);
  // Non-bedrock providers are never in scope here.
  assertEquals(bedrockSupportsPromptCaching({ provider: "anthropic.messages", modelId: "claude-sonnet-5" }), false);
});

Deno.test("withSystemCachePoint wraps system in a cache-pointed SystemModelMessage for an Anthropic bedrock model", () => {
  const system = "You are a helpful agent.\nFollow the rules.";
  const wrapped = withSystemCachePoint({ provider: "amazon-bedrock", modelId: "us.anthropic.claude-sonnet-4-6" }, system);
  assertEquals(wrapped, {
    role: "system",
    content: system,
    providerOptions: { bedrock: { cachePoint: { type: "default" } } },
  });
  // Text content must be byte-identical to the original — no truncation or
  // mutation, since the cache key depends on exact bytes.
  assertEquals((wrapped as { content: string }).content, system);
});

Deno.test("withSystemCachePoint is a no-op for a non-Anthropic bedrock model (e.g. GLM)", () => {
  // Regression: a cachePoint on zai.glm-5 makes Bedrock reject the turn with
  // AccessDeniedException ("unsupported model or your request did not allow
  // prompt caching"), silently killing it. Such models must be invoked plain.
  const system = "You are a helpful agent.";
  assertEquals(withSystemCachePoint({ provider: "amazon-bedrock", modelId: "zai.glm-5" }, system), system);
});

Deno.test("withSystemCachePoint wraps system with an ephemeral cacheControl for anthropic", () => {
  const system = "You are a helpful agent.\nFollow the rules.";
  const wrapped = withSystemCachePoint({ provider: "anthropic.messages" }, system);
  assertEquals(wrapped, {
    role: "system",
    content: system,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });
  // Same byte-identity requirement as the bedrock branch — the cache key
  // depends on exact prefix bytes.
  assertEquals((wrapped as { content: string }).content, system);
});

Deno.test("withSystemCachePoint is a no-op (identity) for providers without caching support", () => {
  const system = "You are a helpful agent.";
  assertEquals(withSystemCachePoint({ provider: "openai" }, system), system);
  assertEquals(withSystemCachePoint({ provider: "google" }, system), system);
  assertEquals(withSystemCachePoint({ provider: undefined }, system), system);
  assertEquals(withSystemCachePoint(undefined, system), system);
});

Deno.test("isOpenAIModel matches openai.* provider ids (incl. openai-compatible gateways)", () => {
  assertEquals(isOpenAIModel({ provider: "openai.responses" }), true);
  assertEquals(isOpenAIModel({ provider: "openai.chat" }), true);
  assertEquals(isOpenAIModel({ provider: "amazon-bedrock" }), false);
  assertEquals(isOpenAIModel({ provider: "anthropic.messages" }), false);
  assertEquals(isOpenAIModel({ provider: undefined }), false);
  assertEquals(isOpenAIModel(undefined), false);
});

Deno.test("cacheProviderOptions returns a promptCacheKey only for openai models", () => {
  // openai (incl. mantle/openai-compatible) → routing key under providerOptions.openai.
  assertEquals(
    cacheProviderOptions({ provider: "openai.responses" }, "trex-agents/claw"),
    { openai: { promptCacheKey: "trex-agents/claw" } },
  );
  // Non-openai providers get no providerOptions (bedrock/anthropic cache via
  // withSystemCachePoint's markers; a stray openai key would be meaningless).
  assertEquals(cacheProviderOptions({ provider: "amazon-bedrock", modelId: "zai.glm-5" }, "k"), {});
  assertEquals(cacheProviderOptions({ provider: "anthropic.messages" }, "k"), {});
  // No key → nothing to route on, even for openai.
  assertEquals(cacheProviderOptions({ provider: "openai.responses" }, ""), {});
});

// withToolCachePoint (Task 14): the cache breakpoint moves from the system
// message (withSystemCachePoint, above) onto the LAST CORE tool, so that
// appending activated tools after it never shifts what's cached — only the
// content up to and including the marked tool is hashed for the cache key.

Deno.test("withToolCachePoint marks the last core tool for anthropic", () => {
  // NOTE: model.provider for the real @ai-sdk/anthropic provider is
  // "anthropic.messages" (see isAnthropicModel's comment above) — the task
  // brief's sample test used a bare "anthropic", which isAnthropicModel
  // never matches. Corrected here.
  const model = { provider: "anthropic.messages", modelId: "claude-sonnet-5" };
  const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
  const names = Object.keys(out);
  assertEquals(names, ["Read", "Bash", "KBSearch"]);
  assertEquals(
    (out.Bash as never as { providerOptions: unknown }).providerOptions,
    { anthropic: { cacheControl: { type: "ephemeral" } } },
  );
  // The marker sits ONLY on the last core tool — never on an earlier core
  // tool and never on an appended activated tool (that would defeat the
  // whole point: activation must not change what's inside the cached span).
  assertEquals((out.Read as { providerOptions?: unknown }).providerOptions, undefined);
  assertEquals((out.KBSearch as { providerOptions?: unknown }).providerOptions, undefined);
});

Deno.test("withToolCachePoint marks the last core tool for bedrock", () => {
  const model = { provider: "amazon-bedrock", modelId: "us.anthropic.claude-sonnet-4-6" };
  const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [] as never);
  assertEquals(
    (out.Bash as never as { providerOptions: unknown }).providerOptions,
    { bedrock: { cachePoint: { type: "default" } } },
  );
  assertEquals((out.Read as { providerOptions?: unknown }).providerOptions, undefined);
});

Deno.test("withToolCachePoint adds no marker for openai/google — stable ordering only", () => {
  // OpenAI does automatic prefix caching (see cacheProviderOptions' comment)
  // and Google gets nothing at all; both must see the core tools followed by
  // activated tools, untouched, with no providerOptions key added anywhere.
  for (const model of [{ provider: "openai.responses" }, { provider: "google" }, { provider: undefined }]) {
    const out = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
    assertEquals(Object.keys(out), ["Read", "Bash", "KBSearch"]);
    for (const def of Object.values(out)) {
      assertEquals((def as { providerOptions?: unknown }).providerOptions, undefined);
    }
  }
});

Deno.test("withToolCachePoint appends activated tools after core, unmarked, in given order", () => {
  const model = { provider: "anthropic.messages" };
  const out = withToolCachePoint(
    model,
    [["Read", {}], ["Bash", {}]] as never,
    [["KBSearch", {}], ["FigmaPullMockups", {}]] as never,
  );
  assertEquals(Object.keys(out), ["Read", "Bash", "KBSearch", "FigmaPullMockups"]);
  assertEquals((out.KBSearch as { providerOptions?: unknown }).providerOptions, undefined);
  assertEquals((out.FigmaPullMockups as { providerOptions?: unknown }).providerOptions, undefined);
});

Deno.test("withToolCachePoint handles an empty core list without crashing", () => {
  const model = { provider: "anthropic.messages" };
  const out = withToolCachePoint(model, [] as never, [["KBSearch", {}]] as never);
  assertEquals(Object.keys(out), ["KBSearch"]);
});

Deno.test("serialized core prefix is byte-identical across activation", () => {
  // The point of the whole design: activating a deferred tool mid-session
  // must never change the bytes of the cached TOOLS+SYSTEM prefix, or every
  // subsequent request pays a full cache-write instead of a cache-read.
  const model = { provider: "anthropic.messages", modelId: "claude-sonnet-5" };
  const before = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [] as never);
  const after = withToolCachePoint(model, [["Read", {}], ["Bash", {}]] as never, [["KBSearch", {}]] as never);
  const prefix = (o: Record<string, unknown>) =>
    JSON.stringify(Object.fromEntries(Object.entries(o).filter(([n]) => n !== "KBSearch")));
  assertEquals(prefix(before), prefix(after));
});
