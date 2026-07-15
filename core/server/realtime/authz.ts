import type { Pool } from "pg";
import type { ResolvedCredential } from "../auth/sb-keys.ts";
import { type Channel, onJoinHooks } from "./channel.ts";

// db.ts throws at import time if DATABASE_URL is unset (it constructs the shared
// Pool eagerly). Load it lazily — only when checkAuthorization actually needs the
// pool — so authz.test.ts and any importer can skip gracefully when DATABASE_URL
// is unset instead of crashing at module-load time. Mirrors subscriptions.ts /
// walrus.ts / replication.ts (Task 7 pattern).
let poolPromise: Promise<Pool> | null = null;
function getPool(): Promise<Pool> {
  if (!poolPromise) poolPromise = import("../db.ts").then((m) => m.pool);
  return poolPromise;
}

/**
 * Resolve a private channel's read/write permission from RLS policies on
 * realtime.messages (SELECT policy = read, INSERT policy = write), keyed on
 * realtime.topic(). Evaluated inside a rolled-back transaction that impersonates
 * the caller's role + JWT claims + topic via set_config — nothing persists.
 *
 * READ can't be probed by a plain SELECT (0 rows is ambiguous: empty vs denied),
 * so we plant a probe row that bypasses RLS via the SECURITY DEFINER
 * realtime._authz_probe, then SELECT it back as the role — visibility == read
 * permission. The probe is planted by the (privileged, object-owning) pool
 * connection role BEFORE we `SET LOCAL role` to the caller's app role: the app
 * roles have no EXECUTE on _authz_probe (REVOKEd from PUBLIC, never granted — so
 * untrusted roles can never plant probe rows themselves), and calling it after the
 * role switch would raise "permission denied for function". WRITE is probed by
 * attempting an INSERT as the impersonated role (RLS violation → false), isolated
 * in a SAVEPOINT so its failure doesn't abort the read probe.
 */
// The only DB roles a JWT may impersonate for authz. `set_config('role', $1)`
// with a NULL/undefined value reverts current_user to the privileged pool login
// role (superuser / BYPASSRLS) → read+write for EVERY topic, so this gate MUST
// fail closed on anything unexpected. Reject NULL/missing/unknown roles up front;
// service_role is legitimately privileged by design and stays allowlisted.
const ALLOWED_ROLES = new Set(["authenticated", "anon", "service_role"]);

export async function checkAuthorization(
  claims: ResolvedCredential,
  topic: string, // the sub-topic (channel name without "realtime:")
): Promise<{ read: boolean; write: boolean }> {
  // Fail closed BEFORE any DB access: an unexpected/NULL role never gets to
  // SET ROLE (which would otherwise revert to the superuser pool role).
  if (!ALLOWED_ROLES.has(claims?.role)) return { read: false, write: false };
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Set claims + topic and plant the read-probe row while still the privileged
    // pool role (owner of _authz_probe), then switch to the caller's app role.
    await client.query(
      "SELECT set_config('request.jwt.claims',$1,true), set_config('realtime.topic',$2,true)",
      [JSON.stringify(claims), topic],
    );
    await client.query("SELECT realtime._authz_probe($1)", [topic]);
    await client.query("SELECT set_config('role',$1,true)", [claims.role]);

    // WRITE: try INSERT as the role; RLS violation → false. Savepoint so the
    // failure doesn't abort the whole tx before the read probe runs.
    let write = false;
    await client.query("SAVEPOINT w");
    try {
      await client.query(
        "INSERT INTO realtime.messages (topic, extension, event, private) VALUES ($1,'broadcast','authz-probe',true)",
        [topic],
      );
      write = true;
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT w");
    }

    // READ: can the impersonated role SELECT the probe row back through RLS?
    let read = false;
    try {
      const res = await client.query(
        "SELECT count(*)::int > 0 AS ok FROM realtime.messages WHERE topic=$1 AND event='authz-probe'",
        [topic],
      );
      read = res.rows[0]?.ok === true;
    } catch {
      // SELECT itself denied (no permission) → read stays false.
    }

    return { read, write };
  } finally {
    // Discard the whole probe tx — no probe rows ever persist (never reach the WAL).
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

// Private-channel join hook: a private channel must have read permission to be
// joined. Refuse the join (Elixir-compatible reason string) when read is denied,
// and stash write permission on the channel for later broadcast authz.
onJoinHooks.push(async (ch: Channel) => {
  if (!ch.isPrivate) return;
  const { read, write } = await checkAuthorization(ch.socket.claims, ch.subTopic);
  if (!read) {
    throw new Error(
      `You do not have permissions to read from this Channel topic: ${ch.subTopic}`,
    );
  }
  ch.canWrite = write;
});
