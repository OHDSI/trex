import { assert, assertEquals } from "jsr:@std/assert";
import { handleOAuthCallback, handleOAuthStart, type OAuthRouteDeps } from "./routes.ts";
import { signState, type StatePayload } from "./state.ts";
import type { OAuthConnector, OAuthStore, OAuthToken } from "./store.ts";

const SECRET = "routes-test-secret";
const BASE = "/plugins/trex/toy";

function fakeStore(opts: {
  connectors?: Record<string, OAuthConnector>;
} = {}): OAuthStore & { puts: Array<{ pt: string; pid: string; c: string; token: OAuthToken }> } {
  const connectors = opts.connectors ?? {};
  const puts: Array<{ pt: string; pid: string; c: string; token: OAuthToken }> = [];
  return {
    getToken: () => Promise.resolve(null),
    putToken: (pt, pid, c, token) => {
      puts.push({ pt, pid, c, token });
      return Promise.resolve();
    },
    getConnector: (id) => Promise.resolve(connectors[id] ?? null),
    puts,
  } as OAuthStore & { puts: Array<{ pt: string; pid: string; c: string; token: OAuthToken }> };
}

function connector(over: Partial<OAuthConnector> = {}): OAuthConnector {
  return {
    authorizationUrl: "https://prov.example/authorize",
    tokenUrl: "https://prov.example/token",
    clientId: "cid",
    clientSecret: "csecret",
    scopes: "repo user",
    principalScope: "user",
    ...over,
  };
}

function payload(over: Partial<StatePayload> = {}): StatePayload {
  return {
    session: "s-1",
    principalType: "user",
    principalId: "u-1",
    connector: "github",
    nonce: "n-1",
    exp: 2_000_000,
    ...over,
  };
}

const NOW = () => 1_000_000;

function deps(over: Partial<OAuthRouteDeps> = {}): OAuthRouteDeps {
  return {
    connector: "github",
    store: fakeStore({ connectors: { github: connector() } }),
    secret: SECRET,
    basePath: BASE,
    now: NOW,
    ...over,
  };
}

Deno.test("start: valid state → 302 to the provider's authorization endpoint with fixed redirect_uri", async () => {
  const state = await signState(payload(), SECRET);
  const d = deps();
  const req = new Request(`https://host.example${BASE}/eve/v1/oauth/github/start?state=${encodeURIComponent(state)}`);
  const res = await handleOAuthStart(req, d);
  assertEquals(res.status, 302);
  const loc = new URL(res.headers.get("location")!);
  assertEquals(loc.origin + loc.pathname, "https://prov.example/authorize");
  assertEquals(loc.searchParams.get("response_type"), "code");
  assertEquals(loc.searchParams.get("client_id"), "cid");
  assertEquals(loc.searchParams.get("scope"), "repo user");
  // redirect_uri is fixed from the request origin + basePath, not attacker input.
  assertEquals(loc.searchParams.get("redirect_uri"), `https://host.example${BASE}/eve/v1/oauth/github/callback`);
  // the same signed state is threaded through
  assertEquals(loc.searchParams.get("state"), state);
});

Deno.test("start: bad/absent state → 400, no redirect", async () => {
  const d = deps();
  const noState = new Request(`https://host.example${BASE}/eve/v1/oauth/github/start`);
  assertEquals((await handleOAuthStart(noState, d)).status, 400);
  const bad = new Request(`https://host.example${BASE}/eve/v1/oauth/github/start?state=tampered.sig`);
  assertEquals((await handleOAuthStart(bad, d)).status, 400);
});

