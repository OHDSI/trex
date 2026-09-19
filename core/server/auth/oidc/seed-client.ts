// Client registration from the environment, for @better-auth/oauth-provider.
//
// A relying party's client_id, secret and redirect URIs are deployment
// configuration, and the deployment that runs trex is the one that knows them.
// The plugin has no seeding option for clients — only for resources — and both
// of its create endpoints (`createOAuthClient` and `adminCreateOAuthClient`)
// assert a logged-in session before anything else, which boot does not have.
// So the row is written directly, exactly as seed.ts does for the table this
// replaces.
//
// Written as SQL rather than through `ctx.adapter`: the adapter resolves a
// model against the mounted plugins' schemas and answers `Model "oauthClient"
// not found in schema` until the provider is mounted (measured). One upsert is
// also atomic where the adapter's find-then-create is a race between two boots.
// The column types come from `getMigrations(auth.options)` and are pinned by
// V19; every `string[]` field is jsonb.
import { pool } from "../../db.ts";
import { parseSeedClient, type SeedClientSpec } from "./config.ts";

/**
 * The plugin's `defaultHasher`, reproduced: with the jwt plugin installed
 * `storeClientSecret` defaults to `"hashed"`, and `"encrypted"` throws at init
 * while it is, so this is the only storage the provider will accept. It is
 * `base64url(sha256(utf8(secret)))` **unpadded**, compared constant-time
 * (@better-auth/oauth-provider@1.7.5 dist/utils-CWjOhEQb.mjs:420-423, 448-450).
 * Verified byte-for-byte against the package's own `createHash`/`base64Url`
 * rather than assumed.
 *
 * A plaintext secret can only be presented at creation time, so a restart
 * re-hashes the env value rather than recovering the stored one.
 */
