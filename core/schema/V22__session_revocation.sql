-- SECTION 1 — revoke credentials on ban / soft-delete
-- Every path that bans or soft-deletes a user (GraphQL updateUser, soft_delete_user,
-- the federation pre-link, MCP, psql) ends its sessions, not only PUT /admin/users/:id.

CREATE OR REPLACE FUNCTION trexdb.revoke_credentials_on_retire() RETURNS TRIGGER AS $$
BEGIN
  -- OIDC rows first only to avoid needless SET NULL writes on rows about to be deleted.
  DELETE FROM trexdb."oauthRefreshToken" WHERE "userId" = NEW.id;
  DELETE FROM trexdb."oauthAccessToken" WHERE "userId" = NEW.id;
  DELETE FROM trexdb.session WHERE "userId" = NEW.id;
  UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
   WHERE "userId" = NEW.id AND revoked = false;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = trexdb;

DROP TRIGGER IF EXISTS trg_user_revoke_on_retire ON trexdb."user";
CREATE TRIGGER trg_user_revoke_on_retire
  AFTER UPDATE OF banned, "deletedAt" ON trexdb."user"
  FOR EACH ROW
  WHEN ((NEW.banned IS TRUE AND OLD.banned IS DISTINCT FROM TRUE)
     OR (NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL))
  EXECUTE FUNCTION trexdb.revoke_credentials_on_retire();

-- SECTION 2 — link refresh-token sessions to Better Auth sessions
-- Ties trex's GoTrue session (refresh_token.session_id) to the Better Auth session issued
-- with it, so /revoke-session and bearer-only /logout can end that one too.
ALTER TABLE trexdb.refresh_token
  ADD COLUMN IF NOT EXISTS engine_session_id TEXT REFERENCES trexdb.session(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_token_engine_session
  ON trexdb.refresh_token (engine_session_id) WHERE engine_session_id IS NOT NULL;
