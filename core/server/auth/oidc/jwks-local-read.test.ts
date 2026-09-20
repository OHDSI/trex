import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { createJwksLocalReadFetch, providerJwksUrl } from "./jwks-local-read.ts";

const ISSUER = "https://localhost:443/trex/oidc";
const JWKS_PATH = "/.well-known/jwks.json";
const TARGET = `${ISSUER}${JWKS_PATH}`;
const KEYS = { keys: [{ kid: "k1", kty: "RSA", n: "n", e: "AQAB" }] };

/** A fetch that fails the test if it is ever reached, unless a reply is given. */
function recordingFetch(reply?: Response) {
  const calls: string[] = [];
  const fn = ((input: RequestInfo | URL) => {
    calls.push(typeof input === "string" ? input : (input as Request).url ?? String(input));
    return Promise.resolve(reply ?? new Response("upstream", { status: 200 }));
  }) as unknown as typeof fetch;
  return { fn, calls };
}

Deno.test("the provider's own key set is served locally and never leaves the process", async () => {
  const real = recordingFetch();
  const f = createJwksLocalReadFetch({
    jwksUrl: TARGET,
    readJwks: () => Promise.resolve(KEYS),
    realFetch: real.fn,
  });

  const res = await f(TARGET);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(await res.json(), KEYS);
  // The whole point: no network request was made.
  assertEquals(real.calls, []);
});

// fetch takes three argument shapes and the provider is free to use any of
// them; missing one would silently reinstate the bug.
Deno.test("the target is recognised as a string, a URL and a Request", async () => {
  for (const input of [TARGET, new URL(TARGET), new Request(TARGET)] as const) {
    const real = recordingFetch();
    const f = createJwksLocalReadFetch({
      jwksUrl: TARGET,
      readJwks: () => Promise.resolve(KEYS),
      realFetch: real.fn,
    });

    assertEquals(await (await f(input)).json(), KEYS, String(input));
    assertEquals(real.calls, [], String(input));
  }
});

// THE SECURITY CASE. trex federates to upstream IdPs and fetches their key
// sets; answering one of those from trex's own keys would let a token trex
// signed pass as the upstream's. A substring match on "/jwks" would do exactly
// that, which is why the comparison is on the whole URL.
Deno.test("another issuer's key set is NOT intercepted", async () => {
  const upstream = "https://logto.example.test/oidc/.well-known/jwks.json";
  const real = recordingFetch(new Response(JSON.stringify({ keys: ["upstream"] })));
  const f = createJwksLocalReadFetch({
    jwksUrl: TARGET,
    // Resolves, deliberately. With a rejecting read, fail-open would send the
    // request on anyway and interception would be indistinguishable from
    // pass-through — a mutation to a substring match passed against exactly
    // that mistake.
    readJwks: () => Promise.resolve(KEYS),
    realFetch: real.fn,
  });

  // trex's own keys must NOT come back in place of the upstream's.
  assertEquals(await (await f(upstream)).json(), { keys: ["upstream"] });
  assertEquals(real.calls, [upstream]);
});

// Same host, different path — the provider's neighbours must not be swallowed.
Deno.test("another path on the same origin is NOT intercepted", async () => {
  const sibling = `${ISSUER}/oauth2/token`;
  const real = recordingFetch(new Response(JSON.stringify({ from: "upstream" })));
  const f = createJwksLocalReadFetch({
    jwksUrl: TARGET,
    readJwks: () => Promise.resolve(KEYS),
    realFetch: real.fn,
  });

  assertEquals(await (await f(sibling)).json(), { from: "upstream" });
  assertEquals(real.calls, [sibling]);
});

// Failing closed would turn a recoverable condition into a refused logout,
// which is the failure this module exists to remove.
Deno.test("a local read failure falls through to the real fetch", async () => {
  const real = recordingFetch(new Response("from the network", { status: 200 }));
  const seen: unknown[] = [];
  const f = createJwksLocalReadFetch({
    jwksUrl: TARGET,
    readJwks: () => Promise.reject(new Error("adapter down")),
    realFetch: real.fn,
    onError: (e) => seen.push(e),
  });

  assertEquals(await (await f(TARGET)).text(), "from the network");
  assertEquals(real.calls, [TARGET]);
  assertEquals(seen.length, 1);
  assertStringIncludes(String(seen[0]), "adapter down");
});

// An unparseable configured URL must not take the engine down at boot, and must
// not swallow traffic either.
Deno.test("an unusable target makes the wrapper a pass-through", async () => {
  const real = recordingFetch();
  const f = createJwksLocalReadFetch({
    jwksUrl: "not a url",
    readJwks: () => Promise.reject(new Error("must not be consulted")),
    realFetch: real.fn,
  });

  await f(TARGET);
  assertEquals(real.calls, [TARGET]);
});

// A relative URL has no absolute form here and is never the provider's own key
// set; it must reach the real fetch rather than throw inside it.
Deno.test("a relative URL is passed through untouched", async () => {
  const real = recordingFetch();
  const f = createJwksLocalReadFetch({
    jwksUrl: TARGET,
    readJwks: () => Promise.reject(new Error("must not be consulted")),
    realFetch: real.fn,
  });

  await f("/relative/path");
  assertEquals(real.calls, ["/relative/path"]);
});

// The init argument is what carries method, headers and body; dropping it would
// corrupt every request that merely passes through.
Deno.test("the init argument survives pass-through", async () => {
  let seenInit: RequestInit | undefined;
  const real = ((_i: RequestInfo | URL, init?: RequestInit) => {
    seenInit = init;
    return Promise.resolve(new Response("ok"));
  }) as unknown as typeof fetch;
  const f = createJwksLocalReadFetch({
    jwksUrl: TARGET,
    readJwks: () => Promise.reject(new Error("must not be consulted")),
    realFetch: real,
  });

  await f("https://elsewhere.test/x", { method: "POST", body: "payload" });

  assertEquals(seenInit?.method, "POST");
  assertEquals(seenInit?.body, "payload");
});

Deno.test("providerJwksUrl builds exactly what the provider builds", () => {
  assertEquals(providerJwksUrl(ISSUER, JWKS_PATH), TARGET);
  // A trailing slash on the issuer is the shape that would otherwise produce a
  // double slash and stop matching.
  assertEquals(providerJwksUrl(`${ISSUER}/`, JWKS_PATH), TARGET);
  // The plugin's own default, for a deployment that configures no path.
  assertEquals(providerJwksUrl(ISSUER, "/jwks"), `${ISSUER}/jwks`);
});
