// The row is upserted on every boot, which is the point: changing a redirect
// URI stays an env change and a restart. Nothing else writes it, because both
// of the plugin's create APIs assert a logged-in session and boot has none.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one: DATABASE_URL is process-wide and every later DB-backed suite
// gates itself on it too.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { pool } from "../../db.ts";
import { seedOAuthClientFromEnv } from "./seed-client.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

const CLIENT_ID = "d2e-webapi-seed-test";

const ENV = {
  TREX_OIDC_CLIENT_ID: CLIENT_ID,
  TREX_OIDC_CLIENT_SECRET: "s3cret",
  TREX_OIDC_CLIENT_NAME: "D2E WebAPI",
  TREX_OIDC_CLIENT_REDIRECT_URIS:
    "https://localhost/WebAPI/user/oauth/callback/openid,https://localhost/d2e/portal/login-callback",
  TREX_OIDC_CLIENT_POST_LOGOUT_URIS: "https://localhost/atlas/",
  TREX_OIDC_CLIENT_SCOPES: "openid profile email idp_groups offline_access",
  TREX_OIDC_CLIENT_ROLES: "ALP_USER_ADMIN,ALP_SYSTEM_ADMIN",
};

/**
 * The options block PHASE2-SPIKE-FINDINGS.md records, so what this suite reads
 * the row back through is the same plugin configuration Task 6 will mount. It
 * exists for two reasons the seeder cannot serve on its own: its `init` seeds
 * `oauthResource`, which the link row's foreign key needs, and its adapter is
 * the only honest oracle for "can the plugin read what the seeder wrote".
 */
const ISSUER = "https://localhost:8443/trex/oidc";

function providerInstance() {
  return betterAuth({
    database: pool,
    basePath: "/trex/oidc",
    baseURL: ISSUER,
    secret: "seed-client-test-secret-seed-client-test-secret",
    plugins: [
      jwt({ jwt: { issuer: ISSUER }, jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } } }),
      oauthProvider({
        loginPage: `${ISSUER}/login`,
        consentPage: `${ISSUER}/consent`,
        scopes: ["openid", "profile", "email", "idp_groups", "offline_access"],
        resources: [ISSUER],
        codeExpiresIn: 60,
        idTokenExpiresIn: 3600,
      }),
    ],
  });
}

/** The pg pool is a singleton owned by ../../db.ts and outlives every test. */
function test(name: string, fn: () => Promise<void>) {
  Deno.test({ name, ignore: !DATABASE_URL, sanitizeOps: false, sanitizeResources: false, fn });
}

async function clientRow(): Promise<Record<string, unknown>> {
  const row = await pool.query(
    `SELECT * FROM trexdb."oauthClient" WHERE "clientId" = $1`,
    [CLIENT_ID],
  );
  assertEquals(row.rows.length, 1);
  return row.rows[0];
}

test("the seeded client never reaches a consent screen", async () => {
  assertEquals(await seedOAuthClientFromEnv(ENV), true);
  const row = await clientRow();
  assertEquals(row.skipConsent, true);
  assertEquals(row.enableEndSession, true);
  assertEquals(row.requirePKCE, true);
  assertEquals(row.tokenEndpointAuthMethod, "client_secret_post");
  assertEquals(row.grantTypes, ["authorization_code", "refresh_token", "client_credentials"]);
  assertEquals(row.responseTypes, ["code"]);
});

test("the stored secret is what the plugin's default hasher produces", async () => {
  await seedOAuthClientFromEnv(ENV);
  const row = await clientRow();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("s3cret"));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  assertEquals(row.clientSecret, expected);
  // Not the plaintext, and not trex's scrypt either: verifyStoredClientSecret
  // compares against base64url(sha256(secret)) and nothing else.
  assertNotEquals(row.clientSecret, "s3cret");
});

test("a client with no secret is public and is held to PKCE instead", async () => {
  const { TREX_OIDC_CLIENT_SECRET: _drop, ...publicEnv } = ENV;
  assertEquals(await seedOAuthClientFromEnv(publicEnv), true);
  const row = await clientRow();
  assertEquals(row.clientSecret, null);
  assertEquals(row.tokenEndpointAuthMethod, "none");
  assertEquals(row.requirePKCE, true);
  // The plugin refuses client_credentials scopes on a public client, and
  // refuses the grant itself for one, so the list is empty rather than wrong.
  assertEquals(row.clientCredentialsScopes, []);
  await seedOAuthClientFromEnv(ENV);
});

