import { assertEquals } from "jsr:@std/assert";
import { resolveContextConfig } from "../loader.ts";
import { DEFAULT_CONTEXT_CONFIG } from "../service/context/budget.ts";

Deno.test("resolveContextConfig returns defaults when unconfigured", () => {
  assertEquals(resolveContextConfig(undefined), DEFAULT_CONTEXT_CONFIG);
});

Deno.test("resolveContextConfig merges partial overrides over defaults", () => {
  const cfg = resolveContextConfig({ freshTurns: 5, deferredTools: ["KBSearch"] });
  assertEquals(cfg.freshTurns, 5);
  assertEquals(cfg.deferredTools, ["KBSearch"]);
  assertEquals(cfg.compactAtFraction, DEFAULT_CONTEXT_CONFIG.compactAtFraction);
});

Deno.test("resolveContextConfig accepts edn kebab-case keys", () => {
  const cfg = resolveContextConfig({ "fresh-turns": 7 } as never);
  assertEquals(cfg.freshTurns, 7);
});

Deno.test("resolveContextConfig ignores unknown keys", () => {
  const cfg = resolveContextConfig({ bogus: 1, freshTurns: 4 } as never);
  assertEquals(cfg.freshTurns, 4);
  assertEquals("bogus" in cfg, false);
});

Deno.test("resolveContextConfig ensures all ContextConfig keys are present", () => {
  const cfg = resolveContextConfig(undefined);
  // Verify every key from DEFAULT_CONTEXT_CONFIG is present
  assertEquals(typeof cfg.freshToolOutputChars, "number");
  assertEquals(typeof cfg.staleToolOutputChars, "number");
  assertEquals(typeof cfg.freshTurns, "number");
  assertEquals(typeof cfg.compactAtFraction, "number");
  assertEquals(typeof cfg.verbatimTurnsAfterCompaction, "number");
  assertEquals(Array.isArray(cfg.deferredTools), true);
});

// The two OPTIONAL ContextConfig keys have no entry in DEFAULT_CONTEXT_CONFIG,
// so the original `if (key in out)` guard silently dropped both — in camelCase
// and in EDN kebab-case. contextWindow is the spec's only escape hatch for
// budget.ts's CONTEXT_WINDOWS map lagging a model release, so dropping it
// meant a new model silently ran against the conservative 128k fallback with
// no way for an agent to correct it. The tests above missed this because they
// only ever exercised keys that ARE in the defaults.
Deno.test("resolveContextConfig honours the optional contextWindow (camelCase)", () => {
  const cfg = resolveContextConfig({ contextWindow: 400_000 });
  assertEquals(cfg.contextWindow, 400_000);
});

Deno.test("resolveContextConfig honours the optional contextWindow (edn kebab-case)", () => {
  const cfg = resolveContextConfig({ "context-window": 400_000 } as never);
  assertEquals(cfg.contextWindow, 400_000);
});

Deno.test("resolveContextConfig honours the optional summarizationPrompt (camelCase)", () => {
  const cfg = resolveContextConfig({ summarizationPrompt: "SUMMARIZE TERSELY" });
  assertEquals(cfg.summarizationPrompt, "SUMMARIZE TERSELY");
});

Deno.test("resolveContextConfig honours the optional summarizationPrompt (edn kebab-case)", () => {
  const cfg = resolveContextConfig({ "summarization-prompt": "SUMMARIZE TERSELY" } as never);
  assertEquals(cfg.summarizationPrompt, "SUMMARIZE TERSELY");
});

// Both optional keys stay ABSENT (not present-and-undefined) when unset, so
// budget.ts's `override !== undefined` check in resolveContextWindow and
// compact.ts's `config.summarizationPrompt ?? SUMMARIZATION_PROMPT` fall
// through to their defaults as designed.
Deno.test("resolveContextConfig leaves the optional keys unset when not configured", () => {
  const cfg = resolveContextConfig({ freshTurns: 2 });
  assertEquals("contextWindow" in cfg, false);
  assertEquals("summarizationPrompt" in cfg, false);
});
