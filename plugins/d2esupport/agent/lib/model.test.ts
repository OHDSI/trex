import { assertEquals, assertThrows } from "jsr:@std/assert";
import { resolveSupportModel } from "./model.ts";

Deno.test("defaults to anthropic sonnet with the api key", () => {
  const env = (k: string) => ({ D2ESUPPORT_API_KEY: "sk-x" } as Record<string, string>)[k];
  const m = resolveSupportModel(env);
  assertEquals(m.provider, "anthropic");
  assertEquals(m.modelId, "claude-sonnet-5");
});

Deno.test("throws without an api key", () => {
  assertThrows(() => resolveSupportModel(() => undefined));
});
