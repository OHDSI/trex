-- The Better Auth cutover, as one migration.
--
-- Everything the engine has to own before it is mounted: the canonical
-- user/session/account/verification shape, the jwt plugin's signing-key table,
-- the tables @better-auth/oauth-provider owns, the columns @better-auth/sso
-- reads off trexdb.sso_provider, and the trigger that keeps a stored refresh
-- token when a later sign-in does not bring one.
--
-- ONE FILE AND NOT FIVE, although the work was done in five phases. The runner
-- applies each file in its own transaction, so split up, a failure part way
-- through would leave an installation carrying some of Better Auth's schema and
-- some of the hand-written router's — a half-migrated state nothing in this
-- repository knows how to serve, and one a straight cutover has no business
-- being able to reach. Folded, the whole thing commits or none of it does.
-- Nothing shared has applied any of the five: develop's highest migration is
-- V16 and all five were new on this branch, so no ledger entry can conflict.
--
-- STATEMENT ORDER IS LOAD-BEARING and is preserved exactly as the phases wrote
-- it. Every SET NOT NULL depends on the backfill above it, and the
-- sso_provider constraints depend on the backfills that precede them. Each
-- section is re-runnable on its own terms, as it was as its own file, so the
-- whole file is re-runnable.
--
-- THE SECTIONS KEEP THEIR PHASE NAMES. Comments and tests across the tree refer
-- to these by the version they were written as — "V20's backfill", "V21's
-- trigger", "the columns that exist at V19" — and one of them is in a frozen
-- contract file that cannot be edited. Each banner below therefore names the
-- file its statements came from, so every one of those references still lands
-- somewhere. The banners are also what core/server/auth/federation/
-- sso-schema.test.ts slices this file on, so their shape is depended upon.
--
--   SECTION 1  V17__better_auth_canonical_tables.sql
--   SECTION 2  V18__jwks_signing_key.sql
--   SECTION 3  V19__oauth_provider_tables.sql
--   SECTION 4  V20__sso_provider_better_auth.sql
--   SECTION 5  V21__account_preserve_refresh_token.sql

-- --------------------------------------------------------------------------
-- SECTION 1 — The canonical Better Auth tables
-- Phase: V17__better_auth_canonical_tables.sql
-- --------------------------------------------------------------------------

-- Better Auth 1.7.5 owns the user/session/account/verification tables from
-- here on. Since 1.7 it compares them against the shape it generates at boot
-- and on every request that awaits validation, and reports a SchemaMismatchError
-- for a missing column or for a NOT NULL column it never writes. V1 was written
-- against Better Auth's shape in February, so this closes the drift that
-- accumulated while the hand-written router owned these tables.

-- Passwords move to their canonical home: Better Auth reads account.password
-- for providerId = 'credential'. auth-router.ts had been lazily copying them
-- the other way, into user.password_hash. The hashes are trex's own scrypt and
-- Better Auth verifies them through the hooks better-auth.ts installs, so they
-- are moved verbatim — re-hashing would need a plaintext nobody has.
INSERT INTO trexdb.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u.id, 'credential', u.id, u.password_hash, NOW(), NOW()
  FROM trexdb."user" u
 WHERE u.password_hash IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM trexdb.account a
      WHERE a."userId" = u.id AND a."providerId" = 'credential'
   );

-- Reconciled, not merely filled. `AND a.password IS NULL` was here, on the
-- assumption that an account row carrying a password already carried the right
-- one. It does not always: develop's PUT /user (720b3c33, auth-router.ts:566)
-- writes trexdb.account BEFORE the trexdb."user" UPDATE at :583, so a request
-- that also changed the address and collided on the unique index answered 500
-- with the credential already rotated and user.password_hash left behind.
-- Those rows are in production databases now — this is not a rollout window —
-- and the cutover is what makes them dangerous: afterwards account.password is
-- what signs the account in, so the abandoned credential becomes the working
-- password while the holder's real one is refused.
--
-- user.password_hash is authoritative here because this runs BEFORE the
-- cutover, when it is the column every successful password change wrote last
-- and nothing legitimate makes account.password newer: pre-V17 trex wrote the
-- account row only as a mirror.
UPDATE trexdb.account a
   SET password = u.password_hash, "updatedAt" = NOW()
  FROM trexdb."user" u
 WHERE a."userId" = u.id
   AND a."providerId" = 'credential'
   AND u.password_hash IS NOT NULL
   AND a.password IS DISTINCT FROM u.password_hash;

-- Better Auth's admin plugin writes session.impersonatedBy; V1 predates it.
ALTER TABLE trexdb.session
  ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;

