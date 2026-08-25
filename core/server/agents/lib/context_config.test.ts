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
