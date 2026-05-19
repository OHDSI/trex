// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/mod.ts";

export const writeFileTool: ToolDefinition<{
  path: string;
  content: string;
  description?: string;
}> = {
  name: "Write",
  description:
    "Create or overwrite a file in the workspace. Creates parent directories automatically.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path for the file" },
      content: { type: "string", description: "File content to write" },
      description: {
        type: "string",
        description: "Brief description of what this file is for",
      },
    },
    required: ["path", "content"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    const desc = args.description ? ` — ${args.description}` : "";
    return `Write file: ${args.path} (${args.content.length} chars)${desc}`;
  },

  async execute(args, ctx) {
    const fullPath = safeJoin(ctx.workspacePath, args.path);
    await Deno.mkdir(dirname(fullPath), { recursive: true });
    await Deno.writeTextFile(fullPath, args.content);
    return `File written: ${args.path} (${args.content.length} chars)`;
  },
};
