import { defineTool } from "eve/tools";
import { sendApprovedReply } from "../lib/support-reply.ts";
import { readSupportTask, upsertSupportTask } from "../lib/support-state.ts";
import type { QueryFn } from "../lib/state.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

interface Input { channelId: string; finalReply: string }

export async function replyCore(
  sql: QueryFn,
  input: Input,
  userId: string,
  send: (args: { supportSessionId: string; finalReply: string; userId: string }) => Promise<void> =
    (a) => sendApprovedReply(a),
): Promise<{ sent: boolean }> {
  const task = await readSupportTask(sql, input.channelId);
  if (!task) throw new Error("replyToSupport: no support task for this thread");
  await send({ supportSessionId: task.supportSessionId, finalReply: input.finalReply, userId });
  await upsertSupportTask(sql, { ...task, proposedReply: input.finalReply, status: "sent" });
  return { sent: true };
}

export default defineTool({
  description:
    "Send the dev-approved final reply back to the support user's Slack thread. Call ONLY " +
    "after the devs approved (awaitApproval) or explicitly told you to send. The text goes " +
    "out verbatim.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current review-thread id." },
      finalReply: { type: "string", description: "The approved reply text, verbatim." },
    },
    required: ["channelId", "finalReply"],
  },
  execute: (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.replyToSupport();
    if (!ctx?.sql) throw new Error("replyToSupport: ctx.sql unavailable");
    const userId = effectiveUserId(ctx?.userId, (k) => Deno.env.get(k));
    if (!userId) throw new Error("replyToSupport: no user id (set CLAW_CODE_USER_ID)");
    // Deterministic channel id: the server-side delivery channel wins over the
    // model-typed input (same override as the other support tools).
    const channelId = ((ctx?.metadata as { channelId?: string } | undefined)?.channelId ??
      (input as Input).channelId) as string;
    return replyCore(ctx.sql, { ...(input as Input), channelId }, userId);
  },
});
