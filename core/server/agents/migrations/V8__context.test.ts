import { assert, assertEquals } from "jsr:@std/assert";

const url = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "V7 allows 'compaction' step kind and adds activated_tools",
  ignore: !url,
  fn: async () => {
    const { Client } = await import("npm:pg");
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const kinds = await client.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'steps_kind_check'`,
      );
      assert(kinds.rows[0].def.includes("'compaction'"), "compaction kind not permitted");

      const col = await client.query(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'agents' AND table_name = 'sessions'
           AND column_name = 'activated_tools'`,
      );
      assertEquals(col.rows.length, 1);
    } finally {
      await client.end();
    }
  },
});
