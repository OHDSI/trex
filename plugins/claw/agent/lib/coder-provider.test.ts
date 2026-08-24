// @ts-nocheck
import { assertEquals } from "jsr:@std/assert";
import { resolveCoderProviderIntent } from "./coder-provider.ts";

const envOf = (map: Record<string, string>) => (k: string) => map[k];

Deno.test("no env set: asserts nothing, so the account's own provider stands", () => {
  assertEquals(resolveCoderProviderIntent(envOf({})), null);
});

Deno.test("empty-string env counts as unset (manifest bakes '' when host var is absent)", () => {
  assertEquals(resolveCoderProviderIntent(envOf({ CLAW_CODER_PROVIDER: "  " })), null);
});

Deno.test("provider only: model is left to the account", () => {
  assertEquals(
    resolveCoderProviderIntent(envOf({ CLAW_CODER_PROVIDER: "openai" })),
    { provider: "openai" },
  );
});

Deno.test("provider and model are both asserted when both are set", () => {
  assertEquals(
    resolveCoderProviderIntent(envOf({ CLAW_CODER_PROVIDER: "openai", CLAW_CODER_MODEL: "gpt-5.1" })),
    { provider: "openai", model: "gpt-5.1" },
  );
});

Deno.test("model without provider is ignored — a model means nothing without its engine", () => {
  assertEquals(resolveCoderProviderIntent(envOf({ CLAW_CODER_MODEL: "gpt-5.1" })), null);
});
