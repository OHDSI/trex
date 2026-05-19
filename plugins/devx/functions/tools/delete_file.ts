// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";

export const deleteFileTool: ToolDefinition<{ path: string }> = {
  name: "DeleteFile",
  description: "Delete a file from the workspace.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file to delete" },
    },
    required: ["path"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    return `Delete file: ${args.path}`;
  },

  async execute(args, ctx) {
    const fullPath = safeJoin(ctx.workspacePath, args.path);
    const info = await Deno.stat(fullPath);
    if (!info.isFile) {
      throw new Error(`"${args.path}" is not a file`);
    }
    await Deno.remove(fullPath);
    return `File deleted: ${args.path}`;
  },
};