-- Better Auth requires an address on every user, so the rows V14 allowed to be
-- NULL get a synthesised one. The flag is what keeps them out of mail paths:
-- an address invented here was never asserted by anybody and must never be
-- treated as a way to reach the person.
ALTER TABLE trexdb."user"
  ADD COLUMN IF NOT EXISTS is_placeholder_email BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE
  -- trex's migration plugin (plugins/migration/src/lib.rs) hands each file's
  -- text to the session verbatim and checksums that same text into
  -- refinery_schema_history. It substitutes nothing, and a per-deployment
  -- substitution would give every deployment a different checksum for V17, so
  -- the domain is fixed here rather than configured. It is NOT a reserved or
  -- unroutable domain — d2e sets TLS__INTERNAL__DOMAIN to this same string and
  -- its services resolve under it. It is this value because it is what d2e's
  -- IdP migration mints, and is_placeholder_email is what code must branch on;
  -- nothing here is protected by the address being unreachable, because it is
  -- not. See auth/engine-address.ts for the phase 3 follow-up that would move
  -- both sides at once.
  --
  -- This block backfills the users that existed when Better Auth took the
  -- tables over; auth/federation/providers.ts mints the ones that arrive
  -- afterwards, under the same domain and the same slug rule, so that a row
  -- from either is indistinguishable from a row from the other. Changing
  -- either side is changing both.
  placeholder_domain CONSTANT TEXT := 'd2e.local';
  candidate TEXT;
  local_part TEXT;
  id_local_part TEXT;
  r RECORD;
BEGIN
  FOR r IN
    -- The local part comes from the identifier the user actually signs in with,
    -- not from "user".name: name is a display name, is not unique, and would
    -- both invent nonsense addresses and abort this migration on the UNIQUE
    -- constraint. A federated row's accountId is the upstream subject, which is
    -- what the directory knows the user by; the credential row's accountId is
    -- only ever a copy of the user id, so it sorts last and leaves the upstream
    -- subject to win when a user has both.
    SELECT u.id,
           (SELECT a."accountId"
              FROM trexdb.account a
             WHERE a."userId" = u.id
             ORDER BY (a."providerId" = 'credential'), a."createdAt", a.id
             LIMIT 1) AS sign_in_id
      FROM trexdb."user" u
     WHERE u.email IS NULL
     ORDER BY u.id
  LOOP
    -- The id is the only identifier guaranteed distinct, so it is the backbone
    -- of the scheme rather than merely a fallback, and it is slugified like any
    -- other: a user migrated off another identity provider deliberately keeps
    -- its upstream subject as its id (auth/federation/providers.ts), so an id
    -- outside [a-z0-9._-] is reachable and would otherwise yield a malformed
    -- local part. Without a usable one there is nothing left to fall back to.
    --
    -- Three passes, and the middle one is why: `.` is inside the allowed set, so
    -- a run of them survives the first pass, and `foo..bar` would mint
    -- foo..bar@d2e.local — an address with an empty atom, which the check below
    -- refuses. A migration that aborts on a row the statement above it created
    -- is a trap, not a warning, and the operator's only remedy would be to
    -- change a primary key. Runs of `.` collapse the way runs of everything
    -- else already do; btrim then takes the ends, so what survives is a local
    -- part of [a-z0-9._-] with no leading, trailing or empty atom — which is
    -- exactly what makes it addressable. The refusal below is unchanged: what
    -- changed is that this stopped producing input that trips it.
    id_local_part := btrim(
      regexp_replace(
        regexp_replace(lower(r.id), '[^a-z0-9._-]+', '-', 'g'),
        '\.{2,}', '.', 'g'
      ),
      '-.'
    );
    IF id_local_part = '' THEN
      RAISE EXCEPTION
        'cannot synthesise a placeholder address for user %: its id yields no usable local part', r.id;
    END IF;

    local_part := btrim(
      regexp_replace(
        regexp_replace(lower(COALESCE(r.sign_in_id, r.id)), '[^a-z0-9._-]+', '-', 'g'),
        '\.{2,}', '.', 'g'
      ),
      '-.'
    );
    IF local_part = '' THEN
      local_part := id_local_part;
    END IF;
    candidate := local_part || '@' || placeholder_domain;

    -- Two upstream subjects can slugify to the same local part.
    IF EXISTS (SELECT 1 FROM trexdb."user" WHERE lower(email) = candidate) THEN
      candidate := id_local_part || '@' || placeholder_domain;
    END IF;

    -- Reusing an address that is already taken would hand one person's row the
    -- identity another person signs in with. Refuse the migration instead.
    IF EXISTS (SELECT 1 FROM trexdb."user" WHERE lower(email) = candidate) THEN
      RAISE EXCEPTION
        'cannot synthesise a placeholder address for user %: % is already taken', r.id, candidate;
    END IF;

    -- The cursor read this row as address-less, but the UPDATE takes a fresh
    -- snapshot under READ COMMITTED: re-test the condition here so a concurrent
    -- commit that gave the user a real address cannot be overwritten with a
    -- synthetic one.
    UPDATE trexdb."user"
       SET email = candidate,
           is_placeholder_email = true,
           "emailVerified" = false
     WHERE id = r.id
       AND email IS NULL;
  END LOOP;
