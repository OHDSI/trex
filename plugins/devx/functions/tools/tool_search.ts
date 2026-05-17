// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { TOOL_DEFINITIONS } from "./registry.ts";

export const toolSearchTool: ToolDefinition<{ query: string }> = {
  name: "ToolSearch",
  description:
    "Search for available tools by name or description.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to match against tool names and descriptions",
      },
    },
    required: ["query"],
  },
  defaultConsent: "always",
  modifiesState: false,
  execute: async (args, _ctx) => {
    const q = args.query.toLowerCase();
    const matches = TOOL_DEFINITIONS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
    if (matches.length === 0) {
      return `No tools found matching "${args.query}".`;
    }
    const lines = matches.map((t) => `- **${t.name}**: ${t.description}`);
    return `Found ${matches.length} tool(s):\n${lines.join("\n")}`;
  },
};
