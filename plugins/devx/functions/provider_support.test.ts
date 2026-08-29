// Pins the two things the shared gate owns that no call site shows any more:
// the exact sentence each message style produces, and the fact that neither
// membership can be reached — and therefore mutated — from outside the module.
//
// The sentences used to be literals at six read sites, where
// provider_gate_guard.test.ts could count them. Now they are rendered once, so
// they are asserted once, here, by value. Four of the six sites also assert
// them end-to-end (routes/security_routes.test.ts, tools/spawn_agent.test.ts,
// ../agent/lib/resolve_model.test.ts); index.ts's two have no behavioural
// coverage and rely on this file plus the guard's style assertion.
import { assertEquals, assertStrictEquals, assertThrows } from "jsr:@std/assert";
import {
  assertProviderSupported,
  isNoKeyProvider,
  isRemovedProvider,
  REMOVED_PROVIDER_NAMES,
  removedProviderMessage,
  removedProviderResponse,
} from "./provider_support.ts";

// The two wordings, byte for byte. `plugin` ends in a period and says
// "Settings"; `hostAgnostic` says "devx Settings" and ends without one,
// because it surfaces through a runtime shared with other plugins where an
// unqualified "Settings" would not tell the user where to go. Neither is
// cosmetic: both are what a user with a stranded row actually reads.
const PLUGIN_MESSAGE =
  "GitHub Copilot support has been removed — choose another provider in Settings.";
const HOST_AGNOSTIC_MESSAGE =
  "GitHub Copilot support has been removed — choose another provider in devx Settings";

Deno.test("removedProviderMessage: the plugin style is the default and ends in a period", () => {
  assertEquals(removedProviderMessage("copilot"), PLUGIN_MESSAGE);
  assertEquals(removedProviderMessage("copilot", "plugin"), PLUGIN_MESSAGE);
});

Deno.test("removedProviderMessage: the host-agnostic style names the plugin and omits the period", () => {
  assertEquals(removedProviderMessage("copilot", "hostAgnostic"), HOST_AGNOSTIC_MESSAGE);
});

// A provider column is user-controlled through POST /provider-configs. An
// object-literal label table would resolve "constructor"/"toString" through
// Object.prototype and render the inherited value into a user-facing sentence.
Deno.test("removedProviderMessage: an inherited Object.prototype key is not treated as a label", () => {
  for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assertEquals(
      removedProviderMessage(key),
      `${key} support has been removed — choose another provider in Settings.`,
    );
  }
});

Deno.test("isRemovedProvider: the removed engine is rejected, live providers and absent rows are not", () => {
  assertEquals(isRemovedProvider("copilot"), true);
  for (const ok of ["anthropic", "openai", "google", "bedrock", "claude-code", "", "COPILOT"]) {
    assertEquals(isRemovedProvider(ok), false, `expected ${JSON.stringify(ok)} to be supported`);
  }
  // A row that resolved to nothing must not throw its way through the gate —
  // the key check downstream is what rejects it, with its own wording.
  assertEquals(isRemovedProvider(null), false);
  assertEquals(isRemovedProvider(undefined), false);
});

Deno.test("isNoKeyProvider: only providers that authenticate without a stored key are waived", () => {
  assertEquals(isNoKeyProvider("claude-code"), true);
  assertEquals(isNoKeyProvider("bedrock"), true);
  for (const needsKey of ["anthropic", "openai", "google", "copilot", "", "BEDROCK"]) {
    assertEquals(
      isNoKeyProvider(needsKey),
      false,
      `expected ${JSON.stringify(needsKey)} to require a key`,
    );
  }
  assertEquals(isNoKeyProvider(null), false);
  assertEquals(isNoKeyProvider(undefined), false);
});

// The invariant provider_gate_guard.test.ts asserts across files, restated
// here at the one place both memberships are declared.
Deno.test("no removed provider is waived past the key check", () => {
  for (const provider of REMOVED_PROVIDER_NAMES) {
    assertEquals(
      isNoKeyProvider(provider),
      false,
      `"${provider}" has no engine behind it and must never be waived`,
    );
  }
});

// The memberships are module-private so that no other module can reach them.
// An exported Set would be process-global mutable state in a credential gate:
// ReadonlySet is erased at runtime, most consumers carry @ts-nocheck, and the
// suites run --no-check, so one .add() would disable the gate for every site
// and every user until the worker restarted.
Deno.test("the memberships are not reachable as mutable Sets", async () => {
  const mod = await import("./provider_support.ts");
  const exportedSets = Object.entries(mod).filter(([, v]) => v instanceof Set);
  assertEquals(
    exportedSets.map(([k]) => k),
    [],
    "a membership Set is exported. Any module could then .add() a removed provider to the " +
      "waiver, or .delete() one from the removed set, and disable the gate process-wide for " +
      "every user — invisibly to both guard tests. Export a predicate instead.",
  );
});

Deno.test("REMOVED_PROVIDER_NAMES is a frozen snapshot, not the live membership", () => {
  assertEquals(Object.isFrozen(REMOVED_PROVIDER_NAMES), true);
  assertEquals([...REMOVED_PROVIDER_NAMES], ["copilot"]);
  assertThrows(
    () => (REMOVED_PROVIDER_NAMES as string[]).push("anthropic"),
    TypeError,
  );
  // Pushing onto the snapshot, even if it succeeded, must not reach the
  // predicate the gates consult.
  assertEquals(isRemovedProvider("anthropic"), false);
});