END
$$;

-- Every address the engine will be handed has to be one it will accept.
--
-- Better Auth runs zod's z.email() on the address before it looks anybody up,
-- on every credential endpoint, and that rule requires a dotted domain. A row
-- holding `ops@localhost` — which V1 allowed, having imposed no format at all —
-- therefore stops being able to sign in the moment the engine owns
-- verification, with a correct password and a correct credential row, and is
-- told only that its credentials are invalid. That is a silent, permanent
-- lockout, and the person who finds it is the user rather than the operator.
--
-- Refused, not repaired. An address is an identity: there is no safe automatic
-- choice of a new one, for the same reason V16 refuses to pick a winner between
-- two rows sharing a mailbox. Relaxing what the engine validates would mean
-- forking its route or keeping a second credential path alive, and removing the
-- second path is what this plan is for. Told before the deploy, an operator
-- resolves this in minutes; told after, they hear it from a locked-out user.
--
-- Placed after the placeholder backfill on purpose, so it sees the addresses
-- this migration itself mints and not only the ones it inherited. The fold
-- below moved with it: the backfill compares candidates with lower(email) on
-- both sides and mints lower-case local parts, so folding before or after it is
-- the same thing, and one check over the final population is worth more than
-- two over halves of it.
--
-- Refusing this late leaves nothing behind, but NOT by the mechanism the
-- migration plugin's own comment suggests. A Postgres migration takes the
-- `is_postgres` branch of execute_migrations_in_schema
-- (plugins/migration/src/lib.rs), which issues no BEGIN and no COMMIT — the
-- explicit wrapper is on the other branch, the one this file never takes. What
-- discards the statements above is Postgres itself: a simple query carrying
-- several statements runs in one implicit transaction, and an error in any of
-- them throws all of it away.
--
-- That guarantee is therefore contingent on postgres_execute receiving this
-- file as ONE simple query, which is what postgres_execute_sql does today
-- (lib.rs:646 passes the whole text as a single argument). If it ever split the
-- file into statements, or moved to the extended protocol, each statement would
-- commit on its own: this check would still refuse, but the fold and the
-- backfill above it would already have landed, and this comment would be the
-- only thing still claiming otherwise. Changing how migrations are submitted
-- means coming back here.
--
-- The history row is written by a separate call (insert_migration_record_in),
-- so a migration and its record are not atomic with each other: a crash between
-- them re-runs the file. Everything here is written to survive that.
--
-- TWIN OF isEngineAddressable IN core/server/auth/engine-address.ts, which is
-- itself a copy of zod's z.email(). (auth-router.ts re-exports the name, so a
-- search that lands there is one hop from the definition.) All three must move together; a parity test
-- (auth/auth-engine-cutover.test.ts) asks this expression, that predicate and
-- the live engine the same addresses and fails if any of them disagrees. The
-- expression is restated here rather than shared because a migration is text
-- handed to the session verbatim and checksummed, and can call nothing.
DO $$
DECLARE
  unusable text;
BEGIN
  SELECT string_agg(email, ', ' ORDER BY email) INTO unusable
    FROM trexdb."user"
   WHERE email IS NOT NULL
     AND email !~ '^(?:[A-Za-z0-9_''+-]+\.)*[A-Za-z0-9_''+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$';

  IF unusable IS NOT NULL THEN
    RAISE EXCEPTION
      'trexdb."user" holds addresses the authentication engine will not accept: %',
      unusable
      USING HINT =
        'Better Auth validates the address before it looks a user up, so each '
        'account above would be unable to sign in after this migration, with no '
        'error but "invalid credentials". Give each one an address with a dotted '
        'domain (someone@example.com, not someone@localhost), or delete the '
        'account if it is defunct — soft-deleting is not enough, a deleted row '
        'still holds the address. Re-run the migration after.';
  END IF;
END
$$;

