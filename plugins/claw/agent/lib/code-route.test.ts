import { assertEquals } from "jsr:@std/assert";
import { chooseCoderTransport } from "./code-route.ts";

Deno.test("claude-code (the sidecar) routes to eve, like every other provider", () => {
  assertEquals(chooseCoderTransport("claude-code"), "eve");
});

Deno.test("anthropic, openai, and bedrock all route to eve", () => {
  assertEquals(chooseCoderTransport("anthropic"), "eve");
  assertEquals(chooseCoderTransport("openai"), "eve");
  assertEquals(chooseCoderTransport("bedrock"), "eve");
});

Deno.test("an absent/unset provider routes to eve", () => {
  assertEquals(chooseCoderTransport(undefined), "eve");
  assertEquals(chooseCoderTransport(null), "eve");
});
