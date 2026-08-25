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
import { assert, assertEquals } from "jsr:@std/assert";
import { resolveEffectiveLoop, SETTINGS_FETCH_FAILURE_LOOP } from "../../src/hooks/effectiveLoop.ts";

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

// R13: an ABSENT loop value means the user has no devx.settings row at all
// (provider_config_routes.ts lets a user be fully configured through
// devx.provider_configs alone), so the DB column default is what applies —
// and V17__loop_default_agents.sql set that to 'agents'. Treating absent as
// legacy was the fourth hard-coded-default site and would have left every
// such user behind at cutover.
Deno.test("resolveEffectiveLoop: missing/undefined loop -> 'agents' (matches V17's new DB column default)", () => {
  assertEquals(resolveEffectiveLoop({ loop: undefined, provider: "anthropic" }), "agents");
  assertEquals(resolveEffectiveLoop({ loop: null, provider: "anthropic" }), "agents");
  assertEquals(resolveEffectiveLoop({ loop: "", provider: "anthropic" }), "agents");
});

// The provider gates still apply to a no-row user — absent does not mean
// "force agents", it means "take the default", which the sidecar/IAM gates
// then override exactly as they do for an explicit 'agents'.
Deno.test("resolveEffectiveLoop: missing loop + claude-code -> 'legacy' (provider gate still wins)", () => {
  assertEquals(resolveEffectiveLoop({ loop: undefined, provider: "claude-code" }), "legacy");
  assertEquals(
    resolveEffectiveLoop({ loop: undefined, provider: "bedrock", authShape: "iam" }),
    "legacy",
  );
});

// An explicit value that is neither 'legacy' nor 'agents' cannot exist while
// the CHECK constraint stands, but must not be read as "absent" if it ever
// does — only a genuinely missing value takes the default.
Deno.test("resolveEffectiveLoop: an explicit unknown loop value -> 'legacy', not the default", () => {
  assertEquals(resolveEffectiveLoop({ loop: "something-else", provider: "anthropic" }), "legacy");
});

// The CRITICAL distinction (R13): a failed settings/provider FETCH is not an
// absent settings row. useEffectiveLoop's `.catch` uses this constant, not
// resolveEffectiveLoop, because a user whose provider could not be read may
// be on `claude-code`, for which eve's resolveModel throws.
Deno.test("a failed settings fetch falls back to 'legacy', unlike an absent settings row", () => {
  assertEquals(SETTINGS_FETCH_FAILURE_LOOP, "legacy");
  assertEquals(resolveEffectiveLoop({ loop: undefined, provider: "anthropic" }), "agents");
  assert(
    SETTINGS_FETCH_FAILURE_LOOP !== resolveEffectiveLoop({ loop: undefined, provider: "anthropic" }),
    "the fetch-failure fallback and the no-row default must stay distinct",
  );
});
