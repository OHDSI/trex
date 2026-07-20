// Hand the triaged task to claw and record the linkage. Blocking: the claw turn
// includes the devx investigation and dev-channel notification (minutes).
import { defineTool } from "eve/tools";
import { runClawTurn, type ClawTurnArgs } from "../lib/claw-session.ts";
import { readTask, upsertTask, type QueryFn } from "../lib/state.ts";
import { supportUserId } from "../lib/devx-api.ts";

interface Input {
  kind: "bug" | "feature" | "data-issue";
  brief: string;
  slackChannelId: string;
  slackThreadTs: string;
  slackUserId: string;
}

export async function forwardCore(
  sql: QueryFn,
  ctx: { sessionId: string; userId: string },
  input: Input,
  runTurn: (args: ClawTurnArgs) => Promise<{ clawSessionId: string; replyText: string; nextCursor: number }> = runClawTurn,
): Promise<{ reply: string }> {
  const prior = await readTask(sql, ctx.sessionId);
  const message = [
    "SUPPORT_TASK",
    `support_session: ${ctx.sessionId}`,
    `kind: ${input.kind}`,
    `slack_user: ${input.slackUserId}`,
    "brief:",
    input.brief,
  ].join("\n");
  let clawSessionId: string;
  let replyText: string;
  let nextCursor: number;
  try {
    ({ clawSessionId, replyText, nextCursor } = await runTurn({
      clawSessionId: prior?.clawSessionId ?? null,
      message,
      userId: ctx.userId,
      startCursor: prior?.clawEventCursor ?? 0,
    }));
  } catch (turnErr) {
    // Best-effort: record the failed attempt so a later turn (or a human)
    // can see the task never made it, rather than the caller's throw being
    // the only trace. Keeps the prior clawSessionId/cursor if there was one
    // — a failed follow-up shouldn't forget the session it was following up.
    try {
      await upsertTask(sql, {
        sessionId: ctx.sessionId,
        clawSessionId: prior?.clawSessionId ?? null,
        clawEventCursor: prior?.clawEventCursor ?? 0,
        slackChannelId: input.slackChannelId,
        slackThreadTs: input.slackThreadTs,
        status: "forward_failed",
        brief: input.brief,
      });
    } catch (writeErr) {
      console.error(`forwardToClaw: failed to record forward_failed state for session ${ctx.sessionId}`, writeErr);
    }
    throw turnErr;
  }
  const taskState = {
    sessionId: ctx.sessionId,
    clawSessionId,
    clawEventCursor: nextCursor,
    slackChannelId: input.slackChannelId,
    slackThreadTs: input.slackThreadTs,
    status: "forwarded" as const,
    brief: input.brief,
  };
  try {
    await upsertTask(sql, taskState);
  } catch (firstErr) {
    try {
      await upsertTask(sql, taskState);
    } catch (secondErr) {
      console.error(
        `forwardToClaw: state write failed twice for claw session ${clawSessionId}`,
        firstErr,
        secondErr,
      );
      throw new Error(
        `forwardToClaw: task filed (claw session ${clawSessionId}) but state write failed: ${secondErr}`,
      );
    }
  }
  return { reply: replyText };
}

export default defineTool({
  description:
    "File the triaged data2evidence task with the development team (or relay a follow-up to the " +
    "same task). Call ONLY with a concrete brief: what happens, where in d2e, what was expected, " +
    "plus error text if any. Takes the slack ids from the [slack] context line. Blocking — it " +
    "returns the team's acknowledgement, which you summarize for the user.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["bug", "feature", "data-issue"], description: "Task classification." },
      brief: { type: "string", description: "Concrete multi-line task brief." },
      slackChannelId: { type: "string", description: "channel= value from the [slack] context line." },
      slackThreadTs: { type: "string", description: "thread= value from the [slack] context line." },
      slackUserId: { type: "string", description: "user= value from the [slack] context line." },
    },
    required: ["kind", "brief", "slackChannelId", "slackThreadTs", "slackUserId"],
  },
  execute: (input, ctx) => {
    if (!ctx?.sql) throw new Error("forwardToClaw: ctx.sql unavailable");
    const userId = ctx.userId?.trim() || supportUserId();
    if (!userId) throw new Error("forwardToClaw: no user id (set D2ESUPPORT_USER_ID)");
    return forwardCore(ctx.sql, { sessionId: ctx.sessionId, userId }, input as Input);
  },
});
