// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";

export const readFileTool: ToolDefinition<{
  path: string;
  start_line?: number;
  end_line?: number;
}> = {
  name: "Read",
  description:
    "Read the contents of a file in the workspace. Optionally specify a line range (1-indexed).",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file" },
      start_line: {
        type: "number",
        description: "First line to include (1-indexed, inclusive)",
      },
      end_line: {
        type: "number",
        description: "Last line to include (1-indexed, inclusive)",
      },
    },
    required: ["path"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const fullPath = safeJoin(ctx.workspacePath, args.path);
    const content = await Deno.readTextFile(fullPath);

    if (args.start_line || args.end_line) {
      const lines = content.split("\n");
      const start = Math.max(1, args.start_line || 1);
      const end = Math.min(lines.length, args.end_line || lines.length);
      const slice = lines.slice(start - 1, end);
      return slice
        .map((line, i) => `${start + i}: ${line}`)
        .join("\n");
    }

    return content;
  },
};