Deno.test("removedProviderResponse: a removed row gets a 400 carrying the message, a live row gets null", async () => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  const rejected = removedProviderResponse("copilot", corsHeaders);
  assertEquals(rejected?.status, 400);
  assertEquals(rejected?.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await rejected!.json(), { error: PLUGIN_MESSAGE });

  const hostAgnostic = removedProviderResponse("copilot", corsHeaders, "hostAgnostic");
  assertEquals(await hostAgnostic!.json(), { error: HOST_AGNOSTIC_MESSAGE });

  for (const ok of ["anthropic", null, undefined]) {
    assertStrictEquals(
      removedProviderResponse(ok, corsHeaders),
      null,
      `expected ${JSON.stringify(ok)} to pass the gate`,
    );
  }
});

Deno.test("assertProviderSupported: throws the same sentence the response wrapper returns", () => {
  assertThrows(() => assertProviderSupported("copilot"), Error, PLUGIN_MESSAGE);
  assertThrows(
    () => assertProviderSupported("copilot", "hostAgnostic"),
    Error,
    HOST_AGNOSTIC_MESSAGE,
  );
  // Byte-for-byte, not just "contains" — assertThrows matches on substring.
  try {
    assertProviderSupported("copilot", "hostAgnostic");
  } catch (err) {
    assertEquals((err as Error).message, HOST_AGNOSTIC_MESSAGE);
  }
  for (const ok of ["anthropic", "bedrock", null, undefined]) {
    assertProviderSupported(ok);
  }
});

import { AGENT_SUPPORTED_PROVIDER_NAMES, assertProviderAllowedForAgent, isDevxOnlyProvider } from "./provider_support.ts";

Deno.test("isDevxOnlyProvider: only claude-code is devx-exclusive", () => {
  assertEquals(isDevxOnlyProvider("claude-code"), true);
  for (const ok of ["anthropic", "openai", "google", "bedrock", "", "CLAUDE-CODE"]) {
    assertEquals(isDevxOnlyProvider(ok), false, `expected ${JSON.stringify(ok)} to not be devx-only`);
  }
  assertEquals(isDevxOnlyProvider(null), false);
  assertEquals(isDevxOnlyProvider(undefined), false);
});

Deno.test("assertProviderAllowedForAgent: claude-code is rejected for claw and d2esupport, allowed for devx", () => {
  assertProviderAllowedForAgent("claude-code", "devx");
  assertThrows(
    () => assertProviderAllowedForAgent("claude-code", "claw"),
    Error,
    "claude-code is only available for devx — choose a different provider for claw.",
  );
  assertThrows(
    () => assertProviderAllowedForAgent("claude-code", "d2esupport"),
    Error,
    "claude-code is only available for devx — choose a different provider for d2esupport.",
  );
});

Deno.test("assertProviderAllowedForAgent: every other provider is allowed for every agent", () => {
  for (const agent of ["devx", "claw", "d2esupport"] as const) {
    for (const provider of ["anthropic", "openai", "google", "bedrock", null, undefined]) {
      assertProviderAllowedForAgent(provider, agent);
    }
  }
});

// The three provider lists — devx's assignment gate, claw's and d2esupport's
// acceptance sets — must agree. They silently diverged once: devx offered
// `openai-compatible`, the gate refused only `claude-code`, and the two agents
// accepted neither, so an assignment that looked valid in Settings threw on
// every turn. Read the real files rather than restating the lists here, or this
// test would just be a fourth copy free to drift with them.
Deno.test("the agent provider allowlists agree with devx's assignment gate", async () => {
  const files = {
    claw: new URL("../../claw/agent/lib/agent-model-override.ts", import.meta.url),
    d2esupport: new URL("../../d2esupport/agent/lib/agent-model-override.ts", import.meta.url),
  };
  for (const [agent, url] of Object.entries(files)) {
    const src = await Deno.readTextFile(url);
    const m = src.match(/const \w*MODEL_PROVIDERS = new Set\(\[([^\]]*)\]\)/);
    assertEquals(Boolean(m), true, `could not find the provider set in ${agent}'s agent-model-override.ts`);
    const declared = new Set(
      m![1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean),
    );
    assertEquals(
      [...declared].sort(),
      [...AGENT_SUPPORTED_PROVIDER_NAMES].sort(),
      `${agent}'s accepted providers differ from devx's AGENT_SUPPORTED_PROVIDERS — ` +
        "a provider devx will assign but the agent will reject throws on every turn",
    );
  }
});

Deno.test("assertProviderAllowedForAgent: rejects a provider the agent cannot construct", () => {
  // devx keeps everything, including its exclusive claude-code.
  assertProviderAllowedForAgent("claude-code", "devx");
  assertProviderAllowedForAgent("openai-compatible", "devx");
  // openai-compatible is now assignable to the shared agents — the whole point.
  assertProviderAllowedForAgent("openai-compatible", "claw");
  assertProviderAllowedForAgent("openai-compatible", "d2esupport");
  // claude-code stays devx-only, with its own specific message.
  assertThrows(() => assertProviderAllowedForAgent("claude-code", "claw"), Error, "only available for devx");
  // Anything else devx might grow is refused at assignment rather than at use.
  assertThrows(
    () => assertProviderAllowedForAgent("some-future-provider", "claw"),
    Error,
    "cannot use the \"some-future-provider\" provider",
  );
});
