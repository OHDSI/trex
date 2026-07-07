import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { type BrokerCtx, resolveOAuthAuth } from "./broker.ts";
import { verifyState } from "./state.ts";
import type { OAuthConnector, OAuthStore, OAuthToken } from "./store.ts";

const SECRET = "broker-test-secret";

// A minimal in-memory OAuthStore-shaped fake: a token map keyed
// (principalType|principalId|connector) plus a connector registry.
function fakeStore(opts: {
  tokens?: Record<string, OAuthToken>;
  connectors?: Record<string, OAuthConnector>;
} = {}): OAuthStore & { puts: Array<{ key: string; token: OAuthToken }> } {
  const tokens = { ...(opts.tokens ?? {}) };
  const connectors = opts.connectors ?? {};
  const puts: Array<{ key: string; token: OAuthToken }> = [];
  const key = (pt: string, pid: string, c: string) => `${pt}|${pid}|${c}`;
  return {
    getToken: (pt, pid, c) => Promise.resolve(tokens[key(pt, pid, c)] ?? null),
    putToken: (pt, pid, c, t) => {
      tokens[key(pt, pid, c)] = t;
      puts.push({ key: key(pt, pid, c), token: t });
      return Promise.resolve();
    },
    getConnector: (id) => Promise.resolve(connectors[id] ?? null),
    puts,
  } as OAuthStore & { puts: Array<{ key: string; token: OAuthToken }> };
}

function connector(over: Partial<OAuthConnector> = {}): OAuthConnector {
  return {
    authorizationUrl: "https://prov.example/auth",
    tokenUrl: "https://prov.example/token",
    clientId: "cid",
    clientSecret: "csecret",
    scopes: "repo",
    principalScope: "user",
    ...over,
  };
}

function ctx(over: Partial<BrokerCtx> = {}): BrokerCtx {
  return {
    sessionId: "s-1",
    principal: { principalType: "user", principalId: "u-1" },
    secret: SECRET,
    startUrlBase: "/plugins/trex/toy/eve/v1/oauth",
    now: () => 1_000_000,
    ...over,
  };
}

Deno.test("valid stored token → { token }", async () => {
  const store = fakeStore({
    tokens: {
      "user|u-1|github": { access: "at", refresh: "rt", expiresAt: new Date(1_000_000 + 3_600_000), scopes: "repo" },
    },
  });
  const res = await resolveOAuthAuth(store, { kind: "oauth", connector: "github", principalType: "user" }, ctx());
  assertEquals(res, { token: "at" });
  assertEquals(store.puts.length, 0);
});

Deno.test("token with no expiry is never near-expiry → { token }", async () => {
  const store = fakeStore({
    tokens: { "app|__app__|slack": { access: "app-at", refresh: null, expiresAt: null, scopes: null } },
  });
  const res = await resolveOAuthAuth(store, { kind: "oauth", connector: "slack", principalType: "app" }, ctx());
  assertEquals(res, { token: "app-at" });
});

Deno.test("near-expiry token is refreshed via the token endpoint and persisted", async () => {
  const store = fakeStore({
    tokens: {
      "user|u-1|github": { access: "old", refresh: "rt-old", expiresAt: new Date(1_000_000 + 10_000), scopes: "repo" },
    },
    connectors: { github: connector() },
  });
  const calls: Array<{ url: string; body: string }> = [];
  const fetchMock = (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "new", refresh_token: "rt-new", expires_in: 3600, scope: "repo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  const res = await resolveOAuthAuth(
    store,
    { kind: "oauth", connector: "github", principalType: "user" },
    ctx({ fetch: fetchMock, refreshWindowMs: 60_000 }),
  );
  assertEquals(res, { token: "new" });
  // Hit the connector's token endpoint with a refresh_token grant + creds.
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://prov.example/token");
  assert(calls[0].body.includes("grant_type=refresh_token"));
  assert(calls[0].body.includes("refresh_token=rt-old"));
  assert(calls[0].body.includes("client_secret=csecret"));
  // New token persisted under the same key.
  assertEquals(store.puts.length, 1);
  assertEquals(store.puts[0].token.access, "new");
  assertEquals(store.puts[0].token.refresh, "rt-new");
});

Deno.test("near-expiry token whose refresh is rejected → authorizationRequired", async () => {
  const store = fakeStore({
    tokens: {
      "user|u-1|github": { access: "old", refresh: "rt", expiresAt: new Date(1_000_000 + 10_000), scopes: "repo" },
    },
    connectors: { github: connector() },
  });
  const fetchMock = () => Promise.resolve(new Response("nope", { status: 400 }));
  const res = await resolveOAuthAuth(
    store,
    { kind: "oauth", connector: "github", principalType: "user" },
    ctx({ fetch: fetchMock }),
  );
  assert("authorizationRequired" in res);
  assertEquals(store.puts.length, 0);
});

Deno.test("absent token → authorizationRequired with a valid signed state", async () => {
  const store = fakeStore({ connectors: { github: connector() } });
  const res = await resolveOAuthAuth(
    store,
    { kind: "oauth", connector: "github", principalType: "user" },
    ctx(),
  );
  assert("authorizationRequired" in res);
  const url = new URL("http://x" + res.authorizationRequired.url.replace(/^[^/]*/, ""));
  assert(res.authorizationRequired.url.startsWith("/plugins/trex/toy/eve/v1/oauth/github/start?state="));
  const state = url.searchParams.get("state")!;
  const v = await verifyState(state, SECRET, 1_000_000);
  assert(v.ok);
  assertEquals(v.payload.session, "s-1");
  assertEquals(v.payload.connector, "github");
  assertEquals(v.payload.principalType, "user");
  assertEquals(v.payload.principalId, "u-1");
  assert(v.payload.exp > 1_000_000);
});

Deno.test("app-scoped connection uses the __app__ principal", async () => {
  const store = fakeStore({ connectors: { slack: connector({ principalScope: "app" }) } });
  const res = await resolveOAuthAuth(
    store,
    { kind: "oauth", connector: "slack", principalType: "app" },
    ctx({ principal: null }), // no end-user principal, but app-scoped resolves anyway
  );
  assert("authorizationRequired" in res);
  const url = new URL("http://x" + res.authorizationRequired.url);
  const v = await verifyState(url.searchParams.get("state")!, SECRET, 1_000_000);
  assert(v.ok);
  assertEquals(v.payload.principalType, "app");
  assertEquals(v.payload.principalId, "__app__");
});

Deno.test("no principal on a user-scoped connection → principal_required (terminal, fail closed)", async () => {
  const store = fakeStore({ connectors: { github: connector() } });
  const res = await resolveOAuthAuth(
    store,
    { kind: "oauth", connector: "github", principalType: "user" },
    ctx({ principal: null }),
  );
  assertEquals(res, { error: "principal_required" });
});

Deno.test("refresh with an unset client secret is a hard error (never posts undefined)", async () => {
  const store = fakeStore({
    tokens: {
      "user|u-1|github": { access: "old", refresh: "rt", expiresAt: new Date(1_000_000 + 10_000), scopes: "repo" },
    },
    connectors: { github: connector({ clientSecret: undefined }) },
  });
  let fetched = false;
  const fetchMock = () => {
    fetched = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  await assertRejects(
    () =>
      resolveOAuthAuth(
        store,
        { kind: "oauth", connector: "github", principalType: "user" },
        ctx({ fetch: fetchMock }),
      ),
    Error,
    "client secret env-ref is unset",
  );
  assertEquals(fetched, false);
});
