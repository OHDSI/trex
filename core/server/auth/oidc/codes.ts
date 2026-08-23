// Authorization codes.
//
// The code is returned to the client but never stored: only its SHA-256, so a
// dump of the table cannot be replayed against the token endpoint. Codes are
// single-use — a second exchange is treated as a replay, not as a retry.

import { pool } from "../../db.ts";
import { verifyPkce } from "./policy.ts";

export { verifyPkce };

export const CODE_TTL_SECONDS = 60;

export interface IssuedCode {
  code: string;
  expiresAt: Date;
}

export interface CodeRecord {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  nonce: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hashCode(code: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(code).buffer as ArrayBuffer));
}

export async function issueCode(record: CodeRecord): Promise<IssuedCode> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const code = base64url(raw);
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

  await pool.query(
    `INSERT INTO trexdb.oidc_authorization_code
       (code_hash, client_id, user_id, redirect_uri, scope, nonce,
        code_challenge, code_challenge_method, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      await hashCode(code),
      record.clientId,
      record.userId,
      record.redirectUri,
      record.scope,
      record.nonce,
      record.codeChallenge,
      record.codeChallengeMethod,
      expiresAt.toISOString(),
    ],
  );

  return { code, expiresAt };
}

export type ConsumeResult =
  | { ok: true; record: CodeRecord }
  | { ok: false; reason: "unknown" | "expired" | "replayed" };

/**
 * Marks the code consumed and returns what it stood for.
 *
 * The UPDATE ... WHERE consumed_at IS NULL is what makes this single-use under
 * concurrency: two simultaneous exchanges cannot both match, so only one wins
 * and the loser is reported as a replay.
 */
export async function consumeCode(code: string): Promise<ConsumeResult> {
  const codeHash = await hashCode(code);

  const claimed = await pool.query<{
    client_id: string;
    user_id: string;
    redirect_uri: string;
    scope: string;
    nonce: string | null;
    code_challenge: string | null;
    code_challenge_method: string | null;
    expires_at: string;
  }>(
    `UPDATE trexdb.oidc_authorization_code
        SET consumed_at = now()
      WHERE code_hash = $1 AND consumed_at IS NULL
      RETURNING client_id, user_id, redirect_uri, scope, nonce,
                code_challenge, code_challenge_method, expires_at`,
    [codeHash],
  );

  if (claimed.rows.length === 0) {
    const existing = await pool.query<{ code_hash: string }>(
      `SELECT code_hash FROM trexdb.oidc_authorization_code WHERE code_hash = $1`,
      [codeHash],
    );
    return { ok: false, reason: existing.rows.length ? "replayed" : "unknown" };
  }

  const row = claimed.rows[0];
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    record: {
      clientId: row.client_id,
      userId: row.user_id,
      redirectUri: row.redirect_uri,
      scope: row.scope,
      nonce: row.nonce,
      codeChallenge: row.code_challenge,
      codeChallengeMethod: row.code_challenge_method,
    },
  };
}

/** Housekeeping for codes nobody exchanged; safe to call on any schedule. */
export async function purgeExpiredCodes(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM trexdb.oidc_authorization_code WHERE expires_at < now() - interval '1 hour'`,
  );
  return result.rowCount ?? 0;
}
