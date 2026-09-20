// The discovery document is the contract WebAPI starts against: Spring's
// fromOidcIssuerLocation refuses a document whose issuer disagrees with where
// it was fetched, and refuses to start at all. Assert it in CI rather than
// finding out at deploy time.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one: mount.ts pulls in better-auth.ts, which opens trex's pool
// while it evaluates.
import { assertEquals } from "jsr:@std/assert";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function load() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return await import("./mount.ts");
  } finally {
    // getRootKey caches, and keys.test.ts asserts it throws when the variable
    // is unset. Hand it back the way it was found.
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    const { _resetRootKeyCache } = await import("../keys.ts");
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

/** The pg pool is a singleton owned by ../../db.ts and outlives every test. */
function test(name: string, fn: (m: NonNullable<typeof mod>) => Promise<void>) {
  Deno.test({
    name,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(mod!),
  });
}

test("the discovery document keeps the issuer and advertises RS256", async (m) => {
  const s = await m.startOidcServer();
  try {
    const res = await fetch(`${s.url}/.well-known/openid-configuration`);
    assertEquals(res.status, 200);
    const doc = await res.json();
    assertEquals(doc.issuer, s.issuer);
    assertEquals(doc.id_token_signing_alg_values_supported.includes("RS256"), true);
    assertEquals(doc.id_token_signing_alg_values_supported.includes("EdDSA"), false);
    assertEquals(doc.jwks_uri, `${s.issuer}/.well-known/jwks.json`);
    assertEquals(doc.authorization_endpoint, `${s.issuer}/oauth2/authorize`);
    assertEquals(doc.token_endpoint, `${s.issuer}/oauth2/token`);
    assertEquals(doc.userinfo_endpoint, `${s.issuer}/oauth2/userinfo`);
    assertEquals(doc.end_session_endpoint, `${s.issuer}/oauth2/end-session`);
    assertEquals(doc.code_challenge_methods_supported, ["S256"]);
    assertEquals(
      doc.grant_types_supported.slice().sort(),
      ["authorization_code", "client_credentials", "refresh_token"],
    );
  } finally {
    await s.close();
  }
});

test("the claim set the document advertises is trex's, not the plugin's", async (m) => {
  // d2e's CI diffs this list. `trex_role` and the two federation claims are the
  // ones that are trex's own and would vanish on the plugin's default.
  const s = await m.startOidcServer();
  try {
    const doc = await (await fetch(`${s.url}/.well-known/openid-configuration`)).json();
    for (const claim of ["trex_role", "idp_groups", "idp_provider", "email_verified"]) {
      assertEquals(doc.claims_supported.includes(claim), true, `missing ${claim}`);
    }
  } finally {
    await s.close();
  }
});

test("the JWKS is served under the issuer path", async (m) => {
  // jwksPath is relative to the base URL, and the base URL only became the
  // issuer in this task. A key set served anywhere else is a document that
  // advertises a 404.
  const s = await m.startOidcServer();
  try {
    const res = await fetch(`${s.url}/.well-known/jwks.json`);
    assertEquals(res.status, 200);
    const jwks = await res.json();
    assertEquals(Array.isArray(jwks.keys), true);
  } finally {
    await s.close();
  }
});

test("Better Auth's own sign-in routes are not served under the provider mount", async (m) => {
  const s = await m.startOidcServer();
  try {
    const res = await fetch(`${s.url}/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@d2e.local", password: "x" }),
    });
    assertEquals(res.status, 404);
    await res.body?.cancel();
  } finally {
    await s.close();
  }
});

test("the SSO plugin's provider and callback routes are not served either", async (m) => {
  // @better-auth/sso is mounted on this same engine, and its /sso/* endpoints
  // would otherwise be a public surface for writing provider rows and for a
  // second, unguarded callback beside trex's own. Federation's HTTP surface is
  // /auth/v1/federation and /admin/federation, and nothing else.
  const s = await m.startOidcServer();
  try {
    for (
      const path of [
        "/sso/register",
        "/sso/update",
        "/sso/delete-provider",
        "/sso/callback/logto",
        "/sign-in/sso",
      ]
    ) {
      const res = await fetch(`${s.url}${path}`, { method: "POST" });
      assertEquals(res.status, 404, `expected 404 for ${path}`);
      await res.body?.cancel();
    }
  } finally {
    await s.close();
  }
});

test("the plugin's client administration is not served either", async (m) => {
  // /admin/oauth2/* would let a caller holding any session create a client.
  // Clients are seeded from the environment; there is no HTTP surface for them.
  const s = await m.startOidcServer();
  try {
    for (const path of ["/admin/oauth2/create-client", "/get-session"]) {
      const res = await fetch(`${s.url}${path}`, { method: "POST" });
      assertEquals(res.status, 404, `expected 404 for ${path}`);
      await res.body?.cancel();
    }
  } finally {
    await s.close();
  }
});
