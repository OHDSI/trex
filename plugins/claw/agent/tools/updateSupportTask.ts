import { defineTool } from "eve/tools";
import { readSupportTask, upsertSupportTask } from "../lib/support-state.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

export default defineTool({
  description:
    "Save the current draft of the proposed user reply (after the devs edit it in the thread) " +
    "or set the task status ('awaiting_review' | 'discarded'). Keeps the review resumable if " +
    "the conversation pauses.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current thread id." },
      proposedReply: { type: "string", description: "The updated draft reply." },
      status: { type: "string", enum: ["awaiting_review", "discarded"], description: "Optional status change." },
    },
    required: ["channelId"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.updateSupportTask();
    if (!ctx?.sql) throw new Error("updateSupportTask: ctx.sql unavailable");
    const task = await readSupportTask(ctx.sql, input.channelId as string);
    if (!task) throw new Error("updateSupportTask: no support task for this thread");
    await upsertSupportTask(ctx.sql, {
      ...task,
      proposedReply: (input.proposedReply as string | undefined) ?? task.proposedReply,
      status: (input.status as string | undefined) ?? task.status,
    });
    return { updated: true };
  },
});
