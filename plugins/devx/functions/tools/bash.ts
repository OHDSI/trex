// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

export const bashTool: ToolDefinition<{
  command: string;
  description?: string;
  timeout?: number;
}> = {
  name: "Bash",
  description:
    "Execute a shell command in the workspace directory. Use for running scripts, installing packages, git operations, build commands, etc. Commands run via `sh` in the workspace.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      description: {
        type: "string",
        description: "Brief description of what this command does (for logging)",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: 30)",
      },
    },
    required: ["command"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  execute: async (args, ctx) => {
    const timeout = args.timeout || 30;
    // Write the command to a temp script and execute via duckdb run_command
    const scriptId = crypto.randomUUID().slice(0, 8);
    const scriptPath = `/tmp/.devx-bash-${scriptId}.sh`;
    try {
      await Deno.writeTextFile(scriptPath, args.command + "\n");
      const raw = await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(ctx.workspacePath)}', 'sh ${escapeSql(scriptPath)}')`
      );
      const result = JSON.parse(raw);
      try { await Deno.remove(scriptPath); } catch {}

      const output = result.output || "";
      const exitCode = result.exit_code ?? 0;

      if (exitCode !== 0) {
        return `Command failed (exit code ${exitCode}):\n${output}`;
      }
      return output || "(no output)";
    } catch (err) {
      try { await Deno.remove(scriptPath); } catch {}
      return `Error executing command: ${err.message || String(err)}`;
    }
  },
  getConsentPreview: (args) => `$ ${args.command}`,
};
