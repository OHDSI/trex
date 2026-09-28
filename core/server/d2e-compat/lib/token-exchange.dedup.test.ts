import { assertEquals } from "jsr:@std/assert";
import { _resetInflightExchanges, getWebApiToken } from "./token-exchange.ts";

// A token whose `sub` decodeJwt can read; nothing verifies it here.
function tokenFor(sub: string): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64({ sub })}.sig`;
}

/** Replaces fetch, counting openidDirect calls and holding them open on demand. */
function stubFetch(opts: { hold?: boolean } = {}) {
  // EVERY held call is released, not just the last. Releasing one would leave
  // the others pending forever without the fix, and the test would hang instead
  // of failing -- a hang in CI says far less than an assertion does.
  const pending: Array<() => void> = [];
  const state = { calls: 0, release: () => pending.splice(0).forEach((r) => r()) };
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request) => {
    const u = typeof url === "string" ? url : (url as Request).url ?? String(url);
    if (!u.includes("openidDirect")) return Promise.resolve(new Response("{}", { status: 200 }));
    state.calls++;
    const body = JSON.stringify({ jwt: "webapi-jwt" });
    const respond = () => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    if (!opts.hold) return Promise.resolve(respond());
    return new Promise<Response>((resolve) => { pending.push(() => resolve(respond())); });
  }) as unknown as typeof fetch;
  return { state, restore: () => { globalThis.fetch = original; } };
}

// THE BUG. openidDirect rewrites webapi.SEC_USER_ROLE, so two at once for one
// user means the second deletes nothing and WebAPI answers 500 with
// ObjectOptimisticLockingFailureException. Atlas asks /vocabulary/{key}/info
// for every source at once -- 16 on develop -- so this was not a rare race.
Deno.test("concurrent callers for one subject share a single exchange", async () => {
  _resetInflightExchanges();
  const f = stubFetch({ hold: true });
  try {
    const token = tokenFor("user-a");
    const all = Promise.all(Array.from({ length: 16 }, () => getWebApiToken(token)));
    await new Promise((r) => setTimeout(r, 20)); // let them all arrive
    f.state.release();
    const results = await all;

    assertEquals(f.state.calls, 1, "16 concurrent callers must cause exactly one exchange");
    assertEquals(results, Array(16).fill("webapi-jwt"), "every caller gets the token");
  } finally {
    f.restore();
  }
});

// Different users must not be collapsed into one another's exchange.
Deno.test("different subjects exchange independently", async () => {
  _resetInflightExchanges();
  const f = stubFetch();
  try {
    await Promise.all([getWebApiToken(tokenFor("user-a")), getWebApiToken(tokenFor("user-b"))]);
    assertEquals(f.state.calls, 2);
  } finally {
    f.restore();
  }
});

// Sequential calls must still exchange: the map holds a promise only while it
// is unresolved, so a role change takes effect on the next call as before.
Deno.test("a later call exchanges again rather than reusing a finished one", async () => {
  _resetInflightExchanges();
  const f = stubFetch();
  try {
    await getWebApiToken(tokenFor("user-a"));
    await getWebApiToken(tokenFor("user-a"));
    assertEquals(f.state.calls, 2);
  } finally {
    f.restore();
  }
});

// A failure must not be latched: the next caller has to be able to try again.
Deno.test("a failed exchange is not cached as a rejection", async () => {
  _resetInflightExchanges();
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((url: string | URL | Request) => {
    const u = typeof url === "string" ? url : (url as Request).url ?? String(url);
    if (!u.includes("openidDirect")) return Promise.resolve(new Response("{}", { status: 200 }));
    calls++;
    return Promise.resolve(new Response("boom", { status: 500 }));
  }) as unknown as typeof fetch;
  try {
    assertEquals(await getWebApiToken(tokenFor("user-a")), null);
    assertEquals(await getWebApiToken(tokenFor("user-a")), null);
    assertEquals(calls, 2, "the second caller must retry, not inherit the first failure");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("a token with no subject is rejected without exchanging", async () => {
  _resetInflightExchanges();
  const f = stubFetch();
  try {
    assertEquals(await getWebApiToken("not-a-jwt"), null);
    assertEquals(f.state.calls, 0);
  } finally {
    f.restore();
  }
});