-- Addresses move to the engine's storage convention: Better Auth looks a user
-- up with `email = <the address it was given, lower-cased>` and lower-cases
-- every address it writes itself, so a row still holding the spelling somebody
-- typed is invisible to it. Its holder is not told that nothing can see them —
-- they are told their password is wrong.
--
-- THIS IS ONLY SAFE BECAUSE V16 PRECEDES IT. V16's user_email_lower_key already
-- admits at most one row per folded address, so folding cannot collide with a
-- case variant that would have to be resolved by hand, and the identity that
-- index defines does not change. Reordering or renumbering these two turns this
-- statement into one that can abort the migration on a duplicate key.
--
-- auth-router.ts folds the same way on the sign-in path, and both are needed.
-- This one settles the population that exists at the deploy, so nobody has to
-- sign in to become visible and nothing reading user.email sees a mixture.
-- That one settles the rows written afterwards, because PUT /user stores the
-- spelling the account holder typed and is pinned to that by the wire contract.
-- Removing either leaves a way for a row to be unreachable by the engine.
UPDATE trexdb."user" SET email = lower(email) WHERE email <> lower(email);

-- Every row on the placeholder domain is marked as one, not only the rows this
-- migration synthesised.
--
-- The backfill above flags what it mints (WHERE u.email IS NULL). That covers
-- an installation whose address-less users are still address-less when V17
-- runs. It does NOT cover the one this migration will actually meet: an
-- installation that has ALREADY run d2e's IdP migration, whose users therefore
-- arrive here holding <username>@d2e.local as an ordinary address. Those rows
-- pass through V17 untouched — placeholder false, verified true — and are then
-- link candidates for any upstream that asserts one, which is the whole reason
-- the flag exists.
--
-- Beside the addressability sweep below rather than inside the backfill,
-- because it is the same kind of statement: a rule about the address, asked of
-- the entire population, whoever wrote it. auth/engine-address.ts's
-- isPlaceholderAddress is this expression's twin and the five routes that write
-- an address all ask it; this is the seventh door, and the migration is the one
-- place that can close it for rows that predate them all.
--
-- After the fold above on purpose, so `email` is already lower-cased; the
-- lower() here is belt-and-braces and makes the statement true read on its own.
-- The domain is taken after the LAST '@', matching emailDomain's rule, so a
-- quoted local part cannot smuggle one in.
UPDATE trexdb."user"
   SET is_placeholder_email = true,
       "emailVerified" = false,
       email_confirmed_at = NULL
 WHERE lower(substring(email from '[^@]*$')) = 'd2e.local'
   AND (is_placeholder_email IS NOT TRUE
        OR "emailVerified" IS TRUE
        OR email_confirmed_at IS NOT NULL);

-- Better Auth declares email, emailVerified, createdAt and updatedAt required.
-- A nullable column with a default still lets an old row hold NULL, which the
-- adapter reads back as a missing required field, so the rows are backfilled
-- and the columns closed.
UPDATE trexdb."user" SET "emailVerified" = false WHERE "emailVerified" IS NULL;
UPDATE trexdb."user" SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb."user" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE trexdb.session SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb.session SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE trexdb.account SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb.account SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE trexdb.verification SET "createdAt" = NOW() WHERE "createdAt" IS NULL;
UPDATE trexdb.verification SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;

ALTER TABLE trexdb."user"
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN "emailVerified" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE trexdb.session
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE trexdb.account
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE trexdb.verification
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

COMMENT ON COLUMN trexdb."user".is_placeholder_email IS
  'The address is synthesised, not a contact address. Mail paths must refuse it.';

-- Supersedes V14's comment: the column is NOT NULL again, and an address-less
-- federated user is now carried by is_placeholder_email instead of by NULL.
COMMENT ON COLUMN trexdb."user".email IS
  'Login address. Synthesised for a federated user whose upstream asserted none; see is_placeholder_email.';

-- --------------------------------------------------------------------------
-- SECTION 2 — trexdb.jwks, the jwt plugin's signing keys
-- Phase: V18__jwks_signing_key.sql
-- --------------------------------------------------------------------------

-- The jwt plugin keeps its keys here, and the row id is the kid that goes into
-- every JWS header. The table is NOT new: V1 created it (unqualified, under
-- `SET search_path TO trexdb` at V1:17) with four columns and a nullable
-- "createdAt", back when nothing wrote to it. So CREATE TABLE IF NOT EXISTS is
-- a no-op here and every column the jwt plugin adds has to arrive by ALTER.
-- Since better-auth 1.7 a missing column is a SchemaMismatchError at boot, not
-- a warning, so an incomplete migration takes the whole server down.
CREATE TABLE IF NOT EXISTS trexdb.jwks (
  id           TEXT PRIMARY KEY,
  "publicKey"  TEXT NOT NULL,
  "privateKey" TEXT NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL,
  "expiresAt"  TIMESTAMPTZ
);

