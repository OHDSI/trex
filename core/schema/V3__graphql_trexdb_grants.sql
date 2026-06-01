-- Grant trexdb privileges so PostGraphile (connecting as `authenticator` and
-- SET ROLE-ing per request) can serve the schema under RLS. Before this, only
-- public/storage/auth had role grants, and GraphQL ran as the owner (bypassing
-- RLS entirely). See docs/superpowers/specs/2026-06-01-postgraphile-rls-auth-design.md
--
-- Design decisions:
--   * service_role (BYPASSRLS): full access — admins + service_role apikey.
--   * authenticated: table CRUD on non-sensitive tables; RLS scopes rows.
--   * anon: schema USAGE only, no table/function privileges — effectively locked.

-- ── Schema usage ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA trexdb TO anon, authenticated, service_role;
-- `authenticator` is NOINHERIT with no table grants, but boot-time schema
-- introspection runs as authenticator before any SET ROLE. USAGE alone grants
-- no table/row access; every request still SET ROLEs to anon/authenticated/
-- service_role.
GRANT USAGE ON SCHEMA trexdb TO authenticator;

-- ── service_role: full access (BYPASSRLS handles row visibility) ─────────────
GRANT ALL ON ALL TABLES IN SCHEMA trexdb TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA trexdb TO service_role;

-- ── authenticated: table CRUD, scoped by RLS ────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trexdb TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA trexdb TO authenticated;

-- ── Functions: lock SECURITY DEFINER functions to service_role ───────────────
-- Postgres grants EXECUTE to PUBLIC by default. Several trexdb functions are
-- SECURITY DEFINER (run as the owner, bypassing RLS) — e.g. search_users,
-- get_setting, save_database_credential — so any anon/authenticated caller could
-- read every user / read secrets / mutate arbitrary rows through PostGraphile.
-- Revoke the PUBLIC default and grant EXECUTE only to service_role. No RLS
-- policy calls a trexdb function, so this breaks nothing; triggers fire without
-- EXECUTE grants.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA trexdb FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA trexdb FROM anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA trexdb TO service_role;

-- ── Defence-in-depth: revoke authenticated on secret-bearing OR un-RLS'd ─────
-- tables. Secret tables (setting, secret, ...) plus tables that have NO RLS
-- policy (event_log, oauth_application, transform_deployment) would otherwise
-- expose every row to any authenticated user. Most are already @omit'd, but a
-- missed @omit must not become a data leak.
REVOKE ALL ON
  trexdb.setting,
  trexdb.secret,
  trexdb.kek_wrapped_dek,
  trexdb.database_credential,
  trexdb.jwks,
  trexdb.oauth_access_token,
  trexdb.oauth_authorization_code,
  trexdb.oauth_consent,
  trexdb.verification,
  trexdb.event_log,
  trexdb.oauth_application,
  trexdb.transform_deployment
FROM authenticated;

-- ── Future objects inherit the same grants (mirrors public schema in V1) ─────
ALTER DEFAULT PRIVILEGES IN SCHEMA trexdb
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA trexdb
  GRANT USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA trexdb
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA trexdb
  GRANT ALL ON SEQUENCES TO service_role;
-- Future functions: keep them off PUBLIC, service_role-only by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA trexdb
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA trexdb
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── Prevent privilege escalation via self-update of the user row ─────────────
-- The user_own_row RLS policy is FOR ALL with only an ownership WITH CHECK, and
-- `trex_role` in the issued JWT is derived from user.role (see
-- core/server/auth/jwt.ts). Without a column restriction a normal authenticated
-- user could `updateUser` their own row to set role/app_metadata = admin (or
-- clear `banned` / set `emailVerified`) and re-login as admin. Column-level
-- UPDATE grants confine authenticated to non-security columns; service_role
-- keeps full access via GRANT ALL above. Admin user management runs as
-- service_role (or via the Better Auth owner pool), so it is unaffected.
REVOKE UPDATE ON trexdb."user" FROM authenticated;
GRANT UPDATE (name, image, phone, user_metadata) ON trexdb."user" TO authenticated;

-- Column-limited UPDATE is not enough on its own: user_own_row is FOR ALL, so a
-- normal user with INSERT/DELETE could `deleteUser` their own row and
-- `createUser` it again with role = admin (the WITH CHECK only verifies id).
-- The user table is trex's locked identity table (cf. Supabase auth.users);
-- end-user lifecycle goes through Better Auth on the owner pool, never GraphQL.
-- Remove INSERT/DELETE for authenticated entirely; service_role keeps ALL.
REVOKE INSERT, DELETE ON trexdb."user" FROM authenticated;
