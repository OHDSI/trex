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
    discordUserIds: ["D1"], unmappedLogins: ["bob"], githubLogins: ["alice", "bob"], threadName: "Support: export bug",
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
  assertEquals((writes[0] as unknown[])[5], '["alice","bob"]');
});

Deno.test("overlong summary/nextSteps are truncated individually so the unmapped-logins hint survives", async () => {
  const posts: Record<string, unknown>[] = [];
  const sql = async () => ({ rows: [] });
  const longSummary = "S".repeat(1500);
  const longNextSteps = "N".repeat(1500);
  await postDevSummaryCore(sql, {
    supportSessionId: "s1", kind: "bug", brief: "b", summary: longSummary,
    nextSteps: longNextSteps, proposedReply: "We are on it",
    discordUserIds: ["D1"], unmappedLogins: ["carol"], githubLogins: ["carol"], threadName: "Support: export bug",
  }, {
    devChannelId: "DEV",
    post: async (opts) => { posts.push(opts as Record<string, unknown>); return { id: `m${posts.length}` }; },
    startThread: async () => ({ threadId: "T1" }),
  });
  const content = String((posts[0] as { content?: string }).content);
  assertEquals(content.length <= 2000, true);
  assertEquals(content.includes("Unmapped GitHub logins"), true);
  assertEquals(content.includes("carol"), true);
});
