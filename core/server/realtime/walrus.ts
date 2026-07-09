// WALRUS fan-out: turn a committed transaction's wal2json-shaped changes into
// per-subscriber `postgres_changes` events, using the vendored realtime.apply_rls
// SQL function to enforce row/column-level security per subscription.
//
// apply_rls($1::jsonb, $2::int) takes ONE change (the whole Wal2JsonChange, which
// MUST carry `pk` — without it apply_rls returns Error 400 "no primary key" and
// emits an empty record) plus a max-record-bytes budget, and returns one row per
// matched subscription grouping:
//   wal jsonb          — the realtime-js payload (see shape below)
//   is_rls_enabled bool — informational
//   subscription_ids uuid[] — which subscriptions this row is visible to post-RLS
//   errors text[]      — e.g. ["Error 413: Payload Too Large"]; empty on success
//
// OBSERVED apply_rls `wal` output keys (pinned against live testdb, 2026-07-04):
//   { type, schema, table, commit_timestamp, columns, record, old_record? }
//     type            — "INSERT" | "UPDATE" | "DELETE"
//     schema, table   — strings
//     commit_timestamp — always null out of apply_rls; we OVERWRITE with commitTime
//     columns         — [{ name, type }, ...] (no values)
//     record          — the new row, values cast by type (INSERT/UPDATE)
//     old_record      — present for UPDATE/DELETE
// realtime-js consumes exactly these keys plus `errors`.

import type { Pool } from "pg";
import type { Wal2JsonChange } from "./wal-shape.ts";
import { hasSubscribers, lookupSubscription } from "./subscriptions.ts";
import { handleMessagesInsert } from "./broadcast-db.ts";

const MAX_RECORD_BYTES = 1024 * 1024; // 1 MiB — apply_rls's payload-size budget

const ACTION_TO_EVENT: Record<string, string> = {
  I: "INSERT",
  U: "UPDATE",
  D: "DELETE",
  T: "TRUNCATE",
};

// db.ts throws at import time if DATABASE_URL is unset (it constructs the shared
// Pool eagerly). Loading it lazily — only when fan-out actually needs the pool —
// lets walrus.test.ts skip gracefully when DATABASE_URL is unset instead of
// crashing at module-load time before the skip-guard runs. Mirrors
// subscriptions.ts / replication.ts.
let poolPromise: Promise<Pool> | null = null;
function getPool(): Promise<Pool> {
  if (!poolPromise) poolPromise = import("../db.ts").then((m) => m.pool);
  return poolPromise;
}

// Fan out one committed transaction's changes to subscribers. Set as Task 8's
// ReplicationPipeline.onTransaction. commitTime is the ISO commit timestamp we
// stamp onto every delivered payload (apply_rls leaves it null).
export async function fanOutTransaction(
  changes: Wal2JsonChange[],
  commitTime: string,
): Promise<void> {
  for (const change of changes) {
    // realtime.messages INSERTs are broadcast-from-DB → Task 10's handler, never
    // apply_rls. Skip everything else on that table too (only INSERTs matter).
    if (change.schema === "realtime" && change.table === "messages") {
      if (change.action === "I") await handleMessagesInsert(change);
      continue;
    }

    // No subscribers for this schema.table → no apply_rls call at all.
    if (!hasSubscribers(change.schema, change.table)) continue;

    const pool = await getPool();
    const res = await pool.query(
      "SELECT wal, is_rls_enabled, subscription_ids, errors FROM realtime.apply_rls($1::jsonb, $2)",
      [JSON.stringify(change), MAX_RECORD_BYTES],
    );

    const eventType = ACTION_TO_EVENT[change.action];
    for (const row of res.rows) {
      // apply_rls leaves commit_timestamp null; stamp it from the pipeline. errors
      // is an empty pg array ({}) on success → normalize to null (realtime-js
      // surfaces data.errors, e.g. Error 413 Payload Too Large).
      const data = {
        ...(row.wal ?? {}),
        commit_timestamp: commitTime,
        errors: row.errors?.length ? row.errors : null,
      };
      for (const uuid of row.subscription_ids ?? []) {
        const entry = lookupSubscription(uuid);
        if (!entry) continue;
        const b = entry.binding;
        // Per-binding event filter: subscription rows have action_filter '*', so
        // apply_rls does NOT pre-filter by action — enforce it here.
        if (b.event !== "*" && b.event !== eventType) continue;
        entry.channel.send("postgres_changes", { ids: [b.id], data });
      }
    }

    // Yield between changes so a large transaction can't starve the event loop.
    await new Promise((r) => setTimeout(r, 0));
  }
}
