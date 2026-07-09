-- SECURITY DEFINER probe: inserts a throwaway row bypassing RLS so read
-- permission can be tested by SELECT-visibility inside a rolled-back authz tx.
-- Testing WRITE is easy (attempt an INSERT as the role, catch the RLS violation);
-- testing READ is not, because a plain SELECT on an empty table returns 0 rows
-- whether the SELECT policy allows or denies. We plant a probe row that bypasses
-- RLS (this function is owned by the table owner and V1 does NOT FORCE ROW LEVEL
-- SECURITY), then SELECT it back AS the role: visibility == read permission.
-- Only ever called server-side inside checkAuthorization's rolled-back tx.
CREATE OR REPLACE FUNCTION realtime._authz_probe(p_topic text) RETURNS void
  LANGUAGE sql SECURITY DEFINER
  SET search_path = realtime, pg_temp
AS $$
  INSERT INTO realtime.messages (topic, extension, event, private)
  VALUES (p_topic, 'broadcast', 'authz-probe', true);
$$;

-- REVOKE from PUBLIC so untrusted roles can never plant probe rows themselves.
REVOKE ALL ON FUNCTION realtime._authz_probe(text) FROM PUBLIC;
