-- trexdb.sso_provider becomes the table @better-auth/sso reads.
--
-- Additive, in the pattern V11-V13 already use, because the row stays trex's:
-- the federation admin API keeps writing displayName/clientId/clientSecret/
-- enabled and the whole link policy, and the plugin reads issuer, providerId,
-- domain and a serialized oidcConfig off the same row. Two tables would let the
-- two disagree about which upstreams exist, which is the one failure mode
-- neither side could detect.
--
-- Why this has to land before the plugin is mounted: since 1.7 a schema Better
-- Auth disagrees with throws rather than warns, and the enforcement point is
-- runWithTransaction (@better-auth/core/dist/context/transaction.mjs:59) —
-- which sign-UP goes through as much as sign-in
-- (better-auth/dist/api/routes/sign-up.mjs:143, db/internal-adapter.mjs:121).
-- Measured at V19 with sso() mounted: auth.api.signUpEmail itself throws
-- "Database schema mismatch". The blast radius of mounting the plugin against
-- an unmigrated table is the whole engine, not federation.
--
-- displayName, clientId and clientSecret are deliberately NOT relaxed. They are
-- trex's own columns, NOT NULL since V1, and the schema check reported them
-- only because Better Auth did not know about them; declaring them in
-- auth/federation/sso-config.ts as additionalFields makes them columns Better
-- Auth writes and settles the complaint with no schema change and with
-- validateSchema left on for every table.
--
-- There is no jwks_endpoint column. The resolved JWKS URL is baked into the
-- serialized oidcConfig by oidcConfigFor, which is itself persisted; a column
-- would only be one more field to declare, and a declared field with no column
-- throws exactly as hard as a missing one.
--
-- trexdb.account is NOT touched. It is already Better Auth's account model: V1
-- defines it as (id, "userId", "accountId", "providerId", "accessToken",
-- "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope,
-- "idToken", password, "createdAt", "updatedAt") with UNIQUE("providerId",
-- "accountId"), and that unique key is exactly what handleOAuthUserInfo looks
-- an SSO identity up by (findAccountOwnerByKey, better-auth
-- dist/oauth2/link-account.mjs:21-24). Every existing federated link therefore
-- keeps working with no change at all — including the ones the d2e migration
-- pre-wrote through PUT /admin/federation/links, which store no tokens.
--
-- The three token columns hold base64 DEK ciphertext rather than Better Auth's
-- $ba$-prefixed or bare-hex form, which is why account.encryptOAuthTokens stays
-- false: decryptOAuthToken's isLikelyEncrypted test would not match them and
-- would hand the ciphertext back as if it were plaintext.
--
-- Re-runnable throughout: every ADD is IF NOT EXISTS, every backfill is guarded
-- on the column still being NULL so a replay cannot overwrite a configured
-- value, and the constraint is guarded on pg_constraint (Postgres has no ADD
-- CONSTRAINT IF NOT EXISTS) exactly as V9, V11 and V12 do it.
ALTER TABLE trexdb.sso_provider
  -- The plugin resolves a provider by providerId, never by the primary key
  -- (dist/index.mjs:4082-4103). trex's id already carries exactly that value
  -- and is already constrained to '^[a-z][a-z0-9_]*$', so this is a mirror.
  ADD COLUMN IF NOT EXISTS "providerId"     TEXT,
  ADD COLUMN IF NOT EXISTS "oidcConfig"     TEXT,
  ADD COLUMN IF NOT EXISTS "samlConfig"     TEXT,
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  -- Declared required by the plugin, but trex has no source value for either.
  -- domain is the issuer's host: always available, never a lie, and inert
  -- because domainVerification stays disabled, which leaves domainVerified out
  -- of the model entirely and makes isTrustedProvider unreachable
  -- (dist/index.mjs:3951 requires "domainVerified" in provider). The real
  -- multi-domain restriction lives in email_domain_allowlist and is enforced in
  -- resolveUser.
  ADD COLUMN IF NOT EXISTS domain           TEXT,
  -- The administrator who owns the configuration. trex's admin API
  -- authenticates with a service-role key that names no user, so the column
  -- stays nullable and is left NULL unless an owner is known.
  --
  -- ON DELETE SET NULL, not the CASCADE Better Auth would generate: deleting an
  -- administrator must not delete the provider configuration with them. That
  -- would take federation down for everybody as a side effect of an unrelated
  -- account being removed, and nothing would report it.
  ADD COLUMN IF NOT EXISTS "userId"         TEXT
    REFERENCES trexdb."user"(id) ON DELETE SET NULL;

-- Both backfills and the mirror below are only meaningful because the
-- connection applying core/schema owns trexdb.sso_provider and bypasses its
-- admin_all_sso_providers policy. Under a role the policy applies to, an
-- UPDATE here returns zero rows rather than erroring — which is how a Phase 1
-- migration came to report success having linked nobody.
UPDATE trexdb.sso_provider
   SET "providerId" = id
 WHERE "providerId" IS NULL;

-- The issuer's host, port included, lowercased because hostnames are
-- case-insensitive and the plugin compares this column as text.
UPDATE trexdb.sso_provider
   SET domain = lower(split_part(regexp_replace(issuer, '^[A-Za-z][A-Za-z0-9+.-]*://', ''), '/', 1))
 WHERE domain IS NULL AND issuer IS NOT NULL;

