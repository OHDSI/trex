import { assertEquals, assertRejects } from "jsr:@std/assert";
import { resolveClawModel } from "./model.ts";

const noOverride = async () => null;

Deno.test("resolveClawModel: falls back to env when devx has no override configured", async () => {
  const env = (k: string) => (({
    CLAW_MODEL_PROVIDER: "anthropic",
    CLAW_MODEL_ID: "claude-sonnet-5",
    CLAW_API_KEY: "sk-test",
  } as Record<string, string>)[k]);
  assertEquals(
    await resolveClawModel(env, undefined, noOverride),
    { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-test", baseURL: undefined },
  );
});

Deno.test("resolveClawModel: throws when the env fallback has no API key and devx has no override", async () => {
  const env = (k: string) => (k === "CLAW_MODEL_ID" ? "m" : undefined);
  await assertRejects(() => resolveClawModel(env, undefined, noOverride));
});

Deno.test("resolveClawModel: a devx override wins over env vars", async () => {
  const env = (k: string) => (({ CLAW_API_KEY: "sk-env-fallback-only" } as Record<string, string>)[k]);
  const override = async () => ({ provider: "bedrock" as const, modelId: "us.anthropic.claude-sonnet-4-6", apiKey: "abc", baseURL: undefined });
  assertEquals(
    await resolveClawModel(env, "user-1", override),
    { provider: "bedrock", modelId: "us.anthropic.claude-sonnet-4-6", apiKey: "abc", baseURL: undefined },
  );
});

Deno.test("resolveClawModel: a devx override's rejection propagates instead of falling back to env", async () => {
  const env = (k: string) => (({ CLAW_API_KEY: "sk-env-fallback-only" } as Record<string, string>)[k]);
  const override = async () => { throw new Error("Invalid encryption key: rotated"); };
  await assertRejects(() => resolveClawModel(env, "user-1", override), Error, "Invalid encryption key");
});
