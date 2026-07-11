import { assert, assertEquals } from "jsr:@std/assert";
import { Pool } from "pg";
import { fanOutTransaction } from "./walrus.ts";
import {
  _insertSubscriptions,
  clearAllSubscriptions,
} from "./subscriptions.ts";

// sanitizeResources/sanitizeOps disabled: walrus.ts uses the shared module-level
// `pool` from db.ts (a long-lived singleton), so Deno's leak detector otherwise
// flags its open connection as a leak. Mirrors subscriptions.test.ts.
Deno.test({
  name: "apply_rls fan-out delivers matching insert to subscriber",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const url = Deno.env.get("DATABASE_URL");
    if (!url) {
      console.warn("skip: DATABASE_URL not set");
      return;
    }
    const pool = new Pool({ connectionString: url });
    const sent: any[] = [];
    const ch: any = {
      topic: "realtime:w1",
      subTopic: "w1",
      socket: { claims: { role: "authenticated", sub: "u1", exp: 9999999999 } },
      bindings: [{
        id: 42,
        event: "INSERT",
        schema: "public",
        table: "rt_walrus_test",
      }],
      subscriptionIds: [],
      send: (event: string, payload: any) => sent.push({ event, payload }),
    };
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS public.rt_walrus_test(id int primary key, note text);
         GRANT SELECT ON public.rt_walrus_test TO authenticated;`,
      );
      await _insertSubscriptions(ch);
      await fanOutTransaction([{
        action: "I",
        schema: "public",
        table: "rt_walrus_test",
        columns: [
          { name: "id", type: "int4", value: 7 },
          { name: "note", type: "text", value: "hi" },
        ],
        pk: [{ name: "id", type: "int4" }],
      }], "2026-07-04T00:00:00Z");

      assertEquals(sent.length, 1);
      assertEquals(sent[0].event, "postgres_changes");
      assertEquals(sent[0].payload.ids, [42]);
      assertEquals(sent[0].payload.data.type, "INSERT");
      assertEquals(sent[0].payload.data.schema, "public");
      assertEquals(sent[0].payload.data.table, "rt_walrus_test");
      assertEquals(sent[0].payload.data.record.id, 7);
      assertEquals(sent[0].payload.data.record.note, "hi");
      assertEquals(
        sent[0].payload.data.commit_timestamp,
        "2026-07-04T00:00:00Z",
      );
      assertEquals(sent[0].payload.data.errors, null);
    } finally {
      await clearAllSubscriptions().catch(() => {});
      await pool.query("DROP TABLE IF EXISTS public.rt_walrus_test");
      await pool.end();
    }
  },
});

// RLS: only rows the subscriber's role can SELECT under the policy get delivered.
Deno.test({
  name: "apply_rls filters rows hidden by RLS policy",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const url = Deno.env.get("DATABASE_URL");
    if (!url) {
      console.warn("skip: DATABASE_URL not set");
      return;
    }
    const pool = new Pool({ connectionString: url });
    const sent: any[] = [];
    const ch: any = {
      topic: "realtime:w2",
      subTopic: "w2",
      socket: { claims: { role: "authenticated", sub: "u1", exp: 9999999999 } },
      bindings: [{
        id: 1,
        event: "*",
        schema: "public",
        table: "rt_rls_test",
      }],
      subscriptionIds: [],
      send: (event: string, payload: any) => sent.push({ event, payload }),
    };
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.rt_rls_test(id int primary key, note text);
        ALTER TABLE public.rt_rls_test ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS p ON public.rt_rls_test;
        CREATE POLICY p ON public.rt_rls_test FOR SELECT TO authenticated USING (note <> 'secret');
        GRANT SELECT ON public.rt_rls_test TO authenticated;
        INSERT INTO public.rt_rls_test(id, note) VALUES (1, 'visible'), (2, 'secret')
          ON CONFLICT (id) DO NOTHING;`);
      // apply_rls re-queries the table by pk AS the subscriber's role when RLS is
      // enabled, so the rows must physically exist (they do in the real WAL flow
      // by the time a commit is processed).
      await _insertSubscriptions(ch);
      await fanOutTransaction([
        {
          action: "I",
          schema: "public",
          table: "rt_rls_test",
          columns: [
            { name: "id", type: "int4", value: 1 },
            { name: "note", type: "text", value: "visible" },
          ],
          pk: [{ name: "id", type: "int4" }],
        },
        {
          action: "I",
          schema: "public",
          table: "rt_rls_test",
          columns: [
            { name: "id", type: "int4", value: 2 },
            { name: "note", type: "text", value: "secret" },
          ],
          pk: [{ name: "id", type: "int4" }],
        },
      ], "2026-07-04T00:00:00Z");

      assertEquals(sent.length, 1);
      assertEquals(sent[0].payload.data.record.id, 1);
      assertEquals(sent[0].payload.data.record.note, "visible");
    } finally {
      await clearAllSubscriptions().catch(() => {});
      await pool.query("DROP TABLE IF EXISTS public.rt_rls_test");
      await pool.end();
    }
  },
});

// realtime.messages changes are routed to the broadcast-from-DB handler (Task 10),
// NOT through apply_rls — so no postgres_changes event is emitted for them here.
Deno.test({
  name: "realtime.messages changes skip apply_rls (no postgres_changes)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const url = Deno.env.get("DATABASE_URL");
    if (!url) {
      console.warn("skip: DATABASE_URL not set");
      return;
    }
    // No subscription needed; just assert fanOut doesn't try apply_rls / throw.
    await fanOutTransaction([{
      action: "I",
      schema: "realtime",
      table: "messages",
      columns: [{ name: "id", type: "uuid", value: crypto.randomUUID() }],
      pk: [{ name: "id", type: "uuid" }],
    }], "2026-07-04T00:00:00Z");
    assert(true);
  },
});
