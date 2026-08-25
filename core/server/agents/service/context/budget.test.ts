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

Deno.test("shouldCompact fires at the fraction and not below", () => {
  assertEquals(shouldCompact({ inputTokens: 75_000, window: 100_000, fraction: 0.75 }), true);
  assertEquals(shouldCompact({ inputTokens: 74_000, window: 100_000, fraction: 0.75 }), false);
});

Deno.test("defaults are conservative for unconfigured agents", () => {
  assertEquals(DEFAULT_CONTEXT_CONFIG.deferredTools, []);
  assertEquals(DEFAULT_CONTEXT_CONFIG.freshTurns, 3);
  assertEquals(DEFAULT_CONTEXT_CONFIG.compactAtFraction, 0.75);
  assert(DEFAULT_CONTEXT_CONFIG.staleToolOutputChars < DEFAULT_CONTEXT_CONFIG.freshToolOutputChars);
});
