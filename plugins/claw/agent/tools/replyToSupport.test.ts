import { assertEquals } from "jsr:@std/assert";
import { replyCore } from "./replyToSupport.ts";

Deno.test("replyCore sends the approved text and marks the task sent", async () => {
  const sent: unknown[] = [];
  const writes: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) {
      return { rows: [{ thread_id: "T1", support_session_id: "s1", kind: "bug", brief: "b", proposed_reply: "draft", github_logins: "[]", status: "awaiting_review" }] };
    }
    writes.push(p);
    return { rows: [] };
  };
  const r = await replyCore(sql, { channelId: "T1", finalReply: "final answer" }, "u1",
    async (args) => { sent.push(args); });
  assertEquals(r.sent, true);
  assertEquals((sent[0] as { supportSessionId?: string }).supportSessionId, "s1");
  assertEquals((sent[0] as { finalReply?: string }).finalReply, "final answer");
  assertEquals(writes.length, 1);
});

Deno.test("replyCore throws when the thread has no support task", async () => {
  const sql = async () => ({ rows: [] });
  let threw = false;
  try {
    await replyCore(sql, { channelId: "T404", finalReply: "x" }, "u1", async () => {});
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
