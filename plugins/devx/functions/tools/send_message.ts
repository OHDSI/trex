// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const sendMessageTool: ToolDefinition<{
  to: string;
  message: string;
}> = {
  name: "SendMessage",
  description:
    "Send a message to another agent or teammate for collaboration.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "The name of the agent or teammate to send the message to",
      },
      message: {
        type: "string",
        description: "The message content to send",
      },
    },
    required: ["to", "message"],
  },
  defaultConsent: "always",
  modifiesState: false,
  execute: async (args, _ctx) => {
    return `Message sent to ${args.to}: ${args.message}`;
  },
};
