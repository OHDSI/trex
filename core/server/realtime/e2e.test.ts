// END-TO-END realtime pipeline test (Task 11 centerpiece). Guarded by
// DATABASE_URL: skips cleanly when unset so the pure unit tests still run in a
// DB-less environment.
//
// This wires the risky half of the feature DIRECTLY (bypassing
// startRealtimeService, whose migration step is stack-only): a real INSERT on a
// published table travels through Postgres logical replication → the pgoutput
// decoder → fanOutTransaction → realtime.apply_rls → a subscribed (fake) channel.
// It proves the whole chain end-to-end, including that the commit_timestamp is
// the real WAL commit time (the epoch-decode fix) rather than a +30yr artifact.
import { assertEquals } from "jsr:@std/assert";
import { ReplicationPipeline } from "./replication.ts";
import { fanOutTransaction } from "./walrus.ts";
import { _insertSubscriptions, clearAllSubscriptions } from "./subscriptions.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const TABLE = "rt_e2e";
const SLOT = "trex_realtime";

Deno.test({
  name: "e2e: real INSERT flows replication → apply_rls → subscribed channel",
  ignore: !DATABASE_URL,
  // A live replication connection + walsender + the shared db.ts pool leave
  // node-compat socket teardown lagging the assertion; disable leak detection as
  // the sibling live tests do.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { pool } = await import("../db.ts");

    async function dropSlot() {
      await pool
        .query(
          `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1`,
          [SLOT],
        )
        .catch(() => {});
    }

    // Everything the fanout chain touches on the fake channel: bindings drive
    // _insertSubscriptions + the per-binding event filter; send() captures every
    // delivered postgres_changes payload; socket.claims become the subscription's
    // RLS claims (role=authenticated must match the GRANT below).
    const received: Array<{ event: string; payload: any }> = [];
    const ch: any = {
      topic: "realtime:rt_e2e",
      subTopic: "rt_e2e",
      socket: { claims: { role: "authenticated", sub: "u1", exp: 9999999999 } },
      bindings: [{ id: 1, event: "*", schema: "public", table: TABLE }],
      subscriptionIds: [],
      send: (event: string, payload: any) => received.push({ event, payload }),
    };

    async function poll(minCount: number, ms = 5000): Promise<void> {
      const deadline = Date.now() + ms;
      while (received.length < minCount && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const pipe = new ReplicationPipeline();
    pipe.onTransaction = fanOutTransaction;
    let started = false;
    try {
      // Fresh slot + a clean published table the subscriber can SELECT.
      await dropSlot();
      await pool.query(`DROP TABLE IF EXISTS public.${TABLE}`);
      await pool.query(
        `CREATE TABLE public.${TABLE} (id int primary key, title text, secret text)`,
      );
      await pool.query(`GRANT SELECT ON public.${TABLE} TO authenticated`);
      await pool
        .query(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${TABLE}`)
        .catch(() => {});

      // Register the subscription (realtime.subscription row + in-memory index) so
      // apply_rls can match the change and lookupSubscription can find the channel.
      await _insertSubscriptions(ch);

      await pipe.start();
      started = true;

      // Let the walsender establish the stream before the first write.
      await new Promise((r) => setTimeout(r, 1000));

      // --- Required: a real INSERT is delivered end-to-end ---------------------
      await pool.query(
        `INSERT INTO public.${TABLE} (id, title, secret) VALUES (1, 'hello', 'x')`,
      );
      await poll(1);

      assertEquals(received.length >= 1, true, "expected an INSERT postgres_changes event");
      const insertEvt = received[0];
      assertEquals(insertEvt.event, "postgres_changes");
      assertEquals(insertEvt.payload.ids, [1]);
      assertEquals(insertEvt.payload.data.type, "INSERT");
      assertEquals(insertEvt.payload.data.schema, "public");
      assertEquals(insertEvt.payload.data.table, TABLE);
      assertEquals(insertEvt.payload.data.record.id, 1);
      assertEquals(insertEvt.payload.data.record.title, "hello");

      // commit_timestamp must be the real WAL commit time — a TWO-SIDED bound so a
      // +30yr epoch-offset regression (2026 mis-decoded as 2056) can't slip past a
      // one-sided ">2020" check. Prove it lands within a few minutes of now.
      const ct = new Date(insertEvt.payload.data.commit_timestamp).getTime();
      const now = Date.now();
      const skewMs = Math.abs(now - ct);
      console.log(
        `[e2e] INSERT delivered: ${JSON.stringify(insertEvt.payload)}`,
      );
      console.log(
        `[e2e] commit_timestamp=${insertEvt.payload.data.commit_timestamp} now=${
          new Date(now).toISOString()
        } skewMs=${skewMs}`,
      );
      assertEquals(
        Number.isFinite(ct) && skewMs < 5 * 60_000,
        true,
        `commit_timestamp ${insertEvt.payload.data.commit_timestamp} not within 5min of now (skew ${skewMs}ms)`,
      );

      // --- Bonus: an UPDATE and a DELETE also deliver -------------------------
      await pool.query(`UPDATE public.${TABLE} SET title = 'world' WHERE id = 1`);
      await poll(2);
      const updateEvt = received.find((e) => e.payload.data?.type === "UPDATE");
      assertEquals(updateEvt !== undefined, true, "expected an UPDATE event");
      assertEquals(updateEvt!.payload.ids, [1]);
      assertEquals(updateEvt!.payload.data.record.title, "world");
      console.log(`[e2e] UPDATE delivered: ${JSON.stringify(updateEvt!.payload)}`);

      await pool.query(`DELETE FROM public.${TABLE} WHERE id = 1`);
      await poll(3);
      const deleteEvt = received.find((e) => e.payload.data?.type === "DELETE");
      assertEquals(deleteEvt !== undefined, true, "expected a DELETE event");
      assertEquals(deleteEvt!.payload.ids, [1]);
      assertEquals(deleteEvt!.payload.data.old_record.id, 1);
      console.log(`[e2e] DELETE delivered: ${JSON.stringify(deleteEvt!.payload)}`);
    } finally {
      // Never leak a slot (testdb max 10): stop() drops it; force-drop as a guard.
      if (started) await pipe.stop().catch(() => {});
      await dropSlot();
      await clearAllSubscriptions().catch(() => {});
      await pool
        .query(`ALTER PUBLICATION supabase_realtime DROP TABLE public.${TABLE}`)
        .catch(() => {});
      await pool.query(`DROP TABLE IF EXISTS public.${TABLE}`).catch(() => {});
    }
  },
});