test("no client is seeded without an id or without a redirect uri", async () => {
  assertEquals(await seedOAuthClientFromEnv({}), false);
  assertEquals(await seedOAuthClientFromEnv({ TREX_OIDC_CLIENT_ID: "x" }), false);
});

test("re-seeding rewrites the redirect uris and keeps the client id", async () => {
  await seedOAuthClientFromEnv(ENV);
  const first = await clientRow();
  await seedOAuthClientFromEnv({ ...ENV, TREX_OIDC_CLIENT_REDIRECT_URIS: "https://elsewhere/cb" });
  const second = await clientRow();
  // jsonb, not text[] and not a JSON string: getMigrations generates every
  // string[] field as jsonb, and node-pg hands it back already parsed.
  assertEquals(second.redirectUris, ["https://elsewhere/cb"]);
  assertEquals(second.id, first.id);
  await seedOAuthClientFromEnv(ENV);
  assertEquals((await clientRow()).redirectUris, [
    "https://localhost/WebAPI/user/oauth/callback/openid",
    "https://localhost/d2e/portal/login-callback",
  ]);
});

test("an unset scope list leaves the granted scopes alone", async () => {
  await seedOAuthClientFromEnv(ENV);
  await pool.query(
    `UPDATE trexdb."oauthClient" SET "scopes" = $2::jsonb WHERE "clientId" = $1`,
    [CLIENT_ID, JSON.stringify(["openid", "granted-by-hand"])],
  );
  const { TREX_OIDC_CLIENT_SCOPES: _drop, ...noScopes } = ENV;
  await seedOAuthClientFromEnv(noScopes);
  assertEquals((await clientRow()).scopes, ["openid", "granted-by-hand"]);
  await seedOAuthClientFromEnv(ENV);
  assertEquals((await clientRow()).scopes, ["openid", "profile", "email", "idp_groups", "offline_access"]);
});

test("the client is linked to every resource, so /authorize does not answer invalid_target", async () => {
  // enforcePerClientResources defaults to true and an unlinked client gets
  // error=invalid_target with no code at all — a failure that reads as a
  // client misconfiguration rather than as a missing join row.
  const auth = providerInstance();
  await auth.$context; // the plugin's init is what seeds oauthResource
  await seedOAuthClientFromEnv(ENV);
  await seedOAuthClientFromEnv(ENV);

  const links = await pool.query(
    `SELECT l."resourceId" FROM trexdb."oauthClientResource" l WHERE l."clientId" = $1`,
    [CLIENT_ID],
  );
  const resources = await pool.query(`SELECT identifier FROM trexdb."oauthResource"`);
  assertNotEquals(resources.rows.length, 0);
  assertEquals(
    links.rows.map((r) => r.resourceId).sort(),
    resources.rows.map((r) => r.identifier).sort(),
  );
});

test("the plugin reads the client back, clientRoles included", async () => {
  const auth = providerInstance();
  const ctx = await auth.$context;
  await seedOAuthClientFromEnv(ENV);

  // getClient is a bare adapter findOne on this model, so this is the same read
  // the token endpoint performs, and customAccessTokenClaims is handed
  // parseClientMetadata(client.metadata).
  const client = await ctx.adapter.findOne<Record<string, unknown>>({
    model: "oauthClient",
    where: [{ field: "clientId", value: CLIENT_ID }],
  });
  assertNotEquals(client, null);
  assertEquals(client!.redirectUris, [
    "https://localhost/WebAPI/user/oauth/callback/openid",
    "https://localhost/d2e/portal/login-callback",
  ]);
  assertEquals(client!.postLogoutRedirectUris, ["https://localhost/atlas/"]);
  assertEquals(client!.scopes, ["openid", "profile", "email", "idp_groups", "offline_access"]);
  assertEquals(
    (client!.metadata as { clientRoles?: string[] })?.clientRoles,
    ["ALP_USER_ADMIN", "ALP_SYSTEM_ADMIN"],
  );
  // Non-empty or the grant is refused outright; the roles above are what a
  // service token then authorizes as.
  assertEquals(client!.clientCredentialsScopes, ["openid"]);
});
