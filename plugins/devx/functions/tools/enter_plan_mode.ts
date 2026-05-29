// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const enterPlanModeTool: ToolDefinition<Record<string, never>> = {
  name: "EnterPlanMode",
  description:
    "Switch to plan mode to design an approach before coding. In plan mode, only read-only tools are available.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,
  execute: async (_args, ctx) => {
    ctx.send({ type: "mode_change", mode: "plan" });
    return "Switched to plan mode. Use read-only tools to research, then use WritePlan to write your plan.";
  },
};
