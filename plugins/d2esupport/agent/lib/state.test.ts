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
        session_id: p[0], claw_session_id: p[1], slack_channel_id: p[2],
        slack_thread_ts: p[3], status: p[4], brief: p[5],
      });
      return { rows: [] };
    },
  };
}

Deno.test("upsert then read round-trips", async () => {
  const { sql } = memSql();
  await upsertTask(sql, {
    sessionId: "s1", clawSessionId: null, slackChannelId: "C1",
    slackThreadTs: "111.222", status: "open", brief: "b",
  });
  const t = await readTask(sql, "s1");
  assertEquals(t?.slackChannelId, "C1");
  assertEquals(t?.status, "open");
});

Deno.test("prompt state names the slack thread and status", async () => {
  const s = renderStateForPrompt({
    sessionId: "s1", clawSessionId: "c1", slackChannelId: "C1",
    slackThreadTs: "111.222", status: "forwarded", brief: "b",
  });
  assertEquals(s.includes("C1"), true);
  assertEquals(s.includes("forwarded"), true);
});
