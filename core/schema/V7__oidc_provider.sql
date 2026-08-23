-- OIDC provider: relying-party registrations, signing keys and the short-lived
-- authorization codes exchanged at the token endpoint.
--
-- Only reached when TREX_OIDC_PROVIDER_ENABLED is set; the tables are created
-- either way so enabling the feature needs no migration step.

CREATE TABLE IF NOT EXISTS trexdb.oidc_client (
    client_id            text PRIMARY KEY,
    -- Public clients (browser apps using PKCE) hold no secret, so this is null
    -- for them and a hash for confidential clients. Never the secret itself.
    client_secret_hash   text,
    name                 text NOT NULL,
    -- Matched exactly at /authorize: no wildcards, no prefix matching. An open
    -- redirect here would hand an attacker the authorization code.
    redirect_uris        text[] NOT NULL,
    post_logout_redirect_uris text[] NOT NULL DEFAULT '{}',
    allowed_scopes       text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
    -- PKCE is mandatory for public clients; confidential clients may opt in.
    require_pkce         boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- The signing keypair for id_tokens. Asymmetric so relying parties verify with
-- the published JWKS and never hold a shared secret, unlike the HS256 key the
-- native IdP uses for its own access tokens. The private half is stored
-- encrypted with a root-derived subkey.
CREATE TABLE IF NOT EXISTS trexdb.oidc_signing_key (
    kid                  text PRIMARY KEY,
    alg                  text NOT NULL DEFAULT 'RS256',
    private_key_encrypted text NOT NULL,
    public_jwk           jsonb NOT NULL,
    -- Retired keys stay published in the JWKS until their last id_token has
    -- expired, so rotation does not invalidate live sessions.
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    retired_at           timestamptz
);

CREATE INDEX IF NOT EXISTS oidc_signing_key_active_idx
    ON trexdb.oidc_signing_key (is_active) WHERE is_active;

-- Authorization codes are single-use and short-lived. The code itself is never
-- stored: only its hash, so a leaked table cannot be replayed against /token.
CREATE TABLE IF NOT EXISTS trexdb.oidc_authorization_code (
    code_hash            text PRIMARY KEY,
    client_id            text NOT NULL REFERENCES trexdb.oidc_client (client_id) ON DELETE CASCADE,
    user_id              uuid NOT NULL,
    redirect_uri         text NOT NULL,
    scope                text NOT NULL,
    nonce                text,
    code_challenge       text,
    code_challenge_method text,
    expires_at           timestamptz NOT NULL,
    -- Set on first exchange. A second exchange is a replay: the token endpoint
    -- rejects it and revokes what the first one issued.
    consumed_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oidc_authorization_code_expires_idx
    ON trexdb.oidc_authorization_code (expires_at);
