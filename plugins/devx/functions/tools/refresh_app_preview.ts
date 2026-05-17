// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";

export const refreshAppPreviewTool: ToolDefinition = {
  name: "RefreshPreview",
  description:
    "Refresh the app preview in the user's browser. Use after making changes that should be reflected in the preview iframe.",
  modifiesState: false,
  defaultConsent: "always",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute(_args: Record<string, never>, ctx: AgentContext) {
    ctx.send({ type: "app_command", command: "refresh" });
    return "Preview refresh signal sent. The app preview will reload.";
  },
};
