-- Native realtime (core/server) replaces the external supabase/realtime container.
-- Its _realtime schema and supabase_admin role are obsolete. Forward-drop them here
-- rather than editing V1 (which is checksum-verified and already applied in existing
-- deployments).
DROP SCHEMA IF EXISTS _realtime CASCADE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'DROP OWNED BY supabase_admin';
    EXECUTE 'DROP ROLE supabase_admin';
  END IF;
END $$;
