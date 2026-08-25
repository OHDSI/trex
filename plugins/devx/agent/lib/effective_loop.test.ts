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
//
// Only provider === "claude-code" (the sidecar) is forced to legacy.
// IAM-shaped bedrock credentials used to be a second forced-legacy case; the
// owner decided that configuration is simply unsupported rather than worth
// implementing, so it was removed from this gate — an IAM-shaped bedrock
// user now resolves to "agents" like everyone else and fails loudly at
// agent.ts's resolveModel instead.
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

// Inverted expectation (was 'legacy' (forced) before this decision): the
// owner ruled IAM-shaped bedrock credentials are simply unsupported rather
// than worth routing around, so this gate no longer branches on auth shape
// at all. An IAM-shaped bedrock user now resolves to 'agents' like every
// other non-claude-code provider and fails loudly at agent.ts's resolveModel
// instead of being silently routed to the legacy loop.
Deno.test("resolveEffectiveLoop: loop='agents' + bedrock/iam -> 'agents' (IAM bedrock is unsupported, not routed away)", () => {
  assertEquals(resolveEffectiveLoop({ loop: "agents", provider: "bedrock" }), "agents");
});

Deno.test("resolveEffectiveLoop: loop='agents' + bedrock/bearer -> 'agents'", () => {
  assertEquals(resolveEffectiveLoop({ loop: "agents", provider: "bedrock" }), "agents");
});

Deno.test("resolveEffectiveLoop: loop='legacy' -> 'legacy' regardless of provider", () => {
  assertEquals(resolveEffectiveLoop({ loop: "legacy", provider: "anthropic" }), "legacy");
  assertEquals(resolveEffectiveLoop({ loop: "legacy", provider: "claude-code" }), "legacy");
  assertEquals(resolveEffectiveLoop({ loop: "legacy", provider: "bedrock" }), "legacy");
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

// The claude-code gate still applies to a no-row user — absent does not mean
// "force agents", it means "take the default", which the sidecar gate then
// overrides exactly as it does for an explicit 'agents'. bedrock (any auth
// shape) is not gated, so it takes the default like anthropic/openai/google.
Deno.test("resolveEffectiveLoop: missing loop + claude-code -> 'legacy' (provider gate still wins)", () => {
  assertEquals(resolveEffectiveLoop({ loop: undefined, provider: "claude-code" }), "legacy");
  assertEquals(resolveEffectiveLoop({ loop: undefined, provider: "bedrock" }), "agents");
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