export async function hashClientSecret(secret: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
  );
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function upsertOAuthClient(spec: SeedClientSpec): Promise<void> {
  const confidential = Boolean(spec.clientSecret);

  await pool.query(
    // `scopes` is the one field only written when configured: COALESCE leaves
    // an unset TREX_OIDC_CLIENT_SCOPES meaning "whatever the row already has",
    // so a deployment that granted a scope by hand does not lose it on the next
    // restart, and a first insert still lands on the provider's own default set.
    //
    // `id` is generated only on insert, so re-seeding does not renumber a
    // client that consent and token rows already reference.
    `INSERT INTO trexdb."oauthClient" (
       "id", "clientId", "clientSecret", "name",
       "redirectUris", "postLogoutRedirectUris",
       "scopes", "clientCredentialsScopes",
       "requirePKCE", "tokenEndpointAuthMethod",
       "grantTypes", "responseTypes",
       "skipConsent", "enableEndSession",
       "metadata", "createdAt", "updatedAt")
     VALUES (
       gen_random_uuid()::text, $1, $2, $3,
       $4::jsonb, $5::jsonb,
       COALESCE($6::jsonb, '["openid","profile","email"]'::jsonb), $7::jsonb,
       $8, $9,
       $10::jsonb, $11::jsonb,
       TRUE, TRUE,
       $12::jsonb, now(), now())
     ON CONFLICT ("clientId") DO UPDATE
        SET "clientSecret" = EXCLUDED."clientSecret",
            "name" = EXCLUDED."name",
            "redirectUris" = EXCLUDED."redirectUris",
            "postLogoutRedirectUris" = EXCLUDED."postLogoutRedirectUris",
            "scopes" = COALESCE($6::jsonb, trexdb."oauthClient"."scopes"),
            "clientCredentialsScopes" = EXCLUDED."clientCredentialsScopes",
            "requirePKCE" = EXCLUDED."requirePKCE",
            "tokenEndpointAuthMethod" = EXCLUDED."tokenEndpointAuthMethod",
            "grantTypes" = EXCLUDED."grantTypes",
            "responseTypes" = EXCLUDED."responseTypes",
            "skipConsent" = EXCLUDED."skipConsent",
            "enableEndSession" = EXCLUDED."enableEndSession",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = now()`,
    [
      spec.clientId,
      spec.clientSecret ? await hashClientSecret(spec.clientSecret) : null,
      spec.name,
      JSON.stringify(spec.redirectUris),
      JSON.stringify(spec.postLogoutRedirectUris),
      spec.allowedScopes ? JSON.stringify(spec.allowedScopes) : null,
      // Non-empty or the client_credentials grant is refused outright
      // ("client has no authorized client_credentials scopes"), which is how
      // the plugin spells "this client may not use it". Gated on the secret
      // because the plugin refuses the grant, and refuses these scopes, for a
      // public client — and trex refused it for one too.
      //
      // `openid` is on the plugin's USER_DELEGATED_SCOPES list, which means a
      // caller that sends `scope=openid` explicitly is answered invalid_scope
      // even though the same request with no `scope` at all succeeds with this
      // exact scope. Task 7 owns the grant semantics and is where a
      // trex-specific service scope would be introduced.
      JSON.stringify(confidential ? ["openid"] : []),
      // The plugin defaults requirePKCE to true even for a confidential client,
      // which is stricter than trex's own row (require_pkce was set only for
      // public clients). Kept, because it is also the only thing that stops a
      // stolen authorization code being redeemed by whoever intercepted it.
      true,
      // Derived from how the credentials arrive: Basic header ->
      // client_secret_basic, client_id + client_secret in the body ->
      // client_secret_post. validateClientCredentials refuses outright when the
      // presented method is not the registered one, and d2e's /oauth/token
      // proxy sends the secret in the body and deliberately does not also send
      // Basic (d2e-compat/routes.ts:390-393).
      confidential ? "client_secret_post" : "none",
      JSON.stringify(["authorization_code", "refresh_token", "client_credentials"]),
      JSON.stringify(["code"]),
      // There is no column for the roles a client carries. They ride in
      // metadata, which is what customAccessTokenClaims is handed
      // (`parseClientMetadata(client.metadata)`), so a client_credentials token
      // can authorize as the service it was issued to — what router.ts's
      // `appRoles: client.clientRoles` does today.
      JSON.stringify({ clientRoles: spec.clientRoles }),
    ],
  );

  // enforcePerClientResources defaults to true, and an unlinked client is not a
  // degraded flow but a dead one: /oauth2/authorize answers `invalid_target`
  // and issues no code at all. The link is derived from the resources the
  // deployment actually serves rather than from a second copy of the issuer,
  // so the two cannot drift; the plugin seeds exactly one, from its `resources`
  // option, in its own init.
  const linked = await pool.query(
    `INSERT INTO trexdb."oauthClientResource" ("id", "clientId", "resourceId", "createdAt")
     SELECT gen_random_uuid()::text, $1, r."identifier", now()
       FROM trexdb."oauthResource" r
     ON CONFLICT ("clientId", "resourceId") DO NOTHING`,
    [spec.clientId],
  );
  if (linked.rowCount === 0) {
    const existing = await pool.query(
      `SELECT 1 FROM trexdb."oauthClientResource" WHERE "clientId" = $1 LIMIT 1`,
      [spec.clientId],
    );
    if (existing.rows.length === 0) {
      console.error(
        `[oidc] client ${spec.clientId} is linked to no resource: /authorize will ` +
          "answer invalid_target. The provider seeds trexdb.\"oauthResource\" from its " +
          "`resources` option at init, so this means the client was seeded first.",
      );
    }
  }
}

/** Called at boot; never fatal, since a provider with no seeded client still serves. */
export async function seedOAuthClientFromEnv(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): Promise<boolean> {
  const spec = parseSeedClient(env);
  if (!spec) return false;
  try {
    await upsertOAuthClient(spec);
    console.log(`[oidc] registered client ${spec.clientId}`);
    return true;
  } catch (e) {
    console.error("[oidc] client registration failed (continuing):", (e as Error)?.message ?? e);
    return false;
  }
}
