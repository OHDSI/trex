// Revocation for the tokens the provider plugin owns.
//
// The hand-written provider needed none of this: it stored its refresh tokens
// in trexdb.refresh_token, and said so — "a token issued here is revoked by the
// same paths that revoke a password-change or a deletion" (the deleted
// router.ts:94-102). @better-auth/oauth-provider keeps its own tables, so every
// one of those paths silently stopped reaching them at the cutover. A password
// change revoked the native refresh tokens and every engine session and left
// the OIDC refresh token renewing itself — which is the one thing a password
// change exists to prevent.
//
// mount.ts's guard is not a substitute. It refuses a user whose ROW says they
// are retired (deletedAt, banned); it cannot see an event, and a password change
// leaves the row saying the account is perfectly fine.
//
// Deleted rather than flagged `revoked`. A revoked-but-present refresh token is
// still answerable: within the plugin's reuse interval it can be replayed from
// `rotationReplayResponse` (dist/introspect-njKASm3q.mjs:2147-2155), which is
// the stored token response. A row that is gone answers `invalid_grant`,
// "session not found", and nothing else. It is also the shape
// auth-router.ts's endEngineSessions already uses for trexdb.session.
//
// Access tokens go with them: an access token is only a row when it is opaque
// (a request that named no resource), and an opaque bearer outlives its refresh
// token otherwise. A JWT access token has no row and cannot be revoked at all —
// it expires, which is why accessTokenExpiresIn is an hour.
import { pool } from "../../db.ts";

/**
 * Every OIDC token the user holds, across every client and every device.
 *
 * The right granularity for a credential change or an administrative action:
 * those invalidate the account, not one device. Called from the password
 * change, the admin password reset and the ban.
 */
export async function revokeOidcTokensForUser(userId: string): Promise<void> {
  await pool.query(`DELETE FROM trexdb."oauthRefreshToken" WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM trexdb."oauthAccessToken" WHERE "userId" = $1`, [userId]);
}

/**
 * The OIDC tokens issued off one engine session, for the paths that end one
 * engine session rather than the account.
 *
 * `oauthRefreshToken."sessionId"` holds the engine session's id — the plugin
 * stamps it from the session /oauth2/authorize authenticated against, and
 * carries it across every rotation — so this is a real join rather than a
 * guess. Ending the engine session alone does not do it: the refresh grant
 * never reads a session row (dist/introspect-njKASm3q.mjs:2166 reads the user
 * and nothing else), so a deleted session leaves the chain renewing.
 */
export async function revokeOidcTokensForSession(sessionId: string): Promise<void> {
  await pool.query(`DELETE FROM trexdb."oauthRefreshToken" WHERE "sessionId" = $1`, [sessionId]);
  await pool.query(`DELETE FROM trexdb."oauthAccessToken" WHERE "sessionId" = $1`, [sessionId]);
}
