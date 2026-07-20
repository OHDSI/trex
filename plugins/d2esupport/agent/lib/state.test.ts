import { assertEquals } from "jsr:@std/assert";
import { readTask, renderStateForPrompt, upsertTask } from "./state.ts";

function memSql() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    sql: async (q: string, p: unknown[] = []) => {
      if (q.includes("SELECT")) {
        const r = store.get(String(p[0]));
        return { rows: r ? [r] : [] };
      }
      store.set(String(p[0]), {
        session_id: p[0], claw_session_id: p[1], claw_event_cursor: p[2], slack_channel_id: p[3],
        slack_thread_ts: p[4], status: p[5], brief: p[6],
      });
      return { rows: [] };
    },
  };
}

Deno.test("upsert then read round-trips", async () => {
  const { sql } = memSql();
  await upsertTask(sql, {
    sessionId: "s1", clawSessionId: null, clawEventCursor: 0, slackChannelId: "C1",
    slackThreadTs: "111.222", status: "open", brief: "b",
  });
  const t = await readTask(sql, "s1");
  assertEquals(t?.slackChannelId, "C1");
  assertEquals(t?.status, "open");
  assertEquals(t?.clawEventCursor, 0);
});

Deno.test("upsert then read round-trips the claw event cursor", async () => {
  const { sql } = memSql();
  await upsertTask(sql, {
    sessionId: "s1", clawSessionId: "c1", clawEventCursor: 7, slackChannelId: "C1",
    slackThreadTs: "111.222", status: "forwarded", brief: "b",
  });
  const t = await readTask(sql, "s1");
  assertEquals(t?.clawEventCursor, 7);
});

Deno.test("prompt state names the slack thread and status", async () => {
  const s = renderStateForPrompt({
    sessionId: "s1", clawSessionId: "c1", clawEventCursor: 3, slackChannelId: "C1",
    slackThreadTs: "111.222", status: "forwarded", brief: "b",
  });
  assertEquals(s.includes("C1"), true);
  assertEquals(s.includes("forwarded"), true);
});
