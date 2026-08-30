import { assertEquals } from "jsr:@std/assert";
import { chooseCoderTransport } from "./code-route.ts";
// Cross-plugin import for THIS TEST ONLY, to pin chooseCoderTransport's absent-
// provider behaviour against the real function it deliberately duplicates —
// not shipped in the worker (tests aren't staged), so the import-map trap
// code-route.ts's header describes does not apply here.
import { resolveEffectiveLoop } from "../../../devx/src/hooks/effectiveLoop.ts";

Deno.test("claude-code (the sidecar) routes to legacy", () => {
  assertEquals(chooseCoderTransport("claude-code"), "legacy");
});

Deno.test("anthropic, openai, and bedrock all route to eve", () => {
  assertEquals(chooseCoderTransport("anthropic"), "eve");
  assertEquals(chooseCoderTransport("openai"), "eve");
  assertEquals(chooseCoderTransport("bedrock"), "eve");
});

Deno.test("an absent/unset provider routes the same way resolveEffectiveLoop decides for one", () => {
  const decidedByEffectiveLoop = resolveEffectiveLoop({ loop: undefined, provider: undefined });
  assertEquals(decidedByEffectiveLoop, "agents"); // pin the actual behaviour, not an assumption
  const expectedTransport = decidedByEffectiveLoop === "agents" ? "eve" : "legacy";
  assertEquals(chooseCoderTransport(undefined), expectedTransport);
  assertEquals(chooseCoderTransport(null), expectedTransport);
});
