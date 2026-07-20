import { assertEquals, assertRejects } from "jsr:@std/assert";
import { forwardCore } from "./forwardToClaw.ts";
import { ClawTurnError } from "../lib/claw-session.ts";

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
    assertEquals(args.startCursor, 0);
    assertEquals(args.message.startsWith("SUPPORT_TASK"), true);
    assertEquals(args.message.includes("support_session: sess-1"), true);
    assertEquals(args.message.includes("kind: bug"), true);
    assertEquals(args.message.includes("Export fails with 500"), true);
    return { clawSessionId: "claw-1", replyText: "ack", nextCursor: 2 };
  });
  assertEquals(r.reply, "ack");
  assertEquals(writes.length, 1);
});

Deno.test("forwardCore continues an existing claw session on follow-ups, resuming from the saved cursor", async () => {
  const sql = async (q: string) =>
    q.includes("SELECT")
      ? { rows: [{ session_id: "sess-1", claw_session_id: "claw-7", claw_event_cursor: 4, slack_channel_id: "C1", slack_thread_ts: "1.2", status: "forwarded", brief: "b" }] }
      : { rows: [] };
  const r = await forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
    kind: "bug", brief: "more detail", slackChannelId: "C1", slackThreadTs: "1.2", slackUserId: "U1",
  }, async (args) => {
    assertEquals(args.clawSessionId, "claw-7");
    assertEquals(args.startCursor, 4);
    return { clawSessionId: "claw-7", replyText: "noted", nextCursor: 6 };
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
      }, async () => ({ clawSessionId: "claw-1", replyText: "ack", nextCursor: 2 })),
    Error,
    "claw-1",
  );
});

Deno.test("forwardCore records forward_failed state when runTurn throws, then rethrows", async () => {
  const writes: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) return { rows: [] };
    writes.push(p);
    return { rows: [] };
  };
  await assertRejects(
    () =>
      forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
        kind: "bug",
        brief: "Export fails with 500",
        slackChannelId: "C1",
        slackThreadTs: "1.2",
        slackUserId: "U1",
      }, async () => {
        throw new Error("claw session create failed: 500");
      }),
    Error,
    "claw session create failed",
  );
  assertEquals(writes.length, 1);
  // Positional params match state.ts's upsertTask column order: session_id,
  // claw_session_id, claw_event_cursor, slack_channel_id, slack_thread_ts,
  // status, brief.
  assertEquals((writes[0] as unknown[])[0], "sess-1");
  assertEquals((writes[0] as unknown[])[3], "C1");
  assertEquals((writes[0] as unknown[])[5], "forward_failed");
});

Deno.test("forwardCore keeps the prior claw session id when a follow-up forward fails", async () => {
  const writes: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) {
      return { rows: [{ session_id: "sess-1", claw_session_id: "claw-7", claw_event_cursor: 4, slack_channel_id: "C1", slack_thread_ts: "1.2", status: "forwarded", brief: "b" }] };
    }
    writes.push(p);
    return { rows: [] };
  };
  await assertRejects(
    () =>
      forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
        kind: "bug", brief: "more detail", slackChannelId: "C1", slackThreadTs: "1.2", slackUserId: "U1",
      }, async () => {
        throw new Error("claw stream failed: 502");
      }),
    Error,
  );
  assertEquals(writes.length, 1);
  const w = writes[0] as unknown[];
  assertEquals(w[1], "claw-7");
  assertEquals(w[2], 4);
  assertEquals(w[5], "forward_failed");
});

Deno.test("forwardCore persists the cursor past a live turn.failed, not the stale prior cursor", async () => {
  const writes: unknown[] = [];
  const sql = async (q: string, p: unknown[] = []) => {
    if (q.includes("SELECT")) {
      return { rows: [{ session_id: "sess-1", claw_session_id: "claw-7", claw_event_cursor: 4, slack_channel_id: "C1", slack_thread_ts: "1.2", status: "forwarded", brief: "b" }] };
    }
    writes.push(p);
    return { rows: [] };
  };
  await assertRejects(
    () =>
      forwardCore(sql, { sessionId: "sess-1", userId: "u1" }, {
        kind: "bug", brief: "more detail", slackChannelId: "C1", slackThreadTs: "1.2", slackUserId: "U1",
      }, async () => {
        // Simulates runClawTurn observing 3 new lines (including the
        // terminal turn.failed) past the saved cursor of 4.
        throw new ClawTurnError("claw turn failed: boom", 7, "claw-7");
      }),
    ClawTurnError,
  );
  assertEquals(writes.length, 1);
  const w = writes[0] as unknown[];
  // Positional params match state.ts's upsertTask column order: session_id,
  // claw_session_id, claw_event_cursor, ...
  assertEquals(w[1], "claw-7");
  assertEquals(w[2], 7);
  assertEquals(w[5], "forward_failed");
});
