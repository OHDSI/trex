-- Where the BROWSER is sent to authenticate at an upstream provider, when that
-- differs from the discovery document's authorization_endpoint.
--
-- An upstream reached over an internal hostname (d2e's Logto publishes
-- https://<project>-logto-1.d2e.local:3001/oidc/auth) serves discovery, token
-- and JWKS to trex just fine, but names an authorize URL no browser can resolve.
-- Only the redirect is overridden; server-side calls keep using discovery.
ALTER TABLE trexdb.sso_provider
  ADD COLUMN IF NOT EXISTS authorization_endpoint TEXT;

COMMENT ON COLUMN trexdb.sso_provider.authorization_endpoint IS
  'Optional browser-facing authorize URL. NULL means use the discovery document''s authorization_endpoint.';
