import { assert, assertEquals } from "jsr:@std/assert";

const url = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "V11 scopes consents, adds the unattended flag, and is safe to re-apply",
  ignore: !url,
  fn: async () => {
    const { Pool } = await import("npm:pg");
    const pool = new Pool({ connectionString: url });
    try {
      // The five-column key is what makes two scope keys for one tool distinct
      // rows rather than an upsert collision.
      const pk = await pool.query(
        `SELECT array_length(conkey, 1) AS n FROM pg_constraint
          WHERE conrelid = 'agents.tool_consents'::regclass AND contype = 'p'`,
      );
      assertEquals(Number(pk.rows[0].n), 5);

      const cols = await pool.query(
        `SELECT table_name, column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'agents'
            AND (table_name, column_name) IN
                (('tool_consents','scope_key'), ('approvals','scope_key'), ('sessions','unattended'))`,
      );
      assertEquals(cols.rows.length, 3);
      for (const r of cols.rows) {
        assertEquals(r.is_nullable, "NO", `${r.table_name}.${r.column_name} must be NOT NULL`);
      }
      const unattended = cols.rows.find((r) => r.column_name === "unattended");
      assert(String(unattended.column_default).includes("false"));

      // Two scope keys for one tool coexist instead of colliding.
      await pool.query(
        `INSERT INTO agents.tool_consents (user_id, plugin, agent, tool, scope_key, consent)
         VALUES ('v11t','p','a','Bash','npm','always'), ('v11t','p','a','Bash','git','always')
         ON CONFLICT DO NOTHING`,
      );
      const both = await pool.query(
        `SELECT count(*)::int AS n FROM agents.tool_consents WHERE user_id = 'v11t'`,
      );
      assertEquals(both.rows[0].n, 2);

      // The DELETE must sit INSIDE the migration's guard: re-applying V11 on an
      // already-migrated schema must not wipe consents granted since it ran.
      const sql = await Deno.readTextFile(
        new URL("./V11__approval_scoping.sql", import.meta.url),
      );
      await pool.query(sql);
      const survived = await pool.query(
        `SELECT count(*)::int AS n FROM agents.tool_consents WHERE user_id = 'v11t'`,
      );
      assertEquals(survived.rows[0].n, 2);
    } finally {
      await pool.query(`DELETE FROM agents.tool_consents WHERE user_id = 'v11t'`).catch(() => {});
      await pool.end();
    }
  },
});
