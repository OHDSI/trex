// plugins/claw/agent/tools/postDevSummary.ts
// One call = the whole dev-channel notification: summary message (with real
// mentions), a review thread off it, the proposed reply seeded into the thread,
// and the claw.support_tasks row that later thread turns look up.
import { defineTool } from "eve/tools";
import { postChannelMessage, startThreadFromMessage } from "../lib/discord-rest.ts";
import { upsertSupportTask } from "../lib/support-state.ts";
import type { QueryFn } from "../lib/state.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

interface Input {
  supportSessionId: string;
  kind: string;
  brief: string;
  summary: string;
  nextSteps: string;
  proposedReply: string;
  discordUserIds: string[];
  unmappedLogins: string[];
  githubLogins: string[];
  threadName: string;
}

interface Deps {
  devChannelId: string;
  post: (opts: {
    botToken?: string; channelId: string; content?: string;
    allowedMentions?: { users?: string[] };
  }) => Promise<{ id: string }>;
  startThread: (opts: { botToken?: string; channelId: string; messageId: string; name: string }) => Promise<{ threadId: string }>;
}

export async function postDevSummaryCore(sql: QueryFn, input: Input, deps: Deps): Promise<{ threadId: string }> {
  const mentions = input.discordUserIds.map((id) => `<@${id}>`).join(" ");
  const unmapped = input.unmappedLogins.length
    ? `\nUnmapped GitHub logins (add in devx Settings → Support): ${input.unmappedLogins.join(", ")}`
    : "";
  const content = [
    `**Support task (${input.kind})** ${mentions}`.trim(),
    "",
    `**Problem:** ${input.summary}`,
    `**Suggested next steps:** ${input.nextSteps}`,
    unmapped,
  ].join("\n").slice(0, 2000);

  const msg = await deps.post({
    channelId: deps.devChannelId,
    content,
    allowedMentions: { users: input.discordUserIds },
  });
  const { threadId } = await deps.startThread({
    channelId: deps.devChannelId,
    messageId: msg.id,
    name: input.threadName,
  });
  await deps.post({
    channelId: threadId,
    content: `**Proposed reply to the user:**\n${input.proposedReply}\n\nEdit it by chatting here, or approve it when I ask.`.slice(0, 2000),
  });
  await upsertSupportTask(sql, {
    threadId,
    supportSessionId: input.supportSessionId,
    kind: input.kind,
    brief: input.brief,
    proposedReply: input.proposedReply,
    githubLogins: input.githubLogins,
    status: "awaiting_review",
  });
  return { threadId };
}

export default defineTool({
  description:
    "Notify the dev channel about a support task: posts the summary mentioning the resolved " +
    "Discord ids, opens a review thread, seeds it with the proposed user reply, and records " +
    "the task so thread messages route back to it. Call once per support task, after " +
    "lookupDiscordIds. Returns the review thread id.",
  inputSchema: {
    type: "object",
    properties: {
      supportSessionId: { type: "string", description: "support_session value from the SUPPORT_TASK message." },
      kind: { type: "string", description: "bug | feature | data-issue." },
      brief: { type: "string", description: "The original task brief." },
      summary: { type: "string", description: "One-paragraph problem summary from the investigation." },
      nextSteps: { type: "string", description: "Short suggested next steps." },
      proposedReply: { type: "string", description: "Draft user-facing answer for the devs to review." },
      discordUserIds: { type: "array", items: { type: "string" }, description: "Resolved Discord ids to mention." },
      unmappedLogins: { type: "array", items: { type: "string" }, description: "GitHub logins with no mapping." },
      githubLogins: { type: "array", items: { type: "string" }, description: "ALL GitHub logins from the investigation, mapped and unmapped." },
      threadName: { type: "string", description: "Short thread title, e.g. 'Support: export 500'." },
    },
    required: ["supportSessionId", "kind", "brief", "summary", "nextSteps", "proposedReply", "discordUserIds", "unmappedLogins", "githubLogins", "threadName"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.postDevSummary();
    if (!ctx?.sql) throw new Error("postDevSummary: ctx.sql unavailable");
    const token = Deno.env.get("DISCORD_BOT_TOKEN");
    const devChannelId = Deno.env.get("CLAW_DEV_CHANNEL_ID");
    if (!token) throw new Error("postDevSummary: DISCORD_BOT_TOKEN not set");
    if (!devChannelId) throw new Error("postDevSummary: CLAW_DEV_CHANNEL_ID not set");
    return postDevSummaryCore(ctx.sql, input as Input, {
      devChannelId,
      post: (opts) => postChannelMessage(fetch, { botToken: token, ...opts }),
      startThread: (opts) => startThreadFromMessage(fetch, { botToken: token, ...opts }),
    });
  },
});
