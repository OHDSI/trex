import { assert, assertEquals } from "jsr:@std/assert";
import { Pool } from "pg";
import {
  _deleteSubscriptions,
  _insertSubscriptions,
  clearAllSubscriptions,
  hasSubscribers,
  lookupSubscription,
} from "./subscriptions.ts";

// sanitizeResources/sanitizeOps disabled: subscriptions.ts uses the shared
// module-level `pool` from db.ts (a long-lived singleton meant to outlive any
// single test, same as the real server process) rather than a per-test pool,
// so Deno's leak detector otherwise flags its open connection as a leak.
Deno.test({
  name: "subscription rows inserted, indexed, and cleaned up",
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
      await pool.query(
        "CREATE TABLE IF NOT EXISTS public.rt_sub_test(id int primary key)",
      );
      const ch: any = {
        topic: "realtime:t",
        subTopic: "t",
        socket: {
          claims: { role: "authenticated", sub: "u1", exp: 9999999999 },
        },
        bindings: [{
          id: 1,
          event: "INSERT",
          schema: "public",
          table: "rt_sub_test",
        }],
        subscriptionIds: [],
      };
      await _insertSubscriptions(ch);
      assertEquals(ch.subscriptionIds.length, 1);
      assert(hasSubscribers("public", "rt_sub_test"));
      assert(lookupSubscription(ch.subscriptionIds[0]) !== undefined);
      const rows = await pool.query(
        "SELECT count(*)::int AS n FROM realtime.subscription WHERE subscription_id = $1",
        [ch.subscriptionIds[0]],
      );
      assertEquals(rows.rows[0].n, 1);
      await _deleteSubscriptions(ch);
      assert(!hasSubscribers("public", "rt_sub_test"));
      await clearAllSubscriptions();
    } finally {
      await pool.query("DROP TABLE IF EXISTS public.rt_sub_test");
      await pool.end();
    }
  },
});

// A later binding failing must not orphan the earlier rows/index entries: the
// whole per-channel insert is atomic. See _handleJoin — on a join-hook throw it
// discards the channel WITHOUT calling _deleteSubscriptions, so any partially
// inserted row here would leak.
Deno.test({
  name:
    "_insertSubscriptions rolls back fully when a later binding is rejected",
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
      await pool.query(
        "CREATE TABLE IF NOT EXISTS public.rt_sub_test(id int primary key)",
      );
      const ch: any = {
        topic: "realtime:t",
        subTopic: "t",
        socket: {
          claims: { role: "authenticated", sub: "u1", exp: 9999999999 },
        },
        bindings: [
          // first: valid concrete-table binding, no filter -> would insert fine
          { id: 1, event: "INSERT", schema: "public", table: "rt_sub_test" },
          // second: filter on a non-existent column -> tr_check_filters rejects it
          {
            id: 2,
            event: "INSERT",
            schema: "public",
            table: "rt_sub_test",
            filter: "nonexistent_col=eq.1",
          },
        ],
        subscriptionIds: [],
      };
      let threw = false;
      try {
        await _insertSubscriptions(ch);
      } catch {
        threw = true;
      }
      assert(
        threw,
        "_insertSubscriptions should throw on the rejected binding",
      );
      // no rows survived (transaction rolled back)
      const rows = await pool.query(
        "SELECT count(*)::int AS n FROM realtime.subscription WHERE entity = 'public.rt_sub_test'::regclass",
      );
      assertEquals(rows.rows[0].n, 0);
      // no in-memory leftovers
      assertEquals(ch.subscriptionIds.length, 0);
      assert(!hasSubscribers("public", "rt_sub_test"));
    } finally {
      await pool.query("DROP TABLE IF EXISTS public.rt_sub_test");
      await pool.end();
    }
  },
});

// Schema-wide postgres_changes (table "*") isn't supported in this version:
// realtime.subscription.entity is regclass (a concrete table). Such bindings are
// skipped (no row, no index entry) and the join must still succeed.
Deno.test({
  name: "_insertSubscriptions skips wildcard-table bindings without throwing",
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
      const ch: any = {
        topic: "realtime:t",
        subTopic: "t",
        socket: {
          claims: { role: "authenticated", sub: "u1", exp: 9999999999 },
        },
        bindings: [{ id: 1, event: "*", schema: "public", table: "*" }],
        subscriptionIds: [],
      };
      // must not throw
      await _insertSubscriptions(ch);
      assertEquals(ch.subscriptionIds.length, 0);
      assert(!hasSubscribers("public", "anything"));
      assert(!hasSubscribers("public", "*"));
    } finally {
      await pool.end();
    }
  },
});
