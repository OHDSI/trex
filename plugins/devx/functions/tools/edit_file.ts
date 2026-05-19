// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";

export const editFileTool: ToolDefinition<{
  path: string;
  old_text: string;
  new_text: string;
}> = {
  name: "Edit",
  description:
    "Replace a specific section of a file. The old_text must appear exactly once in the file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file" },
      old_text: {
        type: "string",
        description: "Exact text to find and replace (must be unique in the file)",
      },
      new_text: {
        type: "string",
        description: "Replacement text",
      },
    },
    required: ["path", "old_text", "new_text"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    const oldSnip = args.old_text.slice(0, 80);
    const newSnip = args.new_text.slice(0, 80);
    return `Edit ${args.path}: "${oldSnip}" → "${newSnip}"`;
  },

  async execute(args, ctx) {
    const fullPath = safeJoin(ctx.workspacePath, args.path);
    const content = await Deno.readTextFile(fullPath);

    const count = content.split(args.old_text).length - 1;
    if (count === 0) {
      throw new Error(`old_text not found in ${args.path}`);
    }
    if (count > 1) {
      throw new Error(
        `old_text found ${count} times in ${args.path} — must be unique. Provide more surrounding context.`,
      );
    }

    const newContent = content.replace(args.old_text, () => args.new_text);
    await Deno.writeTextFile(fullPath, newContent);
    return `File edited: ${args.path}`;
  },
};
