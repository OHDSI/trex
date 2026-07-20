import { assertEquals } from "jsr:@std/assert";
import { readSupportTask, upsertSupportTask } from "./support-state.ts";

function memSql() {
  const store = new Map<string, Record<string, unknown>>();
  return async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) {
      const r = store.get(String(p[0]));
      return { rows: r ? [r] : [] };
    }
    store.set(String(p[0]), {
      thread_id: p[0], support_session_id: p[1], kind: p[2], brief: p[3],
      proposed_reply: p[4], github_logins: p[5], status: p[6],
    });
    return { rows: [] };
  };
}

Deno.test("upsert then read round-trips including logins json", async () => {
  const sql = memSql();
  await upsertSupportTask(sql, {
    threadId: "T1", supportSessionId: "s1", kind: "bug", brief: "b",
    proposedReply: "draft", githubLogins: ["alice"], status: "awaiting_review",
  });
  const t = await readSupportTask(sql, "T1");
  assertEquals(t?.supportSessionId, "s1");
  assertEquals(t?.githubLogins, ["alice"]);
  assertEquals(t?.status, "awaiting_review");
});

Deno.test("missing thread reads null", async () => {
  assertEquals(await readSupportTask(memSql(), "nope"), null);
});