ALTER TABLE trexdb.jwks ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE trexdb.jwks ADD COLUMN IF NOT EXISTS alg TEXT;
ALTER TABLE trexdb.jwks ADD COLUMN IF NOT EXISTS crv TEXT;

-- The plugin declares "createdAt" required. V1 left it nullable with a default,
-- so any row predating this migration could hold NULL; backfill before the
-- constraint, or SET NOT NULL fails on exactly the installations that have one.
UPDATE trexdb.jwks SET "createdAt" = now() WHERE "createdAt" IS NULL;
ALTER TABLE trexdb.jwks ALTER COLUMN "createdAt" SET NOT NULL;

COMMENT ON COLUMN trexdb.jwks.id IS
  'The kid. Relying parties select the verification key by it, so it is never regenerated for an imported key.';

-- --------------------------------------------------------------------------
-- SECTION 3 — The @better-auth/oauth-provider tables
-- Phase: V19__oauth_provider_tables.sql
-- --------------------------------------------------------------------------

-- The tables @better-auth/oauth-provider@1.7.5 owns. Since better-auth 1.7 a
-- table or column the plugin declares and the database does not have is a
-- SchemaMismatchError at boot and on every request that awaits validation, so
-- these have to exist before the provider is mounted, not after.
--
-- The shapes are `getMigrations(auth.options).compileMigrations()` for an
-- instance carrying jwt + oauthProvider, transcribed rather than invented: the
-- plugin reads and writes these columns through its adapter, and a column of
-- the wrong type is a runtime failure inside the library. Two transcription
-- notes that are easy to get wrong by hand:
--   * every `string[]` field is JSONB, not text[] — the adapter hands the
--     driver a JS array and node-pg encodes it as JSON;
--   * oauthClientResource."resourceId" references oauthResource.identifier,
--     NOT oauthResource.id, and the table has createdAt but no updatedAt.
--
-- Nothing is dropped here: trexdb.oidc_client and friends still serve the
-- hand-written provider until the cutover replaces it.

CREATE TABLE IF NOT EXISTS trexdb."oauthClient" (
  "id"                               TEXT NOT NULL PRIMARY KEY,
  "clientId"                         TEXT NOT NULL UNIQUE,
  "clientSecret"                     TEXT,
  "clientDiscoveryId"                TEXT,
  "disabled"                         BOOLEAN,
  "skipConsent"                      BOOLEAN,
  "enableEndSession"                 BOOLEAN,
  "subjectType"                      TEXT,
  "scopes"                           JSONB,
  "clientCredentialsScopes"          JSONB,
  "userId"                           TEXT REFERENCES trexdb."user" ("id") ON DELETE CASCADE,
  "createdAt"                        TIMESTAMPTZ,
  "updatedAt"                        TIMESTAMPTZ,
  "name"                             TEXT,
  "uri"                              TEXT,
  "icon"                             TEXT,
  "contacts"                         JSONB,
  "tos"                              TEXT,
  "policy"                           TEXT,
  "softwareId"                       TEXT,
  "softwareVersion"                  TEXT,
  "softwareStatement"                TEXT,
  "redirectUris"                     JSONB NOT NULL,
  "postLogoutRedirectUris"           JSONB,
  "backchannelLogoutUri"             TEXT,
  "backchannelLogoutSessionRequired" BOOLEAN,
  "tokenEndpointAuthMethod"          TEXT,
  "applicationType"                  TEXT,
  "jwks"                             TEXT,
  "jwksUri"                          TEXT,
  "grantTypes"                       JSONB,
  "responseTypes"                    JSONB,
  "requirePKCE"                      BOOLEAN,
  "dpopBoundAccessTokens"            BOOLEAN,
  "referenceId"                      TEXT,
  "metadata"                         JSONB
);

CREATE TABLE IF NOT EXISTS trexdb."oauthResource" (
  "id"                            TEXT NOT NULL PRIMARY KEY,
  "identifier"                    TEXT NOT NULL UNIQUE,
  "name"                          TEXT NOT NULL,
  "accessTokenTtl"                INTEGER,
  "refreshTokenTtl"               INTEGER,
  "signingAlgorithm"              TEXT,
  "signingKeyId"                  TEXT,
  "allowedScopes"                 JSONB,
  "customClaims"                  JSONB,
  "dpopBoundAccessTokensRequired" BOOLEAN,
  "disabled"                      BOOLEAN,
  "createdAt"                     TIMESTAMPTZ,
  "updatedAt"                     TIMESTAMPTZ,
  "policyVersion"                 INTEGER,
  "metadata"                      JSONB
);

