import { assertEquals } from "jsr:@std/assert";
import { postReplyCore } from "./postSlackReply.ts";

Deno.test("posts each chunk into the thread and marks the task answered", async () => {
  const posts: unknown[] = [];
  const updates: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) {
      return { rows: [{ session_id: "s1", claw_session_id: "c1", claw_event_cursor: 3, slack_channel_id: "C1", slack_thread_ts: "1.2", status: "forwarded", brief: "b" }] };
    }
    updates.push(p);
    return { rows: [] };
  };
  const r = await postReplyCore(sql, "s1", { channelId: "C1", threadTs: "1.2", text: "the answer" },
    async (opts) => { posts.push(opts); return { id: "ts1", raw: {} }; });
  assertEquals(r.posted, true);
  assertEquals(posts.length, 1);
  assertEquals((posts[0] as { threadTs?: string }).threadTs, "1.2");
  assertEquals(updates.length, 1);
});
