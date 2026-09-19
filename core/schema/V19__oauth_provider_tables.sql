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
