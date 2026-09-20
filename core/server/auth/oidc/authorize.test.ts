// The two /authorize rules that are authorization decisions rather than
// protocol detail, restated against the plugin.
//
// Both were asserted by the deleted oidc.test.ts against helpers that no longer
// exist, and both still hold — but nothing was left watching them. They are
// separated from grants.test.ts because neither is about a grant: one decides
// where a failed request may be sent, the other decides what a client may ever
// be granted.
//
// Driven against the real mount on a real listener, because the answer to both
// is a Location header the plugin builds from its own base URL, and a direct
// auth.handler() call cannot show what Express leaves behind.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
import { encodeBasicCredentials } from "better-auth/oauth2";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function load() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return {
      mount: await import("./mount.ts"),
      seed: await import("./seed-client.ts"),
      db: await import("../../db.ts"),
      auth: (await import("../better-auth.ts")).auth,
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    const { _resetRootKeyCache } = await import("../keys.ts");
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

const REDIRECT_URI = "https://rp.test/authorize/cb";
const CLIENT_SECRET = "authorize-suite-secret";

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

/** Payload of a signed JWT, without verifying it. */
function jwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  assertEquals(parts.length, 3, `not a JWT: ${token.slice(0, 24)}…`);
  return JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")), (c) =>
      c.charCodeAt(0)),
  ));
}

interface Fixture {
  server: Awaited<ReturnType<NonNullable<typeof mod>["mount"]["startOidcServer"]>>;
  /** Unique per run, so two clients seeded by the same test cannot collide. */
  run: string;
  userId: string;
  cookie: string;
  clientIds: string[];
}

/**
 * Seeds one more client on the running fixture. Several of these tests need two
 * clients that differ in exactly one column, which is the only way to show that
 * the column is what decides.
 */
async function seedClient(
  m: NonNullable<typeof mod>,
  f: Fixture,
  over: {
    suffix: string;
    redirectUris?: string[];
    postLogoutRedirectUris?: string[];
    allowedScopes?: string[];
  },
): Promise<string> {
  const clientId = `authorize-${f.run}-${over.suffix}`;
  await m.seed.upsertOAuthClient({
    clientId,
    clientSecret: CLIENT_SECRET,
    name: "authorize suite",
    redirectUris: over.redirectUris ?? [REDIRECT_URI],
    postLogoutRedirectUris: over.postLogoutRedirectUris ?? [],
    clientRoles: [],
    allowedScopes: over.allowedScopes ?? ["openid", "profile", "email"],
    resourceIdentifier: f.server.issuer,
  });
  f.clientIds.push(clientId);
  return clientId;
}

async function startFixture(m: NonNullable<typeof mod>): Promise<Fixture> {
  const server = await m.mount.startOidcServer();
  const run = crypto.randomUUID().slice(0, 8);
  const signedUp = await m.auth.api.signUpEmail({
    body: {
      email: `authorize-${run}@example.test`,
      password: "correct horse battery staple",
      name: "Authorize Suite",
    },
    returnHeaders: true,
  });
  return {
    server,
    run,
    userId: signedUp.response.user.id,
    cookie: cookieHeader(signedUp.headers.getSetCookie()),
    clientIds: [],
  };
}

async function endFixture(m: NonNullable<typeof mod>, f: Fixture) {
  for (const clientId of f.clientIds) {
    await m.db.pool.query(`DELETE FROM trexdb."oauthClient" WHERE "clientId" = $1`, [clientId]);
  }
  await m.db.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [f.userId]);
  await f.server.close();
}

/** One /authorize round trip with a live session. `extra` overrides or removes. */
async function authorize(
  f: Fixture,
  clientId: string,
  extra: Record<string, string | null> = {},
) {
  const { verifier, challenge } = await pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    state: "state-value",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: f.server.issuer,
  });
  for (const [k, v] of Object.entries(extra)) {
    if (v === null) query.delete(k);
    else query.set(k, v);
  }
  const res = await fetch(`${f.server.url}/oauth2/authorize?${query}`, {
    headers: { cookie: f.cookie },
    redirect: "manual",
  });
  await res.body?.cancel();
  const location = res.headers.get("location");
  return {
    status: res.status,
    location,
    url: location ? new URL(location) : null,
    verifier,
  };
}

