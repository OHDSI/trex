// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const skillTool: ToolDefinition<{
  skill: string;
  args?: string;
}> = {
  name: "Skill",
  description:
    "Invoke a skill by name. Skills provide specialized capabilities and knowledge.",
  parameters: {
    type: "object",
    properties: {
      skill: {
        type: "string",
        description: "The skill name or slug to invoke",
      },
      args: {
        type: "string",
        description: "Optional arguments to pass to the skill",
      },
    },
    required: ["skill"],
  },
  defaultConsent: "always",
  modifiesState: false,
  execute: async (args, _ctx) => {
    return `Skill '${args.skill}' invoked with args: ${args.args || "(none)"}. The skill context will be loaded for the next turn.`;
  },
};
