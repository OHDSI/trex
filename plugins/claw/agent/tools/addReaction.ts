// addReaction — put an emoji reaction on a message in the current thread. The
// lightest possible acknowledgement: prefer it over a text reply when a message
// needs "seen/agreed/done" and nothing more (e.g. teammates deliberating among
// themselves, a decision you're already acting on). Message ids come from the
// context block (message_id), from fetchChannelHistory, or from a post* tool's
// returned id.
import { defineTool } from "eve/tools";
import { addMessageReaction } from "../lib/discord-rest.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

interface Input { channelId: string; messageId: string; emoji: string }

export default defineTool({
  description:
    "React to a message with an emoji (the lightest acknowledgement). Use it instead of a text " +
    "reply when a message only needs 'seen'/'agreed'/'on it' — e.g. acknowledging a hold while " +
    "teammates deliberate, or marking a request as done. `emoji` is a unicode emoji like 👍 or a " +
    "custom emoji as name:id. Get the messageId from the context block (message_id), " +
    "fetchChannelHistory, or a post tool's result. " +
    "The server overrides channelId with the session's thread channel when available.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id (the server overrides this with the session thread channel)." },
      messageId: { type: "string", description: "The message to react to." },
      emoji: { type: "string", description: "Unicode emoji (👍, ✅, 👀) or custom emoji as name:id." },
    },
    required: ["channelId", "messageId", "emoji"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.addReaction();
    const { messageId, emoji } = input as Input;
    const channelId = ((ctx?.metadata as { channelId?: string } | undefined)?.channelId ?? (input as Input).channelId) as string;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("addReaction: DISCORD_BOT_TOKEN not set");
    if (!messageId?.trim() || !emoji?.trim()) throw new Error("addReaction: messageId and emoji are required");
    await addMessageReaction(fetch, { botToken: token, channelId, messageId, emoji });
    return { reacted: true, emoji };
  },
});
