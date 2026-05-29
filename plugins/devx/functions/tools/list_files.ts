// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin, EXCLUDED_DIRS } from "./path_safety.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";

export const listFilesTool: ToolDefinition<{
  path?: string;
  recursive?: boolean;
  include_hidden?: boolean;
}> = {
  name: "Glob",
  description:
    "List files and directories in the workspace. Excludes node_modules, .git, dist, etc. by default.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative directory path (default: workspace root)",
      },
      recursive: {
        type: "boolean",
        description: "List files recursively (default: false)",
      },
      include_hidden: {
        type: "boolean",
        description: "Include hidden files/dirs starting with . (default: false)",
      },
    },
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const dirPath = args.path
      ? safeJoin(ctx.workspacePath, args.path)
      : ctx.workspacePath;
    const entries: string[] = [];
    const recursive = args.recursive ?? false;
    const includeHidden = args.include_hidden ?? false;

    async function walk(dir: string) {
      for await (const entry of Deno.readDir(dir)) {
        if (!includeHidden && entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;
        const rel = relative(ctx.workspacePath, fullPath);
        entries.push(entry.isDirectory ? `${rel}/` : rel);

        if (recursive && entry.isDirectory) {
          await walk(fullPath);
        }
      }
    }

    await walk(dirPath);
    entries.sort();

    if (entries.length === 0) {
      return "Directory is empty.";
    }
    return entries.join("\n");
  },
};
