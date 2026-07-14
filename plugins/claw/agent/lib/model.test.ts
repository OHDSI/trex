import { assertEquals } from "jsr:@std/assert";
import { resolveClawModel } from "./model.ts";

Deno.test("resolveClawModel reads provider/model/key from env", () => {
  const env = (k: string) => (({
    CLAW_MODEL_PROVIDER: "anthropic",
    CLAW_MODEL_ID: "claude-sonnet-5",
    CLAW_API_KEY: "sk-test",
  } as Record<string, string>)[k]);
  assertEquals(resolveClawModel(env), { provider: "anthropic", modelId: "claude-sonnet-5", apiKey: "sk-test", baseURL: undefined });
});

Deno.test("resolveClawModel throws when the API key is missing", () => {
  const env = (k: string) => (k === "CLAW_MODEL_ID" ? "m" : undefined);
  let threw = false;
  try { resolveClawModel(env); } catch { threw = true; }
  assertEquals(threw, true);
});
