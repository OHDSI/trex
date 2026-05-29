// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/mod.ts";

export const copyFileTool: ToolDefinition<{
  source: string;
  destination: string;
}> = {
  name: "CopyFile",
  description: "Copy a file to a new path in the workspace. Creates parent directories.",
  parameters: {
    type: "object",
    properties: {
      source: { type: "string", description: "Relative path of the source file" },
      destination: { type: "string", description: "Relative path for the copy" },
    },
    required: ["source", "destination"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    return `Copy: ${args.source} → ${args.destination}`;
  },

  async execute(args, ctx) {
    const srcPath = safeJoin(ctx.workspacePath, args.source);
    const dstPath = safeJoin(ctx.workspacePath, args.destination);
    await Deno.mkdir(dirname(dstPath), { recursive: true });
    await Deno.copyFile(srcPath, dstPath);
    return `Copied: ${args.source} → ${args.destination}`;
  },
};
