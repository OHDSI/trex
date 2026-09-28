// better-auth.ts derives its secret from TREX_ROOT_KEY and opens trex's pool,
// both at module evaluation time. A static import would run that before any
// Deno.env.set here could take effect, so the module is pulled in dynamically
// once the environment is arranged.
//
// Like auth-router.contract.test.ts, this file is gated on DATABASE_URL and
// skips without one rather than inventing a URL: DATABASE_URL is process-wide
// and the suites evaluated after this one (federation/admin, sb-keys) gate
// themselves on it too, so faking it here would un-gate them against a database
// that does not exist.
import { assertEquals } from "jsr:@std/assert";
import { _resetRootKeyCache } from "./keys.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/**
 * BETTER_AUTH_URL deliberately carries a path here: trex's own default for it
 * is `http://localhost:8001${BASE_PATH}`, so the case worth pinning is the one
 * where the origin has to be taken out of a URL that already has a path.
 */
const ENV_DURING_IMPORT: Record<string, string> = {
  TREX_ROOT_KEY: VALID_ROOT,
  BETTER_AUTH_URL: "http://auth.example.test:9999/trex",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://one.example.test,https://two.example.test",
};

async function load() {
  const prior = new Map(
    Object.keys(ENV_DURING_IMPORT).map((k) => [k, Deno.env.get(k)] as const),
  );
  for (const [k, v] of Object.entries(ENV_DURING_IMPORT)) Deno.env.set(k, v);
  try {
    return await import("./better-auth.ts");
  } finally {
    // getRootKey caches, and keys.test.ts asserts it throws when the variable is
    // unset. Hand every variable and the cache back the way they were found.
    for (const [k, v] of prior) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

function test(name: string, fn: (m: NonNullable<typeof mod>) => void) {
  Deno.test({ name, ignore: !mod, fn: () => fn(mod!) });
}

test("better-auth is mounted on the issuer path", ({ authBasePath }) => {
  // It moved off the private /_auth prefix in the cutover, and not by
  // preference: better-call routes on the base URL's pathname and the
  // discovery document builds every endpoint URL from the same value, so the
  // engine has to answer where the issuer says it does. What keeps the rest of
  // Better Auth off the public surface is oidc/mount.ts, which 404s everything
  // outside /oauth2/ and /.well-known/ — not the base path.
  assertEquals(authBasePath(), "/trex/oidc");
});

test("the instance exposes the credential endpoints the router will call", ({ auth }) => {
  assertEquals(typeof auth.api.signInEmail, "function");
  assertEquals(typeof auth.api.getSession, "function");
});

test("both password hooks are trex's, not Better Auth's defaults", ({ auth }) => {
  // Better Auth resolves `hash` and `verify` independently, each falling back
  // to its own scrypt. Supplying only `hash` therefore fails silently: sign-up
  // writes a trex r=8 hash and the default verifier recomputes it at r=16, so
  // every later sign-in returns 401. Pin both.
  const password = auth.options.emailAndPassword?.password;
  assertEquals(typeof password?.hash, "function");
  assertEquals(typeof password?.verify, "function");
});

test("the base URL is the OIDC issuer, not BETTER_AUTH_URL", ({ auth }) => {
  // Left unset, Better Auth derives the origin from whichever request arrives,
  // which works in development and breaks behind an ingress. BETTER_AUTH_URL
  // is no longer the answer either: authorization_endpoint, token_endpoint,
  // userinfo_endpoint, end_session_endpoint and jwks_uri are all
  // `${ctx.context.baseURL}/...`, so a base URL that is not the issuer
  // advertises a document Spring's fromOidcIssuerLocation refuses. The
  // environment here still sets BETTER_AUTH_URL to an unrelated origin, which
  // is the case worth pinning.
  assertEquals(auth.options.baseURL, "http://localhost:33001/trex/oidc");
});

test("trusted origins come from the variable the CORS allow-list uses", ({ auth }) => {
  // Same variable and same split as index.ts, so an origin trusted for CORS
  // and an origin trusted by the engine cannot drift apart.
  assertEquals(auth.options.trustedOrigins, [
    "https://one.example.test",
    "https://two.example.test",
  ]);
});

test("the jsonb user columns are declared json, not string", ({ auth }) => {
  // Better Auth maps `json` to jsonb and `string` to text unconditionally;
  // user_metadata and app_metadata are jsonb.
  const fields = auth.options.user?.additionalFields;
  assertEquals(fields?.user_metadata?.type, "json");
  assertEquals(fields?.app_metadata?.type, "json");
});

test("nothing is mounted on the public /auth/v1 prefix", ({ authBasePath }) => {
  // If this ever starts with /auth/v1 the engine has begun answering the
  // GoTrue contract directly, which is a different task and a different set of
  // response envelopes.
  assertEquals(authBasePath().includes("/auth/v1"), false);
});

test("the OAuth provider plugin is installed and keeps trex's contract", ({ auth }) => {
  // The plugin's own defaults differ from what trex has served since V7 on
  // every one of these: 600-second codes, 36000-second id_tokens, and no
  // offline_access scope at all — which is its gate on issuing a refresh token.
  const provider = auth.options.plugins.find(
    (p: { id: string }) => p.id === "oauth-provider",
  ) as { options: Record<string, unknown> } | undefined;
  assertEquals(typeof provider, "object");
  assertEquals(provider!.options.codeExpiresIn, 60);
  assertEquals(provider!.options.idTokenExpiresIn, 3600);
  assertEquals(
    (provider!.options.scopes as string[]).includes("offline_access"),
    true,
  );
  // Client administration is not a surface trex offers over HTTP; clients are
  // seeded from the environment.
  assertEquals(typeof provider!.options.clientPrivileges, "function");
});
