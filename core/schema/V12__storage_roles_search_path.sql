-- Supabase Storage compat: search_path + grants on the postgres roles the
-- storage worker SETs into mid-transaction.
--
-- The storage worker (plugins/storage/supabase-storage) opens a postgres
-- transaction, calls `set_config('role', '<service_role|authenticated|anon>',
-- true)` to switch identity, and then issues unqualified queries like
-- `INSERT INTO buckets ...`. Postgres role defaults give those roles a
-- search_path of `"$user", public`, so the unqualified `buckets` reference
-- resolves to nothing and the worker fails with 42P01.
--
-- Knex's own `searchPath` option only runs on connection-acquire; it
-- doesn't survive the in-transaction SET ROLE. Setting search_path on the
-- roles themselves is what actually persists through the role switch.
--
-- This migration is idempotent: ALTER ROLE ... SET is a no-op if already set.

ALTER ROLE service_role  SET search_path TO storage, public, extensions;
ALTER ROLE authenticated SET search_path TO storage, public, extensions;
ALTER ROLE anon          SET search_path TO storage, public, extensions;
ALTER ROLE authenticator SET search_path TO storage, public, extensions;

-- Storage schema is created by the storage worker's own migrations on first
-- boot. Guard the grants so this migration doesn't fail on a freshly-bootstrapped
-- trex where storage hasn't run yet — the worker will re-grant on its own pass.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA storage TO service_role, authenticated, anon, authenticator';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role';
  END IF;
END $$;
