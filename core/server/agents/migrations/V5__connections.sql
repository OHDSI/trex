-- Connections layer / trex-native OAuth broker (spec §5, §7). Two tables:
-- an encrypted per-principal token store and a connector registry.
--
-- agents.oauth_tokens holds the OAuth material the broker mints/refreshes on
-- behalf of a principal (a channel user, or the app itself). access_token_enc /
-- refresh_token_enc are AES-GCM ciphertext (base64 iv||ct+tag) produced by the
-- DEK layer (core/server/auth/dek.ts) — tokens are NEVER stored plaintext.
-- App-scoped tokens use the sentinel principal_id '__app__'. A principal holds
-- at most one token per connector -> composite primary key.
CREATE TABLE IF NOT EXISTS agents.oauth_tokens (
    principal_type VARCHAR(20) NOT NULL,
    principal_id VARCHAR(200) NOT NULL,
    connector VARCHAR(200) NOT NULL,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT,
    expires_at TIMESTAMPTZ,
    scopes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (principal_type, principal_id, connector)
);

-- agents.oauth_connectors is the registry of OAuth providers the broker can
-- drive. client_secret_ref is an ENV/secret *reference* (an env var name), not
-- the secret itself — the secret is resolved from the environment at use time
-- and is NEVER persisted in the table. principal_scope records whether the
-- connector issues per-user tokens or a single app-wide token.
CREATE TABLE IF NOT EXISTS agents.oauth_connectors (
    id VARCHAR(200) PRIMARY KEY,
    authorization_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret_ref VARCHAR(200) NOT NULL,
    scopes TEXT,
    principal_scope VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (principal_scope IN ('user', 'app')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
