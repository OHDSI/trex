import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseModelString, resolveModel } from "./model.ts";

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
