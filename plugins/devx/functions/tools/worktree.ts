// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

export const enterWorktreeTool: ToolDefinition<{ name?: string }> = {
  name: "EnterWorktree",
  description:
    "Create and enter a git worktree for isolated work. Creates a new branch and worktree at /tmp/devx-worktrees/{name}.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Worktree and branch name (defaults to a random ID)",
      },
    },
    required: [],
  },
  defaultConsent: "ask",
  modifiesState: true,
  execute: async (args, ctx) => {
    const name = args.name || crypto.randomUUID().slice(0, 8);
    const worktreePath = `/tmp/devx-worktrees/${name}`;
    try {
      const raw = await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(ctx.workspacePath)}', 'git worktree add ${escapeSql(worktreePath)} -b ${escapeSql(name)}')`
      );
      const result = JSON.parse(raw);
      const output = result.output || "";
      const exitCode = result.exit_code ?? 0;
      if (exitCode !== 0) {
        return `Failed to create worktree (exit code ${exitCode}):\n${output}`;
      }
      return `Worktree created at ${worktreePath} on branch ${name}.\n${output}`;
    } catch (err) {
      return `Error creating worktree: ${err.message || String(err)}`;
    }
  },
  getConsentPreview: (args) =>
    `git worktree add /tmp/devx-worktrees/${args.name || "<random>"}`,
};

export const exitWorktreeTool: ToolDefinition<{ name: string }> = {
  name: "ExitWorktree",
  description: "Remove a git worktree by name.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the worktree to remove",
      },
    },
    required: ["name"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  execute: async (args, ctx) => {
    const worktreePath = `/tmp/devx-worktrees/${args.name}`;
    try {
      const raw = await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(ctx.workspacePath)}', 'git worktree remove ${escapeSql(worktreePath)}')`
      );
      const result = JSON.parse(raw);
      const output = result.output || "";
      const exitCode = result.exit_code ?? 0;
      if (exitCode !== 0) {
        return `Failed to remove worktree (exit code ${exitCode}):\n${output}`;
      }
      return `Worktree ${args.name} removed.\n${output}`;
    } catch (err) {
      return `Error removing worktree: ${err.message || String(err)}`;
    }
  },
  getConsentPreview: (args) =>
    `git worktree remove /tmp/devx-worktrees/${args.name}`,
};
