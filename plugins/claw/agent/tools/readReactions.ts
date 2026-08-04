// readReactions — read the emoji reactions on a message (which emoji, how
// many, who). Useful for lightweight team signals: checking how an update or
// plan landed (👍/👎), or counting an informal emoji vote before a gate.
// fetchChannelHistory already includes per-message reaction summaries; this
// tool digs into ONE message and names the reactors.
import { defineTool } from "eve/tools";
import { fetchMessageReactions } from "../lib/discord-rest.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

interface Input { channelId: string; messageId: string }

export default defineTool({
  description:
    "Read the reactions on one message: [{emoji, count, users}]. Use it to see how a post " +
    "landed (👍/👎), or to tally an informal emoji vote. For a birds-eye view across the " +
    "thread use fetchChannelHistory (its messages carry reaction summaries); use this when " +
    "you need WHO reacted on a specific message. " +
    "The server overrides channelId with the session's thread channel when available.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id (the server overrides this with the session thread channel)." },
      messageId: { type: "string", description: "The message whose reactions to read." },
    },
    required: ["channelId", "messageId"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.readReactions();
    const { messageId } = input as Input;
    const channelId = ((ctx?.metadata as { channelId?: string } | undefined)?.channelId ?? (input as Input).channelId) as string;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("readReactions: DISCORD_BOT_TOKEN not set");
    if (!messageId?.trim()) throw new Error("readReactions: messageId is required");
    const reactions = await fetchMessageReactions(fetch, { botToken: token, channelId, messageId });
    return { reactions };
  },
});
