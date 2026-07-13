import { assert } from "jsr:@std/assert";
import { Pool } from "pg";

// Verifies the vendored WALRUS schema OBJECTS exist. Assumes V1 was already
// applied to the target DB (the trex stack applies it via applyRealtimeMigrations;
// for this standalone test, apply V1 with psql first). Skips when DATABASE_URL is
// unset, mirroring the skip-if-unavailable guard used elsewhere in the suite.
Deno.test("walrus schema objects exist after migration", async () => {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    console.warn("skip: DATABASE_URL not set");
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    const fn = await pool.query(
      "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='realtime' AND p.proname='apply_rls'",
    );
    assert(fn.rowCount === 1, "realtime.apply_rls missing");

    const tbl = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema='realtime' AND table_name IN ('subscription','messages')",
    );
    assert((tbl.rowCount ?? 0) === 2, "realtime tables missing");

    const pub = await pool.query(
      "SELECT pubname FROM pg_publication WHERE pubname IN ('supabase_realtime','trex_realtime_messages')",
    );
    assert((pub.rowCount ?? 0) === 2, "publications missing");
  } finally {
    await pool.end();
  }
});
