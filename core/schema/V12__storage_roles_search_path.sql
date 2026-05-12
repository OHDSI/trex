-- Storage worker switches role mid-transaction and issues unqualified `buckets` queries.
-- Per-role search_path (not knex `searchPath`) is what survives the SET ROLE.

ALTER ROLE service_role  SET search_path TO storage, public, extensions;
ALTER ROLE authenticated SET search_path TO storage, public, extensions;
ALTER ROLE anon          SET search_path TO storage, public, extensions;
ALTER ROLE authenticator SET search_path TO storage, public, extensions;

-- Guard: storage schema is created later by the worker's own migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA storage TO service_role, authenticated, anon, authenticator';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role';
  END IF;
END $$;
