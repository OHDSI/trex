import { defineTool } from "eve/tools";
import { readSupportTask } from "../lib/support-state.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

export default defineTool({
  description:
    "Look up the support task for a Discord channel/thread id. Returns {found:false} when the " +
    "current conversation is not a support-review thread; otherwise the task's kind, brief, " +
    "proposed reply and status. Call this FIRST when handling messages in a thread you may " +
    "have created for a support task.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel (thread) id." },
    },
    required: ["channelId"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.getSupportTask();
    if (!ctx?.sql) throw new Error("getSupportTask: ctx.sql unavailable");
    const task = await readSupportTask(ctx.sql, input.channelId as string);
    return task ? { found: true, ...task } : { found: false };
  },
});
