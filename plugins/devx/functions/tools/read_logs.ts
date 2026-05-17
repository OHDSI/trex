// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";

export const readLogsTool: ToolDefinition<{
  path?: string;
  lines?: number;
}> = {
  name: "ReadLogs",
  description:
    "Read the last N lines from a log file in the workspace. Defaults to the dev server log if available.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the log file (default: tries common log locations)",
      },
      lines: {
        type: "number",
        description: "Number of lines from the end to return (default: 50)",
      },
    },
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const numLines = args.lines ?? 50;

    // Determine which log file to read
    let logPath: string;
    if (args.path) {
      logPath = safeJoin(ctx.workspacePath, args.path);
    } else {
      // Try common log locations
      const candidates = [
        "dev.log",
        ".dev.log",
        "logs/dev.log",
        "npm-debug.log",
      ];
      let found: string | null = null;
      for (const candidate of candidates) {
        const p = safeJoin(ctx.workspacePath, candidate);
        try {
          await Deno.stat(p);
          found = p;
          break;
        } catch {
          // Try next
        }
      }
      if (!found) {
        return "No log file found. Specify a path explicitly.";
      }
      logPath = found;
    }

    const content = await Deno.readTextFile(logPath);
    const allLines = content.split("\n");
    const tail = allLines.slice(-numLines);
    return tail.join("\n");
  },
};
