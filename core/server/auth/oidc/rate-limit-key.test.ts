// The availability hole the cutover rehearsal demonstrated, and the two things
// that close it.
//
// Measured during that rehearsal: 594 unauthenticated requests took
// /oauth2/userinfo down in 2.4 seconds, and a real WebAPI login then failed
// with `[invalid_user_info_response] … 429`. Two independent causes, one test
// file each half:
//
//   1. Better Auth could not resolve a client IP, so every caller shared one
//      bucket per path. It could not resolve one because d2e's Caddyfile sends
//      `X-Forwarded-For {remote}` — Caddy's host:PORT — which isValidIP
//      refuses.
//   2. Even with per-IP limiting, the authenticated /oauth2/userinfo call that
//      every WebAPI sign-in makes shares a counter with anonymous ones.
import { assertEquals } from "jsr:@std/assert";
// The real resolver, not a model of it: these assertions are only worth
// anything if the thing that reads the header agrees.
import { getIP } from "better-auth/api";
import { normalizeForwardedFor, userInfoFailureBudget } from "./config.ts";
import { createFailureBudget, isUserInfoRefusal } from "./userinfo-limit.ts";

const resolve = (xff: string, trustedProxies: string[] = []) =>
  getIP(
    new Request("https://gateway.test/trex/oidc/oauth2/userinfo", {
      headers: { "x-forwarded-for": normalizeForwardedFor(xff) },
    }),
    { advanced: { ipAddress: { trustedProxies } } } as never,
  );

Deno.test("the address Caddy actually sends now resolves to an address", () => {
  // The exact value read off trexdb.session.ipAddress on the running stack.
  // Without normalizeForwardedFor, getIP answers null here (or 127.0.0.1 under
  // NODE_ENV=development) and every caller shares one bucket.
  assertEquals(resolve("192.168.65.1:57097"), "192.168.65.1");
});

Deno.test("two callers behind the gateway get two different keys", () => {
  // This is the property the whole fix exists for: one caller can no longer
  // spend another caller's budget.
  assertEquals(resolve("192.168.65.1:57097"), "192.168.65.1");
  assertEquals(resolve("192.168.65.1:40001"), "192.168.65.1");
  assertEquals(resolve("192.168.65.9:57097"), "192.168.65.9");
});

Deno.test("a bracketed IPv6 peer resolves too", () => {
  // Better Auth expands an IPv6 address and masks it to a /64 by default
  // (ipv6Subnet), so the bucket is per prefix rather than per address. Asserted
  // as the value it really produces rather than as the address that went in,
  // because that masked value IS the rate-limit key.
  const masked = "2001:0db8:0000:0000:0000:0000:0000:0000";
  assertEquals(resolve("[2001:db8::1]:443"), masked);
  assertEquals(resolve("[2001:db8::1]"), masked);
});

Deno.test("a bare IPv6 address is left exactly as it is", () => {
  // 2001:db8::1 and 2001:db8::1:443 are indistinguishable, so guessing would
  // silently rewrite a real address into a different one. Unchanged, and still
  // resolvable — IPv6 never needed the rewrite, because nothing puts a port on
  // it unbracketed.
  assertEquals(normalizeForwardedFor("2001:db8::1"), "2001:db8::1");
  assertEquals(normalizeForwardedFor("::1"), "::1");
  assertEquals(resolve("2001:db8::1"), "2001:0db8:0000:0000:0000:0000:0000:0000");
});

Deno.test("nothing that is not a host:port is rewritten", () => {
  for (const v of ["192.168.65.1", "unknown", "192.168.65.1:notaport", ""]) {
    assertEquals(normalizeForwardedFor(v), v, v);
  }
});

