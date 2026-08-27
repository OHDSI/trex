import { assert, assertEquals } from "jsr:@std/assert";

const url = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "V9 adds parent pointers and enforces one running turn per session",
  ignore: !url,
  fn: async () => {
    const { Pool } = await import("npm:pg");
    const pool = new Pool({ connectionString: url });
    try {
      const cols = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='agents' AND table_name='sessions'
           AND column_name = ANY($1::text[])`,
        [["parent_session_id", "parent_turn_id", "subagent", "nickname", "detached", "consecutive_wakes"]],
      );
      assertEquals(cols.rows.length, 6, "V9 columns missing");

      // The unique index must reject a SECOND running turn on one session.
      const s = await pool.query(
        `INSERT INTO agents.sessions (plugin, agent) VALUES ('t','t') RETURNING id`,
      );
      const sid = s.rows[0].id;
      await pool.query(
        `INSERT INTO agents.turns (session_id, seq, message, status)
         VALUES ($1, 1, '"a"'::jsonb, 'running')`, [sid],
      );
      let rejected = false;
      try {
        await pool.query(
          `INSERT INTO agents.turns (session_id, seq, message, status)
           VALUES ($1, 2, '"b"'::jsonb, 'running')`, [sid],
        );
      } catch {
        rejected = true;
      }
      assert(rejected, "a second running turn on one session must be rejected");

      // A finished turn must not block a new running one.
      await pool.query(`UPDATE agents.turns SET status='completed' WHERE session_id=$1`, [sid]);
      await pool.query(
        `INSERT INTO agents.turns (session_id, seq, message, status)
         VALUES ($1, 3, '"c"'::jsonb, 'running')`, [sid],
      );
      await pool.query(`DELETE FROM agents.sessions WHERE id=$1`, [sid]);
    } finally {
      await pool.end();
    }
  },
});
