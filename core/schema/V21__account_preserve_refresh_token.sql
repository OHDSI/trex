-- Keep a stored refresh token when a sign-in does not bring a new one.
--
-- This restores, exactly, a property the pre-cutover write path had and the
-- Better Auth path lost. auth/federation/providers.ts's upsertAccount wrote
--
--   "refreshToken" = COALESCE(EXCLUDED."refreshToken", trexdb.account."refreshToken")
--
-- because providers commonly issue a refresh token only on the FIRST
-- authorization: on every later sign-in the token response simply omits it, and
-- an omission means "unchanged", not "revoked". Better Auth's own update filters
-- `undefined` out of its payload, which covers the omitted case, but not the
-- other three an upstream can produce. Measured against a real callback, with
-- the token response varied per call:
--
--   refresh_token: "rt"   -> the new token, sealed
--   refresh_token absent  -> column not written at all
--   refresh_token: null   -> column set to NULL, stored token destroyed
--   refresh_token: ""     -> column set to NULL, stored token destroyed
--   refresh_token: 12345  -> column set to NULL, stored token destroyed
--
-- `null` is an ordinary JSON shape, so this needed no misbehaving IdP: one
-- re-authentication silently cost the installation its offline access, with
-- nothing reporting it, until somebody re-consented from scratch.
--
-- Why a trigger and not the hook. The envelope in
-- auth/federation/account-tokens.ts runs in databaseHooks.account.update.before,
-- which better-auth's updateWithHooks calls with the update payload and the
-- endpoint context but NOT the `where` clause; the payload the sign-in path
-- builds (dist/oauth2/link-account.mjs:145-152) carries no id and no accountId
-- either. So the hook cannot identify the row it is updating and cannot read the
-- value it would preserve. The old row is visible in exactly one place, and this
-- is it. Putting it here also covers every writer rather than only the plugin's
-- — which matters while upsertAccount is still a second writer.
--
-- refreshToken only, deliberately. The other two token columns are NOT
-- preserved, and upsertAccount did not preserve them either ("accessToken" =
-- EXCLUDED."accessToken", "idToken" = EXCLUDED."idToken", both unconditional):
--
--   * accessToken is short-lived and expected to rotate. The plugin writes
--     accessTokenExpiresAt on the same update, so preserving a previous access
--     token would pair a stale credential with a fresh expiry — a token that
--     looks live to every reader and is not. NULL is the honest answer.
--   * idToken is an assertion about ONE authentication event: its auth_time,
--     nonce, at_hash and exp all describe the sign-in that produced it. Carrying
--     a previous login's id_token forward would make the row state something
--     false about this login.
--
-- Clearing a refresh token in place is no longer possible, and nothing needs to.
-- Unlinking deletes the row (better-auth api/routes/account.mjs:280 ->
-- internalAdapter.deleteAccount, a DELETE, which a BEFORE UPDATE trigger does
-- not see), and trex's admin federation API removes links the same way. If a
-- revocation path ever has to clear the column on a surviving row, this trigger
-- must be amended to let it — not worked around with a session variable, which
-- would be one forgotten SET away from disabling the protection wholesale.
--
-- Re-runnable: CREATE OR REPLACE plus DROP TRIGGER IF EXISTS, the pattern V20
-- uses. It needs no backfill — it changes what future updates may do, and
-- existing rows are already whatever they are. It is also a no-op for
-- upsertAccount's own writes, whose COALESCE has already put the old value in
-- NEW by the time the trigger sees it.
CREATE OR REPLACE FUNCTION trexdb.account_preserve_refresh_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW."refreshToken" := OLD."refreshToken";
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_preserve_refresh_token ON trexdb.account;
-- The WHEN clause is the whole condition, so the function body has nothing left
-- to decide: it fires only where there is a stored token and the incoming write
-- would erase it. An update that carries a new refresh token, or that never
-- mentions the column (NEW then holds OLD's value), does not reach the function.
CREATE TRIGGER trg_account_preserve_refresh_token
  BEFORE UPDATE ON trexdb.account
  FOR EACH ROW
  WHEN (NEW."refreshToken" IS NULL AND OLD."refreshToken" IS NOT NULL)
  EXECUTE FUNCTION trexdb.account_preserve_refresh_token();

COMMENT ON COLUMN trexdb.account."refreshToken" IS
  'DEK ciphertext, or NULL. Preserved by trg_account_preserve_refresh_token when an update would set it to NULL: an upstream that omits, nulls or mangles refresh_token on a later sign-in means "unchanged", not "revoked". Read only through auth/federation/providers.ts''s readAccountTokens.';