function test(name: string, fn: (m: NonNullable<typeof mod>, f: Fixture) => Promise<void>) {
  Deno.test({
    name,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const f = await startFixture(mod!);
      try {
        await fn(mod!, f);
      } finally {
        await endFixture(mod!, f);
      }
    },
  });
}

test("redirect_uri matching is exact", async (_m, f) => {
  // The property that makes this more than a protocol detail: a redirect_uri
  // that is not registered must never be redirected TO, or the provider is an
  // open redirect for anyone who knows a client id. trex answered 400 JSON;
  // the plugin sends the browser to its OWN error URL
  // (getErrorURL -> `${baseURL}/error`, dist/authorize-riRRCSbC.mjs:5378, 5555)
  // — a different shape with the same property, so the assertion is on the
  // host as much as on the error code.
  const clientId = await seedClient(_m, f, { suffix: "exact" });
  const issuer = new URL(f.server.issuer);

  const unregistered = [
    // A registered prefix with something appended: the case a path-prefix
    // match would wrongly accept.
    `${REDIRECT_URI}/extra`,
    // And one appended after a separator, which a sloppy startsWith() would
    // also take.
    `${REDIRECT_URI}?next=https://evil.test`,
    // A different host entirely, which is what an open redirect is worth.
    "https://evil.test/authorize/cb",
    // Trailing slash: not the registered string, so not a match.
    `${REDIRECT_URI}/`,
    // Same string, different port.
    "https://rp.test:8443/authorize/cb",
  ];
  for (const redirect_uri of unregistered) {
    const res = await authorize(f, clientId, { redirect_uri });
    assertEquals(res.status, 302, redirect_uri);
    assertEquals(res.url!.host, issuer.host, `sent the browser to ${redirect_uri}`);
    assertEquals(res.url!.searchParams.get("error"), "invalid_redirect", redirect_uri);
    // Nothing of the requested URI is reachable from the error page.
    assertEquals(res.location!.includes("evil.test"), false, redirect_uri);
  }

  // The same string over http: is refused one step earlier, and so under a
  // different name: SafeUrlSchema requires https for anything but a loopback
  // host (@better-auth/core/dist/utils/redirect-uri.mjs), so the query never
  // reaches the registration check and the error is invalid_request. Measured,
  // and pinned here only because it would otherwise look like a regression of
  // the loop above. The property that matters is unchanged — the browser goes
  // to the issuer, not to the requested URI.
  const overHttp = await authorize(f, clientId, { redirect_uri: "http://rp.test/authorize/cb" });
  assertEquals(overHttp.url!.host, issuer.host);
  assertEquals(overHttp.url!.searchParams.get("error"), "invalid_request");

  // The registered string itself still works, or the assertions above would
  // hold against a provider that refuses everything.
  const ok = await authorize(f, clientId);
  assertEquals(ok.url!.origin + ok.url!.pathname, REDIRECT_URI);
  assertNotEquals(ok.url!.searchParams.get("code"), null);
});

test("a loopback redirect matches on every character but the port", async (_m, f) => {
  // A deliberate exception to the test above, and the one place the plugin is
  // laxer than trex's own equality check: for an http: loopback redirect —
  // RFC 8252's native-app form — only the port may vary
  // (findRegisteredRedirectUri via stripLoopbackRedirectPort, :5386-5446).
  // Pinned because it is a widening nobody asked for: a deployment that
  // registers http://127.0.0.1:1234/cb has registered every port on that host.
  const clientId = await seedClient(_m, f, {
    suffix: "loopback",
    redirectUris: ["http://127.0.0.1:1234/cb"],
  });

  const otherPort = await authorize(f, clientId, { redirect_uri: "http://127.0.0.1:59999/cb" });
  assertEquals(otherPort.url!.origin + otherPort.url!.pathname, "http://127.0.0.1:59999/cb");
  assertNotEquals(otherPort.url!.searchParams.get("code"), null);

  // The port is all that may move: the path is still matched exactly.
  const otherPath = await authorize(f, clientId, { redirect_uri: "http://127.0.0.1:1234/other" });
  assertEquals(otherPath.url!.searchParams.get("error"), "invalid_redirect");
  // And the licence is loopback's alone — a non-loopback host over http: does
  // not even get as far as the registration check.
  const otherHost = await authorize(f, clientId, { redirect_uri: "http://rp.test:1234/cb" });
  assertEquals(otherHost.url!.searchParams.get("error"), "invalid_request");
});

