-- Create the supabase_admin role used by the Supabase Realtime container.
--
-- Realtime needs a Postgres role with REPLICATION + CREATEDB privileges so it
-- can manage its own logical replication slot and bootstrap the _realtime
-- schema on first boot. The role is created with the docker-compose default
-- password 'realtime_admin_pass'; operators are expected to override the
-- compose env var REALTIME_DB_PASSWORD before exposing the stack outside
-- localhost. (See the warning header in docker-compose.yml.)
--
-- Idempotent: re-running this migration after the role exists is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin WITH LOGIN PASSWORD 'realtime_admin_pass'
      REPLICATION CREATEDB CREATEROLE;
  END IF;
END $$;

GRANT ALL PRIVILEGES ON DATABASE testdb TO supabase_admin;

-- Pre-create the _realtime schema. Realtime sets `search_path TO _realtime`
-- as its DB_AFTER_CONNECT_QUERY before its first DDL fires, so the schema
-- must already exist or the bootstrap migrator gets "no schema has been
-- selected to create in".
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
GRANT ALL ON SCHEMA _realtime TO supabase_admin;