Deno.test("callback: valid code → exchange at tokenUrl → putToken under the state's principal", async () => {
  const state = await signState(payload(), SECRET);
  const calls: Array<{ url: string; body: string }> = [];
  const fetchMock = (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_in: 3600, scope: "repo user" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const store = fakeStore({ connectors: { github: connector() } });
  const d = deps({ store, fetch: fetchMock });
  const req = new Request(
    `https://host.example${BASE}/eve/v1/oauth/github/callback?code=THECODE&state=${encodeURIComponent(state)}`,
  );
  const res = await handleOAuthCallback(req, d);
  assertEquals(res.status, 200);
  // exchanged an authorization_code grant against the token endpoint
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://prov.example/token");
  assert(calls[0].body.includes("grant_type=authorization_code"));
  assert(calls[0].body.includes("code=THECODE"));
  assert(calls[0].body.includes("client_secret=csecret"));
  assert(calls[0].body.includes(encodeURIComponent(`https://host.example${BASE}/eve/v1/oauth/github/callback`)));
  // token persisted under the state's (principalType, principalId, connector)
  assertEquals(store.puts.length, 1);
  assertEquals(store.puts[0], {
    pt: "user",
    pid: "u-1",
    c: "github",
    token: { access: "AT", refresh: "RT", expiresAt: new Date(1_000_000 + 3_600_000), scopes: "repo user" },
  });
});

Deno.test("callback: tampered state → 400 and NOTHING is exchanged or written", async () => {
  let fetched = false;
  const fetchMock = () => {
    fetched = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const store = fakeStore({ connectors: { github: connector() } });
  const d = deps({ store, fetch: fetchMock });
  const req = new Request(
    `https://host.example${BASE}/eve/v1/oauth/github/callback?code=X&state=forged.signature`,
  );
  const res = await handleOAuthCallback(req, d);
  assertEquals(res.status, 400);
  assertEquals(fetched, false);
  assertEquals(store.puts.length, 0);
});

Deno.test("callback: expired state → 400, no write", async () => {
  const state = await signState(payload({ exp: 500_000 }), SECRET); // < NOW
  const store = fakeStore({ connectors: { github: connector() } });
  const d = deps({ store });
  const req = new Request(
    `https://host.example${BASE}/eve/v1/oauth/github/callback?code=X&state=${encodeURIComponent(state)}`,
  );
  assertEquals((await handleOAuthCallback(req, d)).status, 400);
  assertEquals(store.puts.length, 0);
});

Deno.test("callback: connector with unset client secret → 500 hard error, no exchange", async () => {
  const state = await signState(payload(), SECRET);
  let fetched = false;
  const fetchMock = () => {
    fetched = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const store = fakeStore({ connectors: { github: connector({ clientSecret: undefined }) } });
  const d = deps({ store, fetch: fetchMock });
  const req = new Request(
    `https://host.example${BASE}/eve/v1/oauth/github/callback?code=X&state=${encodeURIComponent(state)}`,
  );
  const res = await handleOAuthCallback(req, d);
  assertEquals(res.status, 500);
  assertEquals(fetched, false);
  assertEquals(store.puts.length, 0);
});

Deno.test("callback: connector with an EMPTY client secret → 500 hard error, no exchange", async () => {
  const state = await signState(payload(), SECRET);
  let fetched = false;
  const fetchMock = () => {
    fetched = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const store = fakeStore({ connectors: { github: connector({ clientSecret: "" }) } });
  const d = deps({ store, fetch: fetchMock });
  const req = new Request(
    `https://host.example${BASE}/eve/v1/oauth/github/callback?code=X&state=${encodeURIComponent(state)}`,
  );
  const res = await handleOAuthCallback(req, d);
  assertEquals(res.status, 500);
  assertEquals(fetched, false);
  assertEquals(store.puts.length, 0);
});

Deno.test("callback: state connector must match the path connector", async () => {
  const state = await signState(payload({ connector: "gitlab" }), SECRET);
  const store = fakeStore({ connectors: { github: connector() } });
  const d = deps({ store }); // path connector = github
  const req = new Request(
    `https://host.example${BASE}/eve/v1/oauth/github/callback?code=X&state=${encodeURIComponent(state)}`,
  );
  assertEquals((await handleOAuthCallback(req, d)).status, 400);
  assertEquals(store.puts.length, 0);
});
