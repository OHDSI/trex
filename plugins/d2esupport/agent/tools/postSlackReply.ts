// Explicit reply delivery: claw triggers the APPROVED_REPLY turn via the session
// API, and channel delivery only rides channel-initiated turns (delivery.ts is
// per-turn) — so the approved answer must be posted with the bot token directly.
import { defineTool } from "eve/tools";
import { postSlackMessage, type SlackPostedMessage, splitSlackMessageText } from "eve/slack/api";
import { readTask, upsertTask, type QueryFn } from "../lib/state.ts";

interface Input { channelId: string; threadTs: string; text: string }

type PostFn = (opts: { channelId: string; threadTs?: string; text?: string }) => Promise<SlackPostedMessage>;

export async function postReplyCore(
  sql: QueryFn,
  sessionId: string,
  input: Input,
  post: PostFn = (opts) => postSlackMessage(opts),
): Promise<{ posted: boolean }> {
  if (!input.text?.trim()) throw new Error("postSlackReply: text is required");
  // The task row is the AUTHORITATIVE destination — never the model-typed
  // input: the APPROVED_REPLY turn arrives via the native session API with no
  // channel metadata, so input.channelId/threadTs are reconstructed by the
  // model from conversation text (attacker-adjacent in support tickets). Fall
  // back to input only when no task row exists.
  const task = await readTask(sql, sessionId);
  const channelId = task?.slackChannelId ?? input.channelId;
  const threadTs = task?.slackThreadTs ?? input.threadTs;
  if (task && (input.channelId !== channelId || input.threadTs !== threadTs)) {
    console.warn(
      `postSlackReply: model-supplied target ${input.channelId}:${input.threadTs} ` +
        `differs from the task row ${channelId}:${threadTs} — using the task row`,
    );
  }
  for (const chunk of splitSlackMessageText(input.text)) {
    await post({ channelId, threadTs, text: chunk });
  }
  if (task) await upsertTask(sql, { ...task, status: "answered" });
  return { posted: true };
}

export default defineTool({
  description:
    "Post the team's APPROVED_REPLY text into the user's Slack thread, verbatim. Use the " +
    "channel/thread from the Task state note. Only for delivering the approved answer — " +
    "normal conversation replies are delivered automatically.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "Slack channel id of the original request." },
      threadTs: { type: "string", description: "Thread timestamp of the original request." },
      text: { type: "string", description: "The approved reply text, verbatim." },
    },
    required: ["channelId", "threadTs", "text"],
  },
  execute: (input, ctx) => {
    if (!ctx?.sql) throw new Error("postSlackReply: ctx.sql unavailable");
    return postReplyCore(ctx.sql, ctx.sessionId, input as Input);
  },
});
