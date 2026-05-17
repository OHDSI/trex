// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const compactContextTool: ToolDefinition<{ reason?: string }> = {
  name: "CompactContext",
  description:
    "Summarize older messages in the conversation to free up context space. Call this when the conversation is getting long. Produces a summary that replaces the oldest messages in future requests.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Brief reason for compaction" },
    },
    required: [],
  },
  defaultConsent: "always",
  modifiesState: true,

  async execute(args, ctx) {
    // Fetch messages for this chat
    const msgResult = await ctx.sql(
      `SELECT id, role, content FROM devx.messages
       WHERE chat_id = $1 ORDER BY created_at ASC`,
      [ctx.chatId],
    );
    const messages = msgResult.rows;

    if (messages.length < 10) {
      return "Not enough messages to compact (minimum 10).";
    }

    // Take the first 2/3 of messages for summarization
    const cutoff = Math.floor(messages.length * 2 / 3);
    const toSummarize = messages.slice(0, cutoff);
    const lastMessageId = toSummarize[toSummarize.length - 1].id;

    // Build a summary from the messages (simple extraction, not LLM-based)
    const summary = toSummarize
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n---\n");

    const compactedSummary = `[Compacted context - ${toSummarize.length} messages summarized]\n\n` +
      `Key topics discussed:\n${summary.slice(0, 3000)}`;

    // Store compaction
    await ctx.sql(
      `INSERT INTO devx.compacted_contexts (chat_id, summary, messages_before, last_message_id)
       VALUES ($1, $2, $3, $4)`,
      [ctx.chatId, compactedSummary, toSummarize.length, lastMessageId],
    );

    return `Context compacted: ${toSummarize.length} messages summarized. Future requests will use the summary instead of full message history.`;
  },
};
