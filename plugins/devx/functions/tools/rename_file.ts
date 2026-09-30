// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";
import { dirname } from "node:path";

export const renameFileTool: ToolDefinition<{
  source: string;
  destination: string;
}> = {
  name: "RenameFile",
  description: "Move or rename a file in the workspace. Creates parent directories.",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Current relative path of the file" },
      destination: { type: "string", description: "New relative path for the file" },
    },
    required: ["source", "destination"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    return `Rename: ${args.source} → ${args.destination}`;
  },

  async execute(args, ctx) {
    const srcPath = safeJoin(ctx.workspacePath, args.source);
    const dstPath = safeJoin(ctx.workspacePath, args.destination);
    await Deno.mkdir(dirname(dstPath), { recursive: true });
    await Deno.rename(srcPath, dstPath);
    return `Renamed: ${args.source} → ${args.destination}`;
  },
};
