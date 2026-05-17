// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const setChatSummaryTool: ToolDefinition<{ summary: string }> = {
  name: "SetChatSummary",
  description: "Set a concise summary/title for this chat conversation.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "A concise summary of the chat (less than a sentence, more than a few words)",
      },
    },
    required: ["summary"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    await ctx.sql(
      `UPDATE devx.chats SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
      [args.summary, ctx.chatId, ctx.userId],
    );
    return `Chat summary set to: "${args.summary}"`;
  },
};
