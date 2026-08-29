import { assertEquals, assertRejects } from "jsr:@std/assert";
import { resolveSupportModel } from "./model.ts";

const noOverride = async () => null;

Deno.test("defaults to anthropic sonnet with the api key when devx has no override configured", async () => {
  const env = (k: string) => ({ D2ESUPPORT_API_KEY: "sk-x" } as Record<string, string>)[k];
  const m = await resolveSupportModel(env, noOverride);
  assertEquals(m.provider, "anthropic");
  assertEquals(m.modelId, "claude-sonnet-5");
});

Deno.test("throws without an api key and without a devx override", async () => {
  await assertRejects(() => resolveSupportModel(() => undefined, noOverride));
});

Deno.test("a devx override wins over env vars", async () => {
  const env = () => undefined;
  const override = async () => ({ provider: "google" as const, modelId: "gemini-2.5-pro", apiKey: "gk-x", baseURL: undefined });
  const m = await resolveSupportModel(env, override);
  assertEquals(m, { provider: "google", modelId: "gemini-2.5-pro", apiKey: "gk-x", baseURL: undefined });
});
