-- The @trex/postgrest plugin (the in-process PostgREST implementation) layers
-- Studio-managed settings (trexdb.setting postgrest.* rows: maxRows, dbSchema,
-- dbExtraSearchPath, dbPool) over its PGRST_* env config. Its pool connects as
-- `authenticator`, but trexdb.setting is RLS'd and revoked (it holds the auth
-- keys and other secrets), so a direct SELECT fails with 42501. Expose ONLY
-- the postgrest.* keys through a narrow SECURITY DEFINER reader.
--
-- Values are unwrapped to text (value #>> '{}') so jsonb scalars arrive as
-- strings ('1000', 'public,extensions'), matching how the plugin's config
-- resolver coerces them.
CREATE OR REPLACE FUNCTION trexdb.postgrest_settings()
RETURNS TABLE (key TEXT, value TEXT) AS $$
  SELECT s.key, s.value #>> '{}'
  FROM trexdb.setting s
  WHERE s.key LIKE 'postgrest.%';
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = trexdb;

-- V3's ALTER DEFAULT PRIVILEGES already keeps new trexdb functions off PUBLIC;
-- revoke explicitly anyway (defence in depth) and grant only the roles that
-- need it: authenticator (the plugin's connection role) and service_role.
REVOKE EXECUTE ON FUNCTION trexdb.postgrest_settings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION trexdb.postgrest_settings() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION trexdb.postgrest_settings() TO authenticator, service_role;