Deno.test("normalising does not make a multi-hop header spoofable", () => {
  // The single-token rule still applies: without TREX_TRUSTED_PROXIES a header
  // carrying more than one address resolves to null, exactly as before. A
  // client that prepends its own value therefore gains nothing — it only loses
  // itself the per-IP bucket it would otherwise have had.
  assertEquals(normalizeForwardedFor("1.2.3.4, 192.168.65.1:57097"), "1.2.3.4, 192.168.65.1");
  assertEquals(resolve("1.2.3.4, 192.168.65.1:57097"), null);
  // With the proxy declared, the chain is walked from the RIGHT and the real
  // peer wins over the prepended value — which only works because the real
  // peer's port is gone.
  assertEquals(resolve("1.2.3.4, 192.168.65.1:57097", ["192.168.65.0/24"]), "1.2.3.4");
});

// ── The second half: a flood of failures cannot spend a sign-in's budget ───

Deno.test("only a refusal is charged — a successful sign-in costs nothing", () => {
  // The rehearsal's flood carried an INVALID BEARER, so "does it present a
  // token" is a test an attacker passes by typing one more word. What has no
  // legitimate volume is a userinfo request the provider REFUSES; the one call
  // every WebAPI sign-in makes answers 200.
  assertEquals(isUserInfoRefusal(401), true, "invalid/expired token, or none at all");
  assertEquals(isUserInfoRefusal(400), true, "malformed request");
  assertEquals(isUserInfoRefusal(200), false, "a real sign-in");
  // trex's own fault. Charging a caller for it would let an outage lock
  // everyone out on top of the outage.
  assertEquals(isUserInfoRefusal(500), false);
  assertEquals(isUserInfoRefusal(502), false);
  // Already throttled; counted by the caller, not by this predicate.
  assertEquals(isUserInfoRefusal(429), false);
});

Deno.test("the budget is spent per key, not globally", () => {
  const budget = createFailureBudget(3, 60_000, () => 1_000);
  for (let i = 0; i < 3; i++) {
    assertEquals(budget.overBudget("a"), false, `a#${i}`);
    budget.record("a");
  }
  assertEquals(budget.overBudget("a"), true, "a has spent its budget");
  // b is untouched by a's flood. Per-IP keying is what the header fix buys, and
  // this is what it buys it FOR — one caller can no longer deny the endpoint to
  // everyone else.
  assertEquals(budget.overBudget("b"), false);
});

Deno.test("a refused caller stays refused for the rest of its window", () => {
  // The refusal has to be sticky, and Retry-After has to be the truth. A budget
  // that forgave a caller the moment it refused one would turn an attacker's
  // flood into a 50% success rate instead of a refusal.
  let now = 1_000;
  const budget = createFailureBudget(2, 60_000, () => now);
  budget.record("a");
  budget.record("a");
  for (let i = 0; i < 100; i++) {
    assertEquals(budget.overBudget("a"), true, `still refused #${i}`);
    budget.record("a");
  }
  assertEquals(budget.retryAfter("a"), 60);
  now = 61_001;
  assertEquals(budget.overBudget("a"), false, "the window really does reset");
});

Deno.test("expired windows are dropped, so the budget is not its own DoS", () => {
  // One entry per address, kept forever, would be a memory exhaustion lever in
  // the thing that exists to prevent exhaustion.
  let now = 1_000;
  const budget = createFailureBudget(1, 60_000, () => now);
  for (let i = 0; i < 500; i++) budget.record(`ip-${i}`);
  assertEquals(budget.size(), 500);
  now = 61_001;
  budget.record("someone-else");
  assertEquals(budget.size(), 1);
});

Deno.test("the failure budget is far smaller than the traffic ceiling", () => {
  // Not the same knob and not the same number: TREX_OIDC_RATE_LIMIT_MAX is 600
  // requests, this is 60 FAILURES. 594 of them is what took the endpoint down.
  assertEquals(userInfoFailureBudget(undefined), 60);
  assertEquals(userInfoFailureBudget("5"), 5);
  // Garbage falls back rather than disabling the budget.
  for (const bad of ["", "0", "-1", "abc", "1.5"]) {
    assertEquals(userInfoFailureBudget(bad), 60, bad);
  }
});
