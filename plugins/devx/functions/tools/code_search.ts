// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin, EXCLUDED_DIRS, EXCLUDED_FILES } from "./path_safety.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";

/** File extensions considered "code" */
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".vue", ".svelte", ".astro",
  ".html", ".css", ".scss", ".less",
  ".json", ".yaml", ".yml", ".toml",
  ".md", ".mdx", ".sql", ".sh", ".bash",
]);

export const codeSearchTool: ToolDefinition<{
  query: string;
  path?: string;
  max_results?: number;
}> = {
  name: "CodeSearch",
  description:
    "Search for a literal string across all code files in the workspace. Returns matching lines with surrounding context.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text string to search for" },
      path: {
        type: "string",
        description: "Relative directory to search in (default: workspace root)",
      },
      max_results: {
        type: "number",
        description: "Maximum number of matching lines (default: 30)",
      },
    },
    required: ["query"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const searchDir = args.path
      ? safeJoin(ctx.workspacePath, args.path)
      : ctx.workspacePath;
    const maxResults = args.max_results ?? 30;
    const query = args.query.toLowerCase();
    const matches: string[] = [];

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
          const ext = entry.name.includes(".")
            ? `.${entry.name.split(".").pop()}`
            : "";
          if (!CODE_EXTENSIONS.has(ext)) continue;

          try {
            const content = await Deno.readTextFile(fullPath);
            const lines = content.split("\n");
            const relPath = relative(ctx.workspacePath, fullPath);
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;
              if (lines[i].toLowerCase().includes(query)) {
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
      return `No matches found for: "${args.query}"`;
    }
    const suffix =
      matches.length >= maxResults
        ? `\n\n(results truncated at ${maxResults})`
        : "";
    return matches.join("\n") + suffix;
  },
};
