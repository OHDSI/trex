import { assert, assertEquals } from "jsr:@std/assert";
import { buildConnectionProvider, type OAuthProviderDeps } from "./provider.ts";
import type { ConnectionDef } from "./types.ts";
import type { HookCtx } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import type { OAuthConnector, OAuthStore, OAuthToken } from "./oauth/store.ts";

const SECRET = "provider-oauth-secret";

function fakeStore(seed: Record<string, OAuthToken> = {}): OAuthStore & {
  set: (k: string, t: OAuthToken) => void;
} {
  const tokens: Record<string, OAuthToken> = { ...seed };
  const connectors: Record<string, OAuthConnector> = {
    github: {
      authorizationUrl: "https://prov.example/auth",
      tokenUrl: "https://prov.example/token",
      clientId: "cid",
      clientSecret: "csecret",
      scopes: "repo",
      principalScope: "user",
    },
  };
  const key = (pt: string, pid: string, c: string) => `${pt}|${pid}|${c}`;
  return {
    getToken: (pt, pid, c) => Promise.resolve(tokens[key(pt, pid, c)] ?? null),
    putToken: (pt, pid, c, t) => {
      tokens[key(pt, pid, c)] = t;
      return Promise.resolve();
    },
    getConnector: (id) => Promise.resolve(connectors[id] ?? null),
    set: (k, t) => {
      tokens[k] = t;
    },
  } as OAuthStore & { set: (k: string, t: OAuthToken) => void };
}

const OPENAPI_SPEC = {
  openapi: "3.0.0",
  servers: [{ url: "https://api.example.com" }],
  paths: { "/ping": { get: { operationId: "ping", summary: "Ping" } } },
};

function oauthConn(): ConnectionDef {
  return {
    __trexConnection: true,
    type: "openapi",
    name: "gh",
    description: "GitHub",
    spec: OPENAPI_SPEC,
    auth: { kind: "oauth", connector: "github", principalType: "user" },
  };
}

function fakeAgent(connections: Record<string, ConnectionDef>): LoadedAgent {
  return { dir: "/agents/test", connections } as unknown as LoadedAgent;
}

function hookCtx(over: Partial<HookCtx> = {}): HookCtx {
  return { sessionId: "s1", userId: "u-1", env: () => undefined, sql: () => Promise.resolve({ rows: [] }), ...over };
}

function oauthDeps(store: OAuthStore, over: Partial<OAuthProviderDeps> = {}): OAuthProviderDeps {
  return { store, secret: SECRET, startUrlBase: "/base/eve/v1/oauth", pollMs: 5, timeoutMs: 1000, ...over };
}

Deno.test("oauth openapi: valid stored token → execute calls the API with the Bearer", async () => {
  const store = fakeStore({
    "user|u-1|github": { access: "AT", refresh: null, expiresAt: new Date(Date.now() + 3_600_000), scopes: "repo" },
  });
  const rec: { headers?: Record<string, string> }[] = [];
  const fetchMock = (_url: string | URL, init?: RequestInit) => {
    rec.push({ headers: init?.headers as Record<string, string> });
    return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  };
  const provider = buildConnectionProvider(fakeAgent({ gh: oauthConn() }), {
    oauth: oauthDeps(store, { fetch: fetchMock }),
  });
  const tools = await provider(hookCtx());
  assertEquals(Object.keys(tools), ["gh__ping"]);
  await tools["gh__ping"].execute!({}, undefined);
  assertEquals(rec[0].headers!["Authorization"], "Bearer AT");
});

Deno.test("oauth openapi: no token → emit authorization.required + park, callback putToken resumes", async () => {
  const store = fakeStore();
  const emitted: Array<{ name: string; data: unknown }> = [];
  const rec: { headers?: Record<string, string> }[] = [];
  const fetchMock = (_url: string | URL, init?: RequestInit) => {
    rec.push({ headers: init?.headers as Record<string, string> });
    return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  };
  const provider = buildConnectionProvider(fakeAgent({ gh: oauthConn() }), {
    oauth: oauthDeps(store, { fetch: fetchMock }),
  });
  const tools = await provider(hookCtx());
  // Kick off the tool call: it parks polling the store.
  const call = tools["gh__ping"].execute!({}, {
    sessionId: "s1",
    emit: (name: string, data: unknown) => emitted.push({ name, data }),
  } as never);
  // Simulate the OAuth callback landing the token a moment later.
  await new Promise((r) => setTimeout(r, 20));
  store.set("user|u-1|github", { access: "AT2", refresh: null, expiresAt: null, scopes: "repo" });
  const result = await call;
  // Emitted the consent signal carrying the signed start URL.
  assertEquals(emitted.length >= 1, true);
  assertEquals(emitted[0].name, "authorization.required");
  const data = emitted[0].data as { connector: string; url: string };
  assertEquals(data.connector, "github");
  assert(data.url.startsWith("/base/eve/v1/oauth/github/start?state="));
  // Resumed and executed the call with the now-present token.
  assert(result !== undefined);
  assertEquals(rec[0].headers!["Authorization"], "Bearer AT2");
});

Deno.test("oauth openapi: no principal → terminal error, no park", async () => {
  const store = fakeStore();
  const provider = buildConnectionProvider(fakeAgent({ gh: oauthConn() }), {
    oauth: oauthDeps(store),
  });
  // ctx with neither userId nor principal.
  const tools = await provider(hookCtx({ userId: undefined }));
  const out = await tools["gh__ping"].execute!({}, undefined) as { error?: string };
  assert(typeof out.error === "string" && out.error.includes("principal_required"));
});

Deno.test("oauth connection with no broker wired → tools skipped (not a turn failure)", async () => {
  const provider = buildConnectionProvider(fakeAgent({ gh: oauthConn() }), {});
  const tools = await provider(hookCtx());
  assertEquals(Object.keys(tools), []);
});
