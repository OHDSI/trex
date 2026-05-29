// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin, EXCLUDED_DIRS, EXCLUDED_FILES } from "./path_safety.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";

export const grepTool: ToolDefinition<{
  pattern: string;
  path?: string;
  include_glob?: string;
  max_results?: number;
}> = {
  name: "Grep",
  description:
    "Search file contents with a regex pattern. Returns matching lines with file path and line numbers.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: {
        type: "string",
        description: "Relative directory to search in (default: workspace root)",
      },
      include_glob: {
        type: "string",
        description: "File extension filter, e.g. '*.ts' or '*.{ts,tsx}'",
      },
      max_results: {
        type: "number",
        description: "Maximum number of matching lines to return (default: 50)",
      },
    },
    required: ["pattern"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const searchDir = args.path
      ? safeJoin(ctx.workspacePath, args.path)
      : ctx.workspacePath;
    const maxResults = args.max_results ?? 50;
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, "g");
    } catch {
      throw new Error(`Invalid regex pattern: "${args.pattern}"`);
    }
    const matches: string[] = [];

    // Parse include glob into extension set if provided
    let extensions: Set<string> | null = null;
    if (args.include_glob) {
      const extMatch = args.include_glob.match(/\*\.(\{[^}]+\}|[a-zA-Z0-9]+)/);
      if (extMatch) {
        const raw = extMatch[1];
        if (raw.startsWith("{")) {
          extensions = new Set(raw.slice(1, -1).split(",").map((e) => `.${e.trim()}`));
        } else {
          extensions = new Set([`.${raw}`]);
        }
      }
    }

    async function walk(dir: string) {
      if (matches.length >= maxResults) return;
      for await (const entry of Deno.readDir(dir)) {
        if (matches.length >= maxResults) return;
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;

        if (entry.isDirectory) {
          await walk(fullPath);
        } else if (entry.isFile) {
          if (EXCLUDED_FILES.has(entry.name)) continue;
          if (extensions) {
            const ext = entry.name.includes(".")
              ? `.${entry.name.split(".").pop()}`
              : "";
            if (!extensions.has(ext)) continue;
          }

          try {
            const content = await Deno.readTextFile(fullPath);
            const lines = content.split("\n");
            const relPath = relative(ctx.workspacePath, fullPath);
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;
              regex.lastIndex = 0;
              if (regex.test(lines[i])) {
                matches.push(`${relPath}:${i + 1}: ${lines[i]}`);
              }
            }
          } catch {
            // Skip binary / unreadable files
          }
        }
      }
    }

    await walk(searchDir);

    if (matches.length === 0) {
      return `No matches found for pattern: ${args.pattern}`;
    }
    const suffix =
      matches.length >= maxResults
        ? `\n\n(results truncated at ${maxResults})`
        : "";
    return matches.join("\n") + suffix;
  },
};
