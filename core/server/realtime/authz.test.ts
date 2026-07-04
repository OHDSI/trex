import { assertEquals } from "jsr:@std/assert";
import { Pool } from "pg";
import { checkAuthorization } from "./authz.ts";
import type { AccessTokenClaims } from "../auth/jwt.ts";

// DB-backed: private-channel read/write authz follows RLS policies on
// realtime.messages, keyed on realtime.topic(). Requires V2__realtime_authz_probe
// (realtime._authz_probe) applied to the target DB. Skips cleanly without DATABASE_URL.
// sanitizeResources/sanitizeOps disabled: checkAuthorization uses the shared
// module-level pool from db.ts, which we intentionally leave open (mirrors
// subscriptions.test.ts / walrus.test.ts).
Deno.test({
  name: "private topic authz follows realtime.messages RLS policies",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    console.warn("skip: DATABASE_URL not set");
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`
      ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS rt_read_room1 ON realtime.messages;
      DROP POLICY IF EXISTS rt_write_room2 ON realtime.messages;
      CREATE POLICY rt_read_room1 ON realtime.messages FOR SELECT TO authenticated
        USING (realtime.topic() = 'room1');
      CREATE POLICY rt_write_room2 ON realtime.messages FOR INSERT TO authenticated
        WITH CHECK (realtime.topic() = 'room2');`);

    const claims = { role: "authenticated", sub: "u1", exp: 9999999999 } as unknown as AccessTokenClaims;

    // room1: SELECT policy matches → read; no INSERT policy matches → no write.
    const room1 = await checkAuthorization(claims, "room1");
    assertEquals(room1.read, true);
    assertEquals(room1.write, false);

    // other-room: no policy matches → neither read nor write.
    const other = await checkAuthorization(claims, "other-room");
    assertEquals(other.read, false);
    assertEquals(other.write, false);

    // room2: INSERT policy matches → write; no SELECT policy matches → no read.
    const room2 = await checkAuthorization(claims, "room2");
    assertEquals(room2.write, true);
    assertEquals(room2.read, false);
  } finally {
    await pool.query(`
      DROP POLICY IF EXISTS rt_read_room1 ON realtime.messages;
      DROP POLICY IF EXISTS rt_write_room2 ON realtime.messages;`).catch(() => {});
    await pool.end();
  }
  },
});

// Pure (no DB): the role allowlist short-circuits BEFORE getPool()/SET ROLE, so an
// unexpected/NULL role can never revert current_user to the privileged pool role.
// Deny-all with no DATABASE_URL needed.
Deno.test("checkAuthorization fails closed on unexpected/missing role", async () => {
  const missing = await checkAuthorization({} as unknown as AccessTokenClaims, "room1");
  assertEquals(missing, { read: false, write: false });

  const privileged = await checkAuthorization(
    { role: "postgres", sub: "u1", exp: 9999999999 } as unknown as AccessTokenClaims,
    "room1",
  );
  assertEquals(privileged, { read: false, write: false });

  const allowed = new Set(["authenticated", "anon", "service_role"]);
  assertEquals(allowed.has("postgres"), false);
});
