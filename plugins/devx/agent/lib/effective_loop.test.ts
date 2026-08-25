// Characterization tests for src/hooks/effectiveLoop.ts's
// resolveEffectiveLoop (task-7, R9 controller ruling): pins the EXISTING
// routing decision that gates plugins/devx/src/hooks/useEffectiveLoop.ts
// ahead of V17__loop_default_agents.sql flipping devx.settings.loop's
// default to 'agents'. devx has no vitest/RTL/jsdom setup, so this lives
// here (agent/lib/) rather than as a component test — this directory's
// suite invocation is the one that runs against devx frontend/functions
// code via relative imports, same as auth_shape.test.ts.
//
// Must pass unmodified against CURRENT logic: if any case here fails, the
// routing assumption the whole eve-loop cutover rests on is wrong.
import { assertEquals } from "jsr:@std/assert";
import { resolveEffectiveLoop } from "../../src/hooks/effectiveLoop.ts";

Deno.test("resolveEffectiveLoop: loop='agents' + anthropic -> 'agents'", () => {
  assertEquals(resolveEffectiveLoop({ loop: "agents", provider: "anthropic" }), "agents");
});

// The sidecar is a different execution engine, not a model provider: eve's
// resolveModel throws for it. These users must never reach /chat.
Deno.test("resolveEffectiveLoop: loop='agents' + claude-code -> 'legacy' (forced)", () => {
  assertEquals(resolveEffectiveLoop({ loop: "agents", provider: "claude-code" }), "legacy");
});

Deno.test("resolveEffectiveLoop: loop='agents' + bedrock/iam -> 'legacy' (forced)", () => {
  assertEquals(
    resolveEffectiveLoop({ loop: "agents", provider: "bedrock", authShape: "iam" }),
    "legacy",
  );
});

Deno.test("resolveEffectiveLoop: loop='agents' + bedrock/bearer -> 'agents'", () => {
  assertEquals(
    resolveEffectiveLoop({ loop: "agents", provider: "bedrock", authShape: "bearer" }),
    "agents",
  );
});

// Deliberate backstop for an older server build that doesn't emit
// auth_shape yet: this function can't detect IAM in that case and falls
// through to 'agents'. Pinned so that behaviour cannot drift silently.
Deno.test("resolveEffectiveLoop: loop='agents' + bedrock with ABSENT auth_shape -> 'agents' (backstop)", () => {
  assertEquals(resolveEffectiveLoop({ loop: "agents", provider: "bedrock" }), "agents");
  assertEquals(
    resolveEffectiveLoop({ loop: "agents", provider: "bedrock", authShape: undefined }),
    "agents",
  );
  assertEquals(
    resolveEffectiveLoop({ loop: "agents", provider: "bedrock", authShape: null }),
    "agents",
  );
});

Deno.test("resolveEffectiveLoop: loop='legacy' -> 'legacy' regardless of provider", () => {
  assertEquals(resolveEffectiveLoop({ loop: "legacy", provider: "anthropic" }), "legacy");
  assertEquals(resolveEffectiveLoop({ loop: "legacy", provider: "claude-code" }), "legacy");
  assertEquals(
    resolveEffectiveLoop({ loop: "legacy", provider: "bedrock", authShape: "bearer" }),
    "legacy",
  );
  assertEquals(
    resolveEffectiveLoop({ loop: "legacy", provider: "bedrock", authShape: "iam" }),
    "legacy",
  );
});

Deno.test("resolveEffectiveLoop: missing/undefined loop -> 'legacy' (matches DB column default)", () => {
  assertEquals(resolveEffectiveLoop({ loop: undefined, provider: "anthropic" }), "legacy");
  assertEquals(resolveEffectiveLoop({ loop: null, provider: "anthropic" }), "legacy");
});
