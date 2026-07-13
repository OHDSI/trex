// LIVE smoke test for the replication pipeline. Guarded by DATABASE_URL: skips
// cleanly when unset (like the other DB-backed tests) so the pure wal-shape unit
// tests still run in a DB-less environment.
//
// Verified empirically (2026-07): pg-logical-replication DOES run under Deno's
// node-compat standalone `deno test`, and RelationColumn.typeName is NULL under
// protoVersion 1 — the pipeline's oid→name pg_type fallback map supplies the type.
import { assertEquals } from "jsr:@std/assert";
import { ReplicationPipeline } from "./replication.ts";
import type { Wal2JsonChange } from "./wal-shape.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const TABLE = "rt_repl_test";
const SLOT = "trex_realtime";

Deno.test({
  name: "live: pipeline decodes a real INSERT into a wal2json change",
  ignore: !DATABASE_URL,
  // A real replication connection + walsender leave no lingering ops once stop()
  // drops the slot and the table is dropped; disable leak detection for the
  // underlying node-compat socket teardown which can lag the assertion.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { pool } = await import("../db.ts");

    async function dropSlot() {
      await pool
        .query(`SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1`, [SLOT])
        .catch(() => {});
    }

    const pipeline = new ReplicationPipeline();
    let started = false;
    try {
      await pool.query(`DROP TABLE IF EXISTS public.${TABLE}`);
      await pool.query(`CREATE TABLE public.${TABLE} (id int primary key, note text)`);
      await pool.query(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${TABLE}`).catch(() => {});

      const collected: { changes: Wal2JsonChange[]; commitTime: string }[] = [];
      pipeline.onTransaction = async (changes, commitTime) => {
        collected.push({ changes, commitTime });
      };

      await pipeline.start();
      started = true;

      // Let the walsender establish the stream before writing.
      await new Promise((r) => setTimeout(r, 1000));
      await pool.query(`INSERT INTO public.${TABLE} (id, note) VALUES (1, 'hi')`);

      // Poll up to ~5s for the change to arrive.
      const deadline = Date.now() + 5000;
      while (collected.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }

      assertEquals(collected.length, 1, "expected exactly one transaction fanned out");
      const change = collected[0].changes.find((c) => c.table === TABLE);
      assertEquals(change, {
        action: "I",
        schema: "public",
        table: TABLE,
        columns: [
          { name: "id", type: "int4", value: 1 },
          { name: "note", type: "text", value: "hi" },
        ],
        // pk (names+types, no values) is required downstream by realtime.apply_rls;
        // without it apply_rls returns "no primary key" and emits an empty record.
        pk: [{ name: "id", type: "int4" }],
      });
      // commit_timestamp must be within 5 minutes of now — a TWO-SIDED bound.
      // A one-sided ">2020" check would silently pass a +30yr epoch-offset bug
      // (a 2026 commit mis-decoded as 2056), so assert both a lower AND upper bound.
      const ct = new Date(collected[0].commitTime).getTime();
      const now = Date.now();
      const skewMs = Math.abs(now - ct);
      console.log(`[live] commit_timestamp=${collected[0].commitTime} now=${new Date(now).toISOString()} skewMs=${skewMs}`);
      assertEquals(
        Number.isFinite(ct) && skewMs < 5 * 60_000,
        true,
        `commit_timestamp ${collected[0].commitTime} not within 5min of now ${new Date(now).toISOString()} (skew ${skewMs}ms)`,
      );
    } finally {
      // Clean up regardless of outcome: stop() drops the slot; also drop the table
      // (auto-removes it from the publication) and force-drop the slot as a belt-and-braces
      // guard so we never leak slots on testdb (max 10).
      if (started) await pipeline.stop().catch(() => {});
      await dropSlot();
      await pool.query(`DROP TABLE IF EXISTS public.${TABLE}`).catch(() => {});
    }
  },
});
