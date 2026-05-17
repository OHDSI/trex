// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";

export const searchReplaceTool: ToolDefinition<{
  path: string;
  search: string;
  replace: string;
  regex?: boolean;
}> = {
  name: "SearchReplace",
  description:
    "Find and replace a string or regex pattern in a file. Replaces all occurrences.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path to the file" },
      search: { type: "string", description: "String or regex pattern to find" },
      replace: { type: "string", description: "Replacement string" },
      regex: {
        type: "boolean",
        description: "Treat search as a regex pattern (default: false)",
      },
    },
    required: ["path", "search", "replace"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    return `Search/replace in ${args.path}: "${args.search.slice(0, 60)}" → "${args.replace.slice(0, 60)}"`;
  },

  async execute(args, ctx) {
    const fullPath = safeJoin(ctx.workspacePath, args.path);
    const content = await Deno.readTextFile(fullPath);

    let pattern: RegExp;
    try {
      if (args.regex) {
        pattern = new RegExp(args.search, "g");
      } else {
        const escaped = args.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern = new RegExp(escaped, "g");
      }
    } catch {
      throw new Error(`Invalid regex pattern: "${args.search}"`);
    }

    const count = (content.match(pattern) || []).length;
    const newContent = content.replace(pattern, () => args.replace);

    if (count === 0) {
      return `No matches found for "${args.search}" in ${args.path}`;
    }

    await Deno.writeTextFile(fullPath, newContent);
    return `Replaced ${count} occurrence${count === 1 ? "" : "s"} in ${args.path}`;
  },
};
