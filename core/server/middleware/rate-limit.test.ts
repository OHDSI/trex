import { assertEquals } from "jsr:@std/assert";
import { apiRateLimitMax, authRateLimitMax } from "./rate-limit.ts";

// Both parsers take the raw env value as a parameter so the ceiling can be
// checked without mutating the process environment (the limiters themselves
// read it once, at module load).

Deno.test("authRateLimitMax falls back to 600 for an absent or unusable value", () => {
  for (const raw of [undefined, "", "   ", "abc", "0", "-5", "12.5", "NaN", "Infinity"]) {
    assertEquals(authRateLimitMax(raw), 600, `expected the default for ${JSON.stringify(raw)}`);
  }
});

Deno.test("authRateLimitMax honours a positive integer", () => {
  assertEquals(authRateLimitMax("20"), 20);
  assertEquals(authRateLimitMax("5000"), 5000);
});

Deno.test("apiRateLimitMax falls back to 5000 for an absent or unusable value", () => {
  for (const raw of [undefined, "", "   ", "abc", "0", "-1", "999.9", "NaN", "Infinity"]) {
    assertEquals(apiRateLimitMax(raw), 5000, `expected the default for ${JSON.stringify(raw)}`);
  }
});

Deno.test("apiRateLimitMax honours a positive integer", () => {
  // The case this exists for: a page that issues more requests than the
  // default bucket holds (d2e's filtering-barchart, >10k XHRs per shard).
  assertEquals(apiRateLimitMax("50000"), 50000);
  assertEquals(apiRateLimitMax("1"), 1);
});

Deno.test("both parsers accept exponent notation, since Number() does", () => {
  // Not a deliberate feature, but it is what the existing authLimiter parser
  // does, and the two must not disagree about what a valid value is.
  assertEquals(authRateLimitMax("1e3"), 1000);
  assertEquals(apiRateLimitMax("1e4"), 10000);
});
