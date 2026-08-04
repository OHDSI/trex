import { defineTool } from "eve/tools";
import { fetchRecentMessages } from "../lib/discord-rest.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

export default defineTool({
  description: "Fetch the most recent messages of a Discord channel to summarize the discussion.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string" },
      limit: { type: "number", description: "How many recent messages (default 50, max 100)." },
    },
    required: ["channelId"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.fetchChannelHistory(ctx);
    const { channelId, limit } = input as { channelId: string; limit?: number };
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("fetchChannelHistory: DISCORD_BOT_TOKEN not set");
    const messages = await fetchRecentMessages(fetch, {
      botToken: token, channelId, limit: Math.min(limit ?? 50, 100),
    });
    return { messages };
  },
});
