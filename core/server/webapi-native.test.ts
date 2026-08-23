import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { startNativeWebApi, waitForOidcDiscovery, WEBAPI_NATIVE_ENABLED } from "./webapi-native.ts";

// The start call used to sit inside d2eBoot(), so it only ran when D2E_COMPAT
// was set. It is on by default now, independent of that flag — a deployment
// that wants nothing else from d2e compatibility still gets its WebAPI.
Deno.test("native WebAPI is enabled by default", () => {
  assertEquals(WEBAPI_NATIVE_ENABLED, true);
});

// Boot must survive an image with no webapi extension (or an arch where it
// will not load): the node still has to come up and serve everything else.
// There is no global Trex binding under `deno test`, so this exercises the
// failure path.
Deno.test("startNativeWebApi never throws when the extension is unavailable", async () => {
  await startNativeWebApi();
});

// ── OIDC discovery wait ─────────────────────────────────────────────────────
function recorder() {
  const logs: string[] = [], errs: string[] = [];
  return { logs, errs, log: (m: string) => logs.push(m), err: (m: string) => errs.push(m) };
}

/** A discovery endpoint that 502s until `readyAfter` hits, like Caddy in front
 *  of an IdP that has not finished starting. */
function discoveryServer(readyAfter: number) {
  let hits = 0;
  const ac = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: ac.signal, onListen: () => {} },
    () => {
      hits++;
      return hits > readyAfter
        ? new Response("{}", { status: 200 })
        : new Response("", { status: 502 });
    },
  );
  return {
    url: `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/.well-known/openid-configuration`,
    hits: () => hits,
    close: async () => {
      ac.abort();
      await server.finished;
    },
  };
}

Deno.test("no wait when OIDC is disabled", async () => {
  const r = recorder();
  await waitForOidcDiscovery(r.log, r.err, { SECURITY_AUTH_OIDC_ENABLED: "false" }, 50);
  assertEquals([r.logs.length, r.errs.length], [0, 0]);
});

Deno.test("no wait when no discovery URL is configured", async () => {
  const r = recorder();
  await waitForOidcDiscovery(r.log, r.err, { SECURITY_AUTH_OIDC_ENABLED: "true" }, 50);
  assertEquals([r.logs.length, r.errs.length], [0, 0]);
});

Deno.test("returns immediately when discovery already serves", async () => {
  const s = discoveryServer(0);
  try {
    const r = recorder();
    await waitForOidcDiscovery(r.log, r.err, {
      SECURITY_AUTH_OIDC_ENABLED: "true",
      SECURITY_AUTH_OIDC_URL: s.url,
    }, 5000);
    assertEquals(s.hits(), 1);
    // Nothing to announce when there was no wait.
    assertEquals([r.logs.length, r.errs.length], [0, 0]);
  } finally {
    await s.close();
  }
});

Deno.test("waits through 502s and proceeds once discovery comes up", async () => {
  // The regression this exists for: WebAPI used to take the first 502 as fatal,
  // Tomcat never started, and the cache pipeline stranded with no retry.
  const s = discoveryServer(2);
  try {
    const r = recorder();
    await waitForOidcDiscovery(r.log, r.err, {
      SECURITY_AUTH_OIDC_ENABLED: "true",
      SECURITY_AUTH_OIDC_URL: s.url,
    }, 20000);
    assertEquals(s.hits(), 3);
    assertEquals(r.errs.length, 0);
    assertStringIncludes(r.logs[0], "waiting for OIDC discovery");
    assertStringIncludes(r.logs[1], "ready");
  } finally {
    await s.close();
  }
});

Deno.test("gives up within the budget and lets WebAPI start anyway", async () => {
  // Boot must never hang forever on a misconfigured or absent IdP.
  const r = recorder();
  const started = Date.now();
  await waitForOidcDiscovery(r.log, r.err, {
    SECURITY_AUTH_OIDC_ENABLED: "true",
    SECURITY_AUTH_OIDC_URL: "http://127.0.0.1:1/.well-known/openid-configuration",
  }, 500);
  assertEquals(Date.now() - started < 15000, true);
  assertStringIncludes(r.errs[0], "starting WebAPI anyway");
});