test("scopes outside the client's set are refused, not narrowed", async (_m, f) => {
  // A behaviour change recorded rather than preserved: trex silently dropped a
  // scope the client could not have and issued a code for the rest, so a
  // relying party learned it had lost a scope only when a claim was missing.
  // The plugin refuses the whole request with invalid_scope
  // (dist/authorize-riRRCSbC.mjs:5557-5563).
  const clientId = await seedClient(_m, f, { suffix: "scope" });
  const res = await authorize(f, clientId, { scope: "openid profile email admin" });
  assertEquals(res.status, 302);
  // This one DOES go back to the client, because the redirect_uri was
  // registered — RFC 6749 §4.1.2.1 — so the error is readable by the caller
  // that made the mistake.
  assertEquals(res.url!.origin + res.url!.pathname, REDIRECT_URI);
  assertEquals(res.url!.searchParams.get("error"), "invalid_scope");
  assertStringIncludes(res.url!.searchParams.get("error_description") ?? "", "admin");
  assertEquals(res.url!.searchParams.get("code"), null);
  // The state is carried back, or the client cannot correlate the failure.
  assertEquals(res.url!.searchParams.get("state"), "state-value");
});

test("idp_groups is grantable only to a client that allows it", async (m, f) => {
  // The one authorization rule in this file, as opposed to a protocol detail.
  // idp_groups carries the upstream IdP's group memberships, which is what
  // usermgmt authorizes on — so a client that may request it may read who is
  // in which group. What withholds it is the client's own `scopes` column:
  // /authorize narrows against `client.scopes ?? opts.scopes`
  // (dist/authorize-riRRCSbC.mjs:5558), and the scope is declared in
  // provider.ts's `scopes` — so the ONLY thing standing between any seeded
  // client and the claim is that the column does not list it. If the seeder's
  // default list ever grew, every client would silently gain group claims.
  const withoutIt = await seedClient(m, f, { suffix: "nogroups" });
  const withIt = await seedClient(m, f, {
    suffix: "groups",
    allowedScopes: ["openid", "profile", "email", "idp_groups"],
  });

  const refused = await authorize(f, withoutIt, { scope: "openid idp_groups" });
  assertEquals(refused.url!.origin + refused.url!.pathname, REDIRECT_URI);
  assertEquals(refused.url!.searchParams.get("error"), "invalid_scope");
  assertEquals(refused.url!.searchParams.get("code"), null);

  // The other half, without which the refusal above could be a provider that
  // refuses idp_groups outright: the claim really does reach a client that
  // lists the scope. Federated, because custom-claims.ts gates the pair on an
  // upstream provider as well as on the scope.
  await m.db.pool.query(
    `UPDATE trexdb."user" SET app_metadata = $2::jsonb WHERE id = $1`,
    [f.userId, JSON.stringify({ idp: { provider: "logto", groups: ["alp-admins"] } })],
  );
  const granted = await authorize(f, withIt, { scope: "openid idp_groups" });
  const code = granted.url!.searchParams.get("code");
  assertNotEquals(code, null, `no code: ${granted.location}`);

  const token = await fetch(`${f.server.url}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      // Basic, not a body secret: upsertOAuthClient registers every
      // confidential client `client_secret_basic` (seed-client.ts), and the
      // provider refuses any other method outright. Encoded with the package's
      // own encoder — the inverse of the decoder the provider runs — so the two
      // cannot disagree about RFC 6749 §2.3.1.
      authorization: encodeBasicCredentials(withIt, CLIENT_SECRET),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: withIt,
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: granted.verifier,
      resource: f.server.issuer,
    }),
  });
  const body = await token.json() as Record<string, string>;
  assertEquals(token.status, 200, JSON.stringify(body));
  const claims = jwtPayload(body.id_token);
  assertEquals(claims.idp_provider, "logto");
  assertEquals(claims.idp_groups, ["alp-admins"]);
});
