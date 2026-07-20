import { assertEquals } from "jsr:@std/assert";
import { postDevSummaryCore } from "./postDevSummary.ts";

Deno.test("posts summary with mentions, opens thread, seeds it, records the task", async () => {
  const posts: Record<string, unknown>[] = [];
  const writes: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (!q.includes("SELECT")) writes.push(p);
    return { rows: [] };
  };
  const r = await postDevSummaryCore(sql, {
    supportSessionId: "s1", kind: "bug", brief: "b", summary: "Export 500s",
    nextSteps: "Check the exporter", proposedReply: "We are on it",
    discordUserIds: ["D1"], unmappedLogins: ["bob"], threadName: "Support: export bug",
  }, {
    devChannelId: "DEV",
    post: async (opts) => { posts.push(opts as Record<string, unknown>); return { id: `m${posts.length}` }; },
    startThread: async (opts) => {
      assertEquals(opts.messageId, "m1");
      return { threadId: "T1" };
    },
  });
  assertEquals(r.threadId, "T1");
  assertEquals(posts.length, 2, "summary in channel + proposed reply in thread");
  assertEquals(String((posts[0] as { content?: string }).content).includes("<@D1>"), true);
  assertEquals(String((posts[0] as { content?: string }).content).includes("bob"), true);
  assertEquals(writes.length, 1);
});
