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
  runTurn: (args: ClawTurnArgs) => Promise<{ clawSessionId: string; replyText: string }> = runClawTurn,
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
  const { clawSessionId, replyText } = await runTurn({
    clawSessionId: prior?.clawSessionId ?? null,
    message,
    userId: ctx.userId,
  });
  await upsertTask(sql, {
    sessionId: ctx.sessionId,
    clawSessionId,
    slackChannelId: input.slackChannelId,
    slackThreadTs: input.slackThreadTs,
    status: "forwarded",
    brief: input.brief,
  });
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
