import { assert, assertEquals } from "jsr:@std/assert";

const url = Deno.env.get("DATABASE_URL");
const sqlText = await Deno.readTextFile(new URL("./V14__session_tool_scope.sql", import.meta.url));

// The three columns are read by plugins/devx/agent/lib/session_scope.ts. Each
// must be NOT NULL with a default, or a row written before this migration
// reads back as "declared", flipping an absent allowlist into "no tools".
Deno.test("V14 adds every session-scope column NOT NULL with a default, and only adds", () => {
  for (const col of ["tool_allowlist", "tool_allowlist_declared", "workspace_path"]) {
    const decl = sqlText.match(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}[^,;]*`));
    assert(decl, `${col} must be added with ADD COLUMN IF NOT EXISTS (re-appliable)`);
    assert(/NOT NULL/.test(decl[0]), `${col} must be NOT NULL: ${decl[0]}`);
    assert(/DEFAULT/.test(decl[0]), `${col} must carry a DEFAULT: ${decl[0]}`);
  }
  // "declared empty" and "not declared" must stay distinguishable, so the flag
  // column defaults false and the array default is never consulted for it.
  assert(/tool_allowlist_declared[^,;]*DEFAULT false/.test(sqlText));
  for (const forbidden of [/\bDROP\b/i, /\bDELETE\b/i, /\bUPDATE\b/i]) {
    assert(!forbidden.test(sqlText), `V14 must be additive only: ${forbidden}`);
  }
});

Deno.test({
  name: "V14 defaults leave a pre-existing session reading as nothing-declared, and is safe to re-apply",
  ignore: !url,
  fn: async () => {
    const { Pool } = await import("npm:pg");
    const pool = new Pool({ connectionString: url });
    try {
      const cols = await pool.query(
        `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'agents' AND table_name = 'sessions'
            AND column_name IN ('tool_allowlist','tool_allowlist_declared','workspace_path')`,
      );
      assertEquals(cols.rows.length, 3);
      for (const r of cols.rows) assertEquals(r.is_nullable, "NO", `${r.column_name} must be NOT NULL`);

      const s = await pool.query(
        `INSERT INTO agents.sessions (plugin, agent, created_by) VALUES ('v14t','a','v14t') RETURNING id`,
      );
      const row = await pool.query(
        `SELECT tool_allowlist, tool_allowlist_declared, workspace_path FROM agents.sessions WHERE id = $1`,
        [s.rows[0].id],
      );
      assertEquals(row.rows[0].tool_allowlist_declared, false);
      assertEquals(row.rows[0].workspace_path, "");

      // Re-applying must not disturb a row someone has since declared on.
      await pool.query(sqlText);
      const again = await pool.query(`SELECT tool_allowlist_declared FROM agents.sessions WHERE id = $1`, [s.rows[0].id]);
      assertEquals(again.rows[0].tool_allowlist_declared, false);
    } finally {
      await pool.query(`DELETE FROM agents.sessions WHERE plugin = 'v14t'`).catch(() => {});
      await pool.end();
    }
  },
});