-- enforcePerClientResources defaults to true, and an unlinked client is not a
-- degraded flow but a dead one: /oauth2/authorize answers error=invalid_target
-- and issues no code. So this join table is load-bearing, and the seeder writes
-- a row into it for every resource the deployment serves.
CREATE TABLE IF NOT EXISTS trexdb."oauthClientResource" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "clientId"   TEXT NOT NULL REFERENCES trexdb."oauthClient" ("clientId") ON DELETE CASCADE,
  "resourceId" TEXT NOT NULL REFERENCES trexdb."oauthResource" ("identifier") ON DELETE CASCADE,
  "metadata"   JSONB,
  "createdAt"  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trexdb."oauthRefreshToken" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "token"                   TEXT NOT NULL UNIQUE,
  "clientId"                TEXT NOT NULL REFERENCES trexdb."oauthClient" ("clientId") ON DELETE CASCADE,
  "sessionId"               TEXT REFERENCES trexdb."session" ("id") ON DELETE SET NULL,
  "userId"                  TEXT NOT NULL REFERENCES trexdb."user" ("id") ON DELETE CASCADE,
  "referenceId"             TEXT,
  "authorizationCodeId"     TEXT,
  "resources"               JSONB,
  "requestedUserInfoClaims" JSONB,
  "expiresAt"               TIMESTAMPTZ NOT NULL,
  "createdAt"               TIMESTAMPTZ NOT NULL,
  "revoked"                 TIMESTAMPTZ,
  "rotatedAt"               TIMESTAMPTZ,
  "rotationReplayResponse"  TEXT,
  "rotationReplayExpiresAt" TIMESTAMPTZ,
  "authTime"                TIMESTAMPTZ,
  "confirmation"            JSONB,
  "scopes"                  JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS trexdb."oauthAccessToken" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "token"                   TEXT NOT NULL UNIQUE,
  "clientId"                TEXT NOT NULL REFERENCES trexdb."oauthClient" ("clientId") ON DELETE CASCADE,
  "sessionId"               TEXT REFERENCES trexdb."session" ("id") ON DELETE SET NULL,
  "userId"                  TEXT REFERENCES trexdb."user" ("id") ON DELETE CASCADE,
  "referenceId"             TEXT,
  "authorizationCodeId"     TEXT,
  "resources"               JSONB,
  "requestedUserInfoClaims" JSONB,
  "refreshId"               TEXT REFERENCES trexdb."oauthRefreshToken" ("id") ON DELETE CASCADE,
  "expiresAt"               TIMESTAMPTZ NOT NULL,
  "createdAt"               TIMESTAMPTZ NOT NULL,
  "revoked"                 TIMESTAMPTZ,
  "confirmation"            JSONB,
  "scopes"                  JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS trexdb."oauthConsent" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "clientId"                TEXT NOT NULL REFERENCES trexdb."oauthClient" ("clientId") ON DELETE CASCADE,
  "userId"                  TEXT REFERENCES trexdb."user" ("id") ON DELETE CASCADE,
  "referenceId"             TEXT,
  "resources"               JSONB,
  "requestedUserInfoClaims" JSONB,
  "scopes"                  JSONB NOT NULL,
  "createdAt"               TIMESTAMPTZ NOT NULL,
  "updatedAt"               TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS trexdb."oauthClientAssertion" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx"                    ON trexdb."oauthClient" ("userId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx"          ON trexdb."oauthClientResource" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx"        ON trexdb."oauthClientResource" ("resourceId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx"            ON trexdb."oauthRefreshToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx"           ON trexdb."oauthRefreshToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx"              ON trexdb."oauthRefreshToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx" ON trexdb."oauthRefreshToken" ("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx"             ON trexdb."oauthAccessToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx"            ON trexdb."oauthAccessToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx"               ON trexdb."oauthAccessToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx"  ON trexdb."oauthAccessToken" ("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx"            ON trexdb."oauthAccessToken" ("refreshId");
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx"                 ON trexdb."oauthConsent" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx"                   ON trexdb."oauthConsent" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "oauthClientResource_clientId_resourceId_uidx"
  ON trexdb."oauthClientResource" ("clientId", "resourceId");

COMMENT ON COLUMN trexdb."oauthClient"."metadata" IS
  'Carries clientRoles: the plugin has no column for the roles a client_credentials token authorizes as, and customAccessTokenClaims is handed this object.';

-- --------------------------------------------------------------------------
-- SECTION 4 — trexdb.sso_provider, for @better-auth/sso
-- Phase: V20__sso_provider_better_auth.sql
-- --------------------------------------------------------------------------

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
  -- stays nullable and is left NULL unless an owner is known. Its foreign key
  -- is added separately below rather than inline, because an inline REFERENCES
  -- rides on ADD COLUMN IF NOT EXISTS: against a database that somehow already
  -- had the column, the whole clause is skipped and the table silently ends up
  -- without the key.
  ADD COLUMN IF NOT EXISTS "userId"         TEXT;

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

-- The mirror, as an invariant rather than as a habit.
--
-- The trigger below fills only a NULL, by design, so without this an explicit
-- `UPDATE ... SET "providerId" = <anything>` splits trex's identity for a
-- provider (everything trex has keys on id) from the plugin's (which resolves
-- by providerId alone) inside a single row — the "two sides disagree about
-- which upstreams exist" failure this file's header says the mirror exists to
-- prevent. It also gives providerId the pattern constraint it otherwise lacks,
-- for free: id already carries CHECK (id ~ '^[a-z][a-z0-9_]*$').
--
-- A CHECK rather than an unconditional trigger assignment, deliberately.
-- Overwriting the value would silently discard what a writer asked for, and
-- the writer most likely to ask wrongly is a future one reading the wrong
-- field into this column; that must fail where it happens, not be quietly
-- corrected. The same reasoning applies to a replay: if some row has already
-- been split, this ADD CONSTRAINT refuses, which is the right outcome — the
-- split has to be looked at, not migrated over.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conname = 'sso_provider_provider_id_mirrors_id_check'
        AND conrelid = 'trexdb.sso_provider'::regclass
  ) THEN
    ALTER TABLE trexdb.sso_provider
      ADD CONSTRAINT sso_provider_provider_id_mirrors_id_check
      CHECK ("providerId" = id);
  END IF;
END
$$;

-- Guarded on the column set, not on the constraint name: a constraint that
-- already covers ("providerId") satisfies the plugin whatever it is called,
-- and keying on the name alone would add a second, duplicate unique index to
-- any database where it had been renamed.
--
-- Strictly this is implied by the CHECK above plus the primary key on id. It
-- is kept because the plugin's model declares the field `unique: true` in its
-- own right, so a later decision to decouple providerId from id must not
-- silently take uniqueness with it.
DO $$
DECLARE
  provider_id_attnum SMALLINT;
BEGIN
  SELECT attnum INTO provider_id_attnum
    FROM pg_attribute
   WHERE attrelid = 'trexdb.sso_provider'::regclass
     AND attname = 'providerId';
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'trexdb.sso_provider'::regclass
        AND contype = 'u'
        AND conkey = ARRAY[provider_id_attnum]
  ) THEN
    ALTER TABLE trexdb.sso_provider
      ADD CONSTRAINT sso_provider_provider_id_key UNIQUE ("providerId");
  END IF;