-- The plugin reads its whole per-provider configuration out of this JSON. It
-- is built from the columns trex already has, and those columns stay
-- authoritative: auth/federation/sso-config.ts's oidcConfigFor builds the same
-- object from the same columns, so a row written afterwards never disagrees
-- with the one this backfill produced.
--
-- jwksEndpoint is absent on purpose. It comes off the upstream's discovery
-- document, and a migration must not make a network call; whoever writes the
-- row resolves it and oidcConfigFor puts it in. A row backfilled here is
-- therefore resolvable by the plugin but not yet complete for a callback,
-- which refuses an id_token from a provider with no jwksEndpoint
-- (dist/index.mjs:3893-3894).
UPDATE trexdb.sso_provider
   SET "oidcConfig" = jsonb_strip_nulls(jsonb_build_object(
         'issuer', issuer,
         'clientId', "clientId",
         'clientSecret', "clientSecret",
         'pkce', true,
         'discoveryEndpoint',
           COALESCE(discovery_url,
                    regexp_replace(issuer, '/+$', '') || '/.well-known/openid-configuration'),
         -- NULL here is stripped, not stored: an absent override means "use the
         -- discovery document's authorization_endpoint", which is what V13's
         -- column already means.
         'authorizationEndpoint', authorization_endpoint,
         'scopes', to_jsonb(array_remove(string_to_array(scopes, ' '), '')),
         -- What federation/router.ts:193 already does: the client secret goes
         -- in the token request body.
         'tokenEndpointAuthentication', 'client_secret_post',
         -- trex never rewrites a user's address from the upstream: user.email
         -- is trex's own identifier, it is UNIQUE, and it is what the password
         -- grant authenticates against.
         'overrideUserInfo', false,
         'mapping', jsonb_build_object(
           -- The claim that decides whether a username-only account can sign in
           -- at all. claim_map's own 'email' entry wins where an operator set
           -- one; 'sub' is the fallback because every id_token carries it.
           'email', COALESCE(claim_map ->> 'email', 'sub'),
           'emailVerified', COALESCE(claim_map ->> 'email_verified', 'email_verified'),
           'name', COALESCE(claim_map ->> 'name', 'name')
         )
       ))::text
 WHERE "oidcConfig" IS NULL AND issuer IS NOT NULL;

-- Only providerId is tightened, and only after the backfill above has given
-- every existing row a value. The other three columns the plugin declares
-- required stay nullable on purpose and getMigrations warns about each:
--
--   issuer  — V11 left it nullable so a pre-federation row keeps working and is
--             simply not usable for federation. Enforcing it would delete that
--             distinction, and loadProviders' `issuer IS NOT NULL` is what
--             carries it.
--   domain  — derived from issuer, so it is NULL for exactly the rows above.
--   userId  — trex has no value for it at all; the admin API authenticates with
--             a service-role key that names no user.
--
-- providerId is different: the trigger below guarantees one for every writer,
-- including trexdb.save_sso_provider, so a NULL here would be a row the plugin
-- can never resolve rather than a row that opted out of federation. SET NOT
-- NULL is idempotent, so the replay is safe.
ALTER TABLE trexdb.sso_provider
  ALTER COLUMN "providerId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conname = 'sso_provider_provider_id_key'
        AND conrelid = 'trexdb.sso_provider'::regclass
  ) THEN
    ALTER TABLE trexdb.sso_provider
      ADD CONSTRAINT sso_provider_provider_id_key UNIQUE ("providerId");
  END IF;
END
$$;

-- The backfill fixes the rows that exist; this keeps every later writer in
-- step. trexdb.save_sso_provider (V1, still reached by the sso-save MCP tool)
-- inserts five columns and knows nothing about providerId, so without this a
-- provider created that way would be invisible to the plugin — a row that
-- exists, is enabled, and that no sign-in can ever resolve. Only a NULL is
-- filled, so a writer that sets the column keeps whatever it set.
CREATE OR REPLACE FUNCTION trexdb.sso_provider_mirror_provider_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."providerId" IS NULL THEN
    NEW."providerId" := NEW.id;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sso_provider_mirror_provider_id ON trexdb.sso_provider;
CREATE TRIGGER trg_sso_provider_mirror_provider_id
  BEFORE INSERT OR UPDATE ON trexdb.sso_provider
  FOR EACH ROW EXECUTE FUNCTION trexdb.sso_provider_mirror_provider_id();

COMMENT ON COLUMN trexdb.sso_provider."providerId" IS
  'Mirror of id. @better-auth/sso resolves a provider by this column, never by the primary key.';
COMMENT ON COLUMN trexdb.sso_provider.domain IS
  'The issuer''s host. Required by @better-auth/sso and inert here: domain verification is disabled, so it grants no trust. The real restriction is email_domain_allowlist.';
COMMENT ON COLUMN trexdb.sso_provider."oidcConfig" IS
  'The plugin''s per-provider OIDC configuration, serialized. Built from this row''s own columns by auth/federation/sso-config.ts''s oidcConfigFor; jwksEndpoint is added by whoever writes the row, from the upstream''s discovery document.';
COMMENT ON COLUMN trexdb.sso_provider."userId" IS
  'Optional owner of the configuration. NULL for every row trex writes: the federation admin API authenticates with a service-role key that names no user.';
