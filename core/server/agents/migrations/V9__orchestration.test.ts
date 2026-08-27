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
        [[
          "parent_session_id",
          "parent_turn_id",
          "subagent",
          "nickname",
          "detached",
          "consecutive_wakes",
          "pending_wake_child_id",
        ]],
      );
      assertEquals(cols.rows.length, 7, "V9 columns missing");

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

// Final review, Critical 4: `CREATE UNIQUE INDEX IF NOT EXISTS` is idempotent
// against a RE-RUN but not against violating ROWS — on a database that
// already holds two turns left `running` on one session it errors outright
// and wedges the deploy. handler.ts records that 43 of 263 real turns (16%)
// started while a previous turn on the same session was still running, so any
// never-reaped pair is enough. V9 therefore carries its own remediation,
// which must run BEFORE the index (a V10 cleaning up after a failed V9 never
// runs, because a failed V9 stops the chain).
//
// Reproduces the wedge exactly: drop the index, create the violating rows,
// re-run V9, and require it to succeed with the newest running turn kept and
// the older ones marked failed for a stated reason.
Deno.test({
  name: "V9 applies to a database that already violates the one-running-turn rule",
  ignore: !url,
  fn: async () => {
    const { Pool } = await import("npm:pg");
    const pool = new Pool({ connectionString: url });
    const v9 = await Deno.readTextFile(new URL("./V9__orchestration.sql", import.meta.url));
    let sid: string | undefined;
    try {
      await pool.query(`DROP INDEX IF EXISTS agents.idx_agents_turns_one_running_per_session`);
      const s = await pool.query(
        `INSERT INTO agents.sessions (plugin, agent) VALUES ('v9-backfill','t') RETURNING id`,
      );
      sid = s.rows[0].id;
      // Three simultaneously-running turns, oldest first. Only the newest may
      // survive as `running`.
      await pool.query(
        `INSERT INTO agents.turns (session_id, seq, message, status, started_at)
         VALUES ($1, 1, '"a"'::jsonb, 'running', NOW() - interval '3 hours'),
                ($1, 2, '"b"'::jsonb, 'running', NOW() - interval '2 hours'),
                ($1, 3, '"c"'::jsonb, 'running', NOW() - interval '1 hour')`,
        [sid],
      );
      // A gate parked on one of the doomed turns: left `decision IS NULL` it
      // could still be resolved later by a message that merely matches gate
      // vocabulary, silently swallowing that message.
      await pool.query(
        `INSERT INTO agents.approvals (request_id, session_id, turn_id, tool)
         SELECT gen_random_uuid(), $1, id, 'Write' FROM agents.turns WHERE session_id = $1 AND seq = 1`,
        [sid],
      );

      await pool.query(v9); // must not throw

      const turns = await pool.query(
        `SELECT seq, status, error FROM agents.turns WHERE session_id = $1 ORDER BY seq`,
        [sid],
      );
      assertEquals(turns.rows.map((r: { status: string }) => r.status), ["failed", "failed", "running"]);
      assert(
        String(turns.rows[0].error).includes("V9 orchestration backfill"),
        `the backfill must say why the turn was failed, got: ${turns.rows[0].error}`,
      );
      const appr = await pool.query(`SELECT decision FROM agents.approvals WHERE session_id = $1`, [sid]);
      assertEquals(appr.rows[0].decision, "deny", "an approval parked on a backfilled turn must be denied");

      const idx = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='agents' AND indexname=$1`,
        ["idx_agents_turns_one_running_per_session"],
      );
      assertEquals(idx.rows.length, 1, "the index must exist after V9 ran against violating data");

      // Idempotent: a second run finds nothing left to remediate and does not
      // touch the one legitimately-running turn.
      await pool.query(v9);
      const again = await pool.query(
        `SELECT seq, status FROM agents.turns WHERE session_id = $1 ORDER BY seq`,
        [sid],
      );
      assertEquals(again.rows.map((r: { status: string }) => r.status), ["failed", "failed", "running"]);
    } finally {
      if (sid) await pool.query(`DELETE FROM agents.sessions WHERE id=$1`, [sid]);
      await pool.end();
    }
  },
});