END
$$;

-- ON DELETE SET NULL, not the CASCADE Better Auth would generate from the
-- plugin's `references` (which names no onDelete): deleting an administrator
-- must not delete the provider configuration with them. That would take
-- federation down for everybody as a side effect of an unrelated account being
-- removed, and nothing would report it — getMigrations does not diff foreign
-- key actions, so the difference is invisible to every check in the tree
-- except this file.
--
-- Guarded on the column set for the same reason as the unique constraint, and
-- separate from ADD COLUMN so that a pre-existing column still gets the key.
DO $$
DECLARE
  user_id_attnum SMALLINT;
BEGIN
  SELECT attnum INTO user_id_attnum
    FROM pg_attribute
   WHERE attrelid = 'trexdb.sso_provider'::regclass
     AND attname = 'userId';
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'trexdb.sso_provider'::regclass
        AND contype = 'f'
        AND conkey = ARRAY[user_id_attnum]
  ) THEN
    ALTER TABLE trexdb.sso_provider
      ADD CONSTRAINT sso_provider_user_id_fkey
      FOREIGN KEY ("userId") REFERENCES trexdb."user"(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- The backfill fixes the rows that exist; this keeps every later writer in
-- step. There are two such writers today and neither sets providerId:
-- trexdb.save_sso_provider (V1, still reached by the sso-save MCP tool at
-- core/server/mcp/tools/sso.ts:35) inserts five columns, and upsertProvider
-- (core/server/auth/federation/admin-store.ts:12-31) writes the federation
-- columns. Without this, a provider created either way is invisible to the
-- plugin — a row that exists, is enabled, and that no sign-in can ever
-- resolve.
--
-- Only a NULL is filled. A writer that sets the column keeps what it set, and
-- the CHECK above is what decides whether what it set was allowed: this is the
-- default, not the rule.
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

-- --------------------------------------------------------------------------
-- SECTION 5 — Preserving account."refreshToken"
-- Phase: V21__account_preserve_refresh_token.sql
-- --------------------------------------------------------------------------

-- Keep a stored refresh token when a sign-in does not bring a new one.
--
-- This restores, exactly, a property the pre-cutover write path had and the
-- Better Auth path lost. auth/federation/providers.ts's upsertAccount wrote
--
--   "refreshToken" = COALESCE(EXCLUDED."refreshToken", trexdb.account."refreshToken")
--
-- because providers commonly issue a refresh token only on the FIRST
-- authorization: on every later sign-in the token response simply omits it, and
-- an omission means "unchanged", not "revoked". Better Auth's own update filters
-- `undefined` out of its payload, which covers the omitted case, but not the
-- other three an upstream can produce. Measured against a real callback, with
-- the token response varied per call:
--
--   refresh_token: "rt"   -> the new token, sealed
--   refresh_token absent  -> column not written at all
--   refresh_token: null   -> column set to NULL, stored token destroyed
--   refresh_token: ""     -> column set to NULL, stored token destroyed
--   refresh_token: 12345  -> column set to NULL, stored token destroyed
--
-- `null` is an ordinary JSON shape, so this needed no misbehaving IdP: one
-- re-authentication silently cost the installation its offline access, with
-- nothing reporting it, until somebody re-consented from scratch.
--
-- Why a trigger and not the hook. The envelope in
-- auth/federation/account-tokens.ts runs in databaseHooks.account.update.before,
-- which better-auth's updateWithHooks calls with the update payload and the
-- endpoint context but NOT the `where` clause; the payload the sign-in path
-- builds (dist/oauth2/link-account.mjs:145-152) carries no id and no accountId
-- either. So the hook cannot identify the row it is updating and cannot read the
-- value it would preserve. The old row is visible in exactly one place, and this
-- is it. Putting it here also covers every writer rather than only the plugin's
-- — which matters while upsertAccount is still a second writer.
--
-- refreshToken only, deliberately. The other two token columns are NOT
-- preserved, and upsertAccount did not preserve them either ("accessToken" =
-- EXCLUDED."accessToken", "idToken" = EXCLUDED."idToken", both unconditional):
--
--   * accessToken is short-lived and expected to rotate. The plugin writes
--     accessTokenExpiresAt on the same update, so preserving a previous access
--     token would pair a stale credential with a fresh expiry — a token that
--     looks live to every reader and is not. NULL is the honest answer.
--   * idToken is an assertion about ONE authentication event: its auth_time,
--     nonce, at_hash and exp all describe the sign-in that produced it. Carrying
--     a previous login's id_token forward would make the row state something
--     false about this login.
--
-- Clearing a refresh token in place is no longer possible, and nothing needs to.
-- Unlinking deletes the row (better-auth api/routes/account.mjs:280 ->
-- internalAdapter.deleteAccount, a DELETE, which a BEFORE UPDATE trigger does
-- not see), and trex's admin federation API removes links the same way. If a
-- revocation path ever has to clear the column on a surviving row, this trigger
-- must be amended to let it — not worked around with a session variable, which
-- would be one forgotten SET away from disabling the protection wholesale.
--
-- Re-runnable: CREATE OR REPLACE plus DROP TRIGGER IF EXISTS, the pattern V20
-- uses. It needs no backfill — it changes what future updates may do, and
-- existing rows are already whatever they are. It is also a no-op for
-- upsertAccount's own writes, whose COALESCE has already put the old value in
-- NEW by the time the trigger sees it.
CREATE OR REPLACE FUNCTION trexdb.account_preserve_refresh_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW."refreshToken" := OLD."refreshToken";
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_preserve_refresh_token ON trexdb.account;
-- The WHEN clause is the whole condition, so the function body has nothing left
-- to decide: it fires only where there is a stored token and the incoming write
-- would erase it. An update that carries a new refresh token, or that never
-- mentions the column (NEW then holds OLD's value), does not reach the function.
CREATE TRIGGER trg_account_preserve_refresh_token
  BEFORE UPDATE ON trexdb.account
  FOR EACH ROW
  WHEN (NEW."refreshToken" IS NULL AND OLD."refreshToken" IS NOT NULL)
  EXECUTE FUNCTION trexdb.account_preserve_refresh_token();

COMMENT ON COLUMN trexdb.account."refreshToken" IS
  'DEK ciphertext, or NULL. Preserved by trg_account_preserve_refresh_token when an update would set it to NULL: an upstream that omits, nulls or mangles refresh_token on a later sign-in means "unchanged", not "revoked". Read only through auth/federation/providers.ts''s readAccountTokens.';
