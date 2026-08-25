import { assert, assertEquals } from "jsr:@std/assert";
import {
  DEFAULT_CONTEXT_CONFIG, estimateTokens, FALLBACK_CONTEXT_WINDOW,
  resolveContextWindow, shouldCompact,
} from "./budget.ts";

Deno.test("estimateTokens approximates 4 chars per token", () => {
  assertEquals(estimateTokens("x".repeat(400)), 100);
  assertEquals(estimateTokens(""), 0);
});

Deno.test("resolveContextWindow prefers explicit override", () => {
  assertEquals(resolveContextWindow("claude-sonnet-5", 999), 999);
});

Deno.test("resolveContextWindow falls back for unknown model", () => {
  assertEquals(resolveContextWindow("some-unreleased-model"), FALLBACK_CONTEXT_WINDOW);
  assertEquals(FALLBACK_CONTEXT_WINDOW, 128_000);
});

Deno.test("resolveContextWindow reads known model ids from the map", () => {
  assertEquals(resolveContextWindow("claude-opus-5"), 1_000_000);
  assertEquals(resolveContextWindow("claude-haiku-4-5"), 200_000);
});

Deno.test("shouldCompact fires at the fraction and not below", () => {
  assertEquals(shouldCompact({ inputTokens: 75_000, window: 100_000, fraction: 0.75 }), true);
  assertEquals(shouldCompact({ inputTokens: 74_000, window: 100_000, fraction: 0.75 }), false);
});

// An optional absolute ceiling on top of the fraction: on a 1M window,
// 0.75 first compacts around 750k input tokens, which is a correct but very
// expensive single request. The trigger is min(fraction * window, ceiling).
Deno.test("shouldCompact: the ceiling binds when it is lower than the fraction", () => {
  // fraction would fire at 750_000; the ceiling pulls it down to 200_000.
  assertEquals(shouldCompact({ inputTokens: 200_000, window: 1_000_000, fraction: 0.75, ceiling: 200_000 }), true);
  assertEquals(shouldCompact({ inputTokens: 199_999, window: 1_000_000, fraction: 0.75, ceiling: 200_000 }), false);
});

Deno.test("shouldCompact: the fraction binds when it is lower than the ceiling", () => {
  // fraction fires at 75_000; a 200_000 ceiling must not delay it.
  assertEquals(shouldCompact({ inputTokens: 75_000, window: 100_000, fraction: 0.75, ceiling: 200_000 }), true);
  assertEquals(shouldCompact({ inputTokens: 74_000, window: 100_000, fraction: 0.75, ceiling: 200_000 }), false);
});

Deno.test("shouldCompact: an unset ceiling behaves exactly as the fraction alone", () => {
  for (const inputTokens of [0, 74_000, 75_000, 749_999, 750_000, 1_000_000]) {
    assertEquals(
      shouldCompact({ inputTokens, window: 1_000_000, fraction: 0.75, ceiling: undefined }),
      shouldCompact({ inputTokens, window: 1_000_000, fraction: 0.75 }),
      `ceiling:undefined diverged from the fraction alone at ${inputTokens}`,
    );
  }
  assertEquals(shouldCompact({ inputTokens: 749_999, window: 1_000_000, fraction: 0.75 }), false);
  assertEquals(shouldCompact({ inputTokens: 750_000, window: 1_000_000, fraction: 0.75 }), true);
});

// claw and d2esupport configure no `context` block at all, so the default
// must leave the ceiling unset and their trigger unchanged.
Deno.test("DEFAULT_CONTEXT_CONFIG sets no compaction ceiling", () => {
  assertEquals("compactAtTokens" in DEFAULT_CONTEXT_CONFIG, false);
});

Deno.test("defaults are conservative for unconfigured agents", () => {
  assertEquals(DEFAULT_CONTEXT_CONFIG.deferredTools, []);
  assertEquals(DEFAULT_CONTEXT_CONFIG.freshTurns, 3);
  assertEquals(DEFAULT_CONTEXT_CONFIG.compactAtFraction, 0.75);
  assert(DEFAULT_CONTEXT_CONFIG.staleToolOutputChars < DEFAULT_CONTEXT_CONFIG.freshToolOutputChars);
});
