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

// Regression: the task row is the AUTHORITATIVE destination. The APPROVED_REPLY
// turn carries no channel metadata, so the model reconstructs channel/thread
// from conversation text — a wrong (or injected) value must NOT redirect the
// reply away from the original requester's thread.
Deno.test("a model-supplied channel/thread that differs from the task row is overridden", async () => {
  const posts: Array<{ channelId: string; threadTs?: string }> = [];
  const sql = async (q: string, _p: unknown[] = []) => {
    if (q.includes("SELECT")) {
      return { rows: [{ session_id: "s1", claw_session_id: "c1", claw_event_cursor: 3, slack_channel_id: "C-REAL", slack_thread_ts: "9.9", status: "forwarded", brief: "b" }] };
    }
    return { rows: [] };
  };
  await postReplyCore(sql, "s1", { channelId: "C-WRONG", threadTs: "0.1", text: "the answer" },
    async (opts) => { posts.push(opts as { channelId: string; threadTs?: string }); return { id: "ts1", raw: {} }; });
  assertEquals(posts.length, 1);
  assertEquals(posts[0].channelId, "C-REAL");
  assertEquals(posts[0].threadTs, "9.9");
});
