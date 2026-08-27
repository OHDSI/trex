import { assert, assertEquals } from "jsr:@std/assert";

const url = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "V10 adds a nullable followup origin that round-trips and survives its child being deleted",
  ignore: !url,
  fn: async () => {
    const { Pool } = await import("npm:pg");
    const pool = new Pool({ connectionString: url });
    let parentId: string | undefined;
    try {
      const col = await pool.query(
        `SELECT is_nullable, data_type FROM information_schema.columns
          WHERE table_schema = 'agents' AND table_name = 'turn_followups'
            AND column_name = 'origin_child_session_id'`,
      );
      assertEquals(col.rows.length, 1, "V10 must add agents.turn_followups.origin_child_session_id");
      // Nullable is load-bearing: the overwhelming majority of rows are human
      // or channel messages queued behind a busy turn, which have no origin
      // and must need no backfill.
      assertEquals(col.rows[0].is_nullable, "YES");
      assertEquals(col.rows[0].data_type, "uuid");

      const p = await pool.query(
        `INSERT INTO agents.sessions (plugin, agent) VALUES ('v10-origin','t') RETURNING id`,
      );
      parentId = p.rows[0].id;
      const c = await pool.query(
        `INSERT INTO agents.sessions (plugin, agent, parent_session_id, detached)
         VALUES ('v10-origin','t',$1,true) RETURNING id`,
        [parentId],
      );
      const childId = c.rows[0].id;

      await pool.query(
        `INSERT INTO agents.turn_followups (session_id, message, origin_child_session_id)
         VALUES ($1,'a child result',$2), ($1,'a human message',NULL)`,
        [parentId, childId],
      );
      const rows = await pool.query(
        `SELECT message, origin_child_session_id FROM agents.turn_followups
          WHERE session_id = $1 ORDER BY message`,
        [parentId],
      );
      assertEquals(rows.rows.map((r: { origin_child_session_id: string | null }) => r.origin_child_session_id), [
        childId,
        null,
      ]);

      // NOT a foreign key, deliberately: the marker has to outlive the child
      // row it names — a child session can be deleted (its parent's cascade,
      // a cleanup) while its result is still queued, and the row must not
      // vanish or refuse the delete along with it.
      await pool.query(`DELETE FROM agents.sessions WHERE id = $1`, [childId]);
      const after = await pool.query(
        `SELECT origin_child_session_id FROM agents.turn_followups
          WHERE session_id = $1 AND message = 'a child result'`,
        [parentId],
      );
      assertEquals(after.rows.length, 1, "deleting the child must not delete the followup that names it");
      assertEquals(after.rows[0].origin_child_session_id, childId);
    } finally {
      if (parentId) await pool.query(`DELETE FROM agents.sessions WHERE id = $1`, [parentId]);
      await pool.end();
    }
  },
});

Deno.test({
  name: "V9's session-level pending-wake stamp is superseded but left in place",
  ignore: !url,
  fn: async () => {
    const { Pool } = await import("npm:pg");
    const pool = new Pool({ connectionString: url });
    try {
      // Left in the schema on purpose (see V10's own comment): dropping a
      // column mid rolling deploy breaks whichever side has not swapped yet.
      // Nothing reads or writes it any more — store.ts's markPendingWake and
      // readPendingWake are gone.
      const col = await pool.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'agents' AND table_name = 'sessions'
            AND column_name = 'pending_wake_child_id'`,
      );
      assert(col.rows.length === 1, "the superseded column must be left in place, not dropped");
    } finally {
      await pool.end();
    }
  },
});
