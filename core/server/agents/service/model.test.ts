import { assertEquals, assertThrows } from "jsr:@std/assert";
import { isAnthropicModel, isBedrockModel, parseModelString, resolveModel, withSystemCachePoint } from "./model.ts";

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

Deno.test("withSystemCachePoint wraps system in a cache-pointed SystemModelMessage for bedrock", () => {
  const system = "You are a helpful agent.\nFollow the rules.";
  const wrapped = withSystemCachePoint({ provider: "amazon-bedrock" }, system);
  assertEquals(wrapped, {
    role: "system",
    content: system,
    providerOptions: { bedrock: { cachePoint: { type: "default" } } },
  });
  // Text content must be byte-identical to the original — no truncation or
  // mutation, since the cache key depends on exact bytes.
  assertEquals((wrapped as { content: string }).content, system);
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
