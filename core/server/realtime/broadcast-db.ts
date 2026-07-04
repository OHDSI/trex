import { broadcastToTopic } from "./broadcast.ts";
import type { Wal2JsonChange } from "./wal-shape.ts";

/**
 * A realtime.messages INSERT seen on the WAL stream → fan out as a broadcast to
 * the topic's subscribers. This is the broadcast-from-DB path (Supabase's
 * `send()` / direct table INSERT), distinct from postgres_changes/apply_rls.
 *
 * Column values arrive as a wal2json-shaped tuple. We drop anything that isn't a
 * broadcast-extension row, and defensively drop authz-probe rows (those only ever
 * exist inside rolled-back authz txs so should never reach the WAL, but never fan
 * out an authorization probe). jsonb payload may arrive as a string or an object.
 */
export async function handleMessagesInsert(change: Wal2JsonChange): Promise<void> {
  const cols = Object.fromEntries((change.columns ?? []).map((c) => [c.name, c.value]));
  if (cols.extension !== "broadcast") return;
  if (cols.event === "authz-probe") return; // never fan out authorization probes
  // payload is jsonb (normally an object), but a malformed string must not throw
  // out of here and stall the WAL consumer loop on one bad row — fall back to raw.
  let payload = cols.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      // keep the raw string
    }
  }
  broadcastToTopic(`realtime:${cols.topic}`, "broadcast", {
    type: "broadcast",
    event: cols.event,
    payload,
  });
}
