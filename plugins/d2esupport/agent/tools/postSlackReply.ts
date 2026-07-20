// Explicit reply delivery: claw triggers the APPROVED_REPLY turn via the session
// API, and channel delivery only rides channel-initiated turns (delivery.ts is
// per-turn) — so the approved answer must be posted with the bot token directly.
import { defineTool } from "eve/tools";
import { postSlackMessage, splitSlackMessageText } from "eve/slack/api";
import { readTask, upsertTask, type QueryFn } from "../lib/state.ts";

interface Input { channelId: string; threadTs: string; text: string }

type PostFn = (opts: { channelId: string; threadTs?: string; text?: string }) => Promise<{ id: string }>;

export async function postReplyCore(
  sql: QueryFn,
  sessionId: string,
  input: Input,
  post: PostFn = (opts) => postSlackMessage(opts),
): Promise<{ posted: boolean }> {
  if (!input.text?.trim()) throw new Error("postSlackReply: text is required");
  for (const chunk of splitSlackMessageText(input.text)) {
    await post({ channelId: input.channelId, threadTs: input.threadTs, text: chunk });
  }
  const task = await readTask(sql, sessionId);
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
