import { assertEquals, assertRejects } from "jsr:@std/assert";
import { forwardCore } from "./forwardToClaw.ts";

Deno.test("forwardCore builds the SUPPORT_TASK message and records state", async () => {
  const writes: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) return { rows: [] };
    writes.push(p);
    return { rows: [] };
  };
  const r = await forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
    kind: "bug",
    brief: "Export fails with 500",
    slackChannelId: "C1",
    slackThreadTs: "1.2",
    slackUserId: "U1",
  }, async (args) => {
    assertEquals(args.clawSessionId, null);
    assertEquals(args.message.startsWith("SUPPORT_TASK"), true);
    assertEquals(args.message.includes("support_session: sess-1"), true);
    assertEquals(args.message.includes("kind: bug"), true);
    assertEquals(args.message.includes("Export fails with 500"), true);
    return { clawSessionId: "claw-1", replyText: "ack" };
  });
  assertEquals(r.reply, "ack");
  assertEquals(writes.length, 1);
});

Deno.test("forwardCore continues an existing claw session on follow-ups", async () => {
  const sql = async (q: string) =>
    q.includes("SELECT")
      ? { rows: [{ session_id: "sess-1", claw_session_id: "claw-7", slack_channel_id: "C1", slack_thread_ts: "1.2", status: "forwarded", brief: "b" }] }
      : { rows: [] };
  const r = await forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
    kind: "bug", brief: "more detail", slackChannelId: "C1", slackThreadTs: "1.2", slackUserId: "U1",
  }, async (args) => {
    assertEquals(args.clawSessionId, "claw-7");
    return { clawSessionId: "claw-7", replyText: "noted" };
  });
  assertEquals(r.reply, "noted");
});

Deno.test("forwardCore surfaces the claw session id when the state write fails", async () => {
  const sql = async (q: string) => {
    if (q.includes("SELECT")) return { rows: [] };
    throw new Error("db unavailable");
  };
  await assertRejects(
    () =>
      forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
        kind: "bug",
        brief: "Export fails with 500",
        slackChannelId: "C1",
        slackThreadTs: "1.2",
        slackUserId: "U1",
      }, async () => ({ clawSessionId: "claw-1", replyText: "ack" })),
    Error,
    "claw-1",
  );
});
