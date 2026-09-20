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
import type { PoolClient } from "pg";
import { pool } from "../../db.ts";
import { parseSeedClient, SERVICE_SCOPE, type SeedClientSpec } from "./config.ts";

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

  // One transaction, because the two writes are one registration: a client row
  // with no resource link is a client /oauth2/authorize answers invalid_target
  // for, and leaving one behind while reporting "client registration failed
  // (continuing)" describes a state that does not exist.
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await registerClient(db, spec, confidential);
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

type Queryable = Pick<PoolClient, "query">;

async function registerClient(
  db: Queryable,
  spec: SeedClientSpec,
  confidential: boolean,
): Promise<void> {
  await db.query(
    // offline_access is in the first-insert default because the plugin issues a
    // refresh token only when the granted scopes include it
    // (dist/introspect-njKASm3q.mjs:1799), where trex issued one
    // unconditionally. A deployment that leaves TREX_OIDC_CLIENT_SCOPES unset
    // would otherwise lose silent renewal entirely.
    //
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
       COALESCE($6::jsonb, '["openid","profile","email","offline_access"]'::jsonb), $7::jsonb,
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
            -- Merged, not replaced: the plugin treats this column as a general
            -- bag and reads registration extensions out of it
            -- (stripReservedOAuthClientMetadataExtensions,
            -- dist/authorize-riRRCSbC.mjs:1161), so an assignment would make
            -- every boot silently discard whatever else was stored there.
            -- The concatenation operator is a shallow right-biased merge, so
            -- clientRoles can still change.
            "metadata" = COALESCE(trexdb."oauthClient"."metadata", '{}'::jsonb)
                         || EXCLUDED."metadata",
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
      // Deliberately NOT `openid`: see SERVICE_SCOPE, where the reason lives
      // next to the value.
      JSON.stringify(confidential ? [SERVICE_SCOPE] : []),
      // Required of a public client, not of a confidential one — which is
      // exactly the row trex wrote before this phase (`require_pkce` was set
      // only for public clients), restored rather than reinvented.
      //
      // The plugin's own default is `true` for every client, and holding a
      // confidential client to it is a **release blocker**: Spring Security
      // sends no `code_challenge` at all — its authorize request is exactly
      // `response_type, client_id, scope, state, redirect_uri, nonce` — so
      // every WebAPI (and therefore every Atlas) sign-in is refused at
      // /authorize with `pkce is required for this client`. Measured on a real
      // stack.
      //
      // This gives up nothing for the clients that DO send PKCE. `requirePKCE`
      // only decides whether a challenge is *demanded*; it does not decide
      // whether a supplied one is *honoured*. /authorize still rejects a
      // malformed or non-S256 challenge and still binds a well-formed one to
      // the code (dist/authorize-riRRCSbC.mjs:5594-5596), and /oauth2/token
      // still refuses the exchange when the challenge was used in
      // authorization and the verifier is wrong or missing
      // (dist/introspect-njKASm3q.mjs:1996-2009) — both branches keyed on the
      // stored `code_challenge`, never on this column. Measured both ways on
      // the running stack, so the portal keeps its stolen-code protection in
      // full.
      //
      // `false` and not null: the plugin reads `client.requirePKCE ?? true`, so
      // leaving it unset would silently reinstate the blocker.
      !confidential,
      // The method the registered client must authenticate with. The plugin
      // refuses any other one outright (validateClientCredentials,
      // dist/utils-CWjOhEQb.mjs:641), so this single column has to name the
      // method EVERY consumer of this client id uses.
      //
      // Basic, because Spring Security's is not negotiable: WebAPI sends the
      // credentials as an Authorization header and the exchange 401s against a
      // `client_secret_post` row. d2e's own /oauth/token proxy is code this
      // repository owns, so it is the side that
      // moves — it now sends Basic when it is talking to trex's own provider
      // (d2e-compat/routes.ts).
      confidential ? "client_secret_basic" : "none",
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
  // and issues no code at all. So the configured resource is (re)linked on
  // every boot — that link is what the deployment asked for by configuring the
  // issuer, and without it nothing works.
  //
  // Exactly one resource, named: linking whatever rows happen to exist would
  // hand this client any resource added later, which is precisely the grant
  // enforcePerClientResources exists to withhold. The identifier is derived
  // from the same environment expression provider.ts passes as `resources`, so
  // the row the plugin seeds and the row named here cannot drift.
  const linked = await db.query(
    `INSERT INTO trexdb."oauthClientResource" ("id", "clientId", "resourceId", "createdAt")
     SELECT gen_random_uuid()::text, $1, r."identifier", now()
       FROM trexdb."oauthResource" r
      WHERE r."identifier" = $2
     ON CONFLICT ("clientId", "resourceId") DO NOTHING`,
    [spec.clientId, spec.resourceIdentifier],
  );
  if (linked.rowCount === 0) {
    const existing = await db.query(
      `SELECT 1 FROM trexdb."oauthClientResource"
        WHERE "clientId" = $1 AND "resourceId" = $2 LIMIT 1`,
      [spec.clientId, spec.resourceIdentifier],
    );
    if (existing.rows.length === 0) {
      console.error(
        `[oidc] client ${spec.clientId} is not linked to ${spec.resourceIdentifier}: ` +
          "/authorize will answer invalid_target. The provider seeds " +
          "trexdb.\"oauthResource\" from its `resources` option at init, so this " +
          "means the client was seeded first, or the two disagree on the issuer.",
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
