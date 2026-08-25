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
