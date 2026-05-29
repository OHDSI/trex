// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";
import { devServerManager } from "../dev_server.ts";
import { getAppWorkspacePath } from "./workspace.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

export const restartAppTool: ToolDefinition = {
  name: "RestartApp",
  description:
    "Restart the dev server for the current app. Use after making config changes or when the app is in a broken state. For a full rebuild (clear node_modules and reinstall), set removeNodeModules to true.",
  modifiesState: true,
  defaultConsent: "ask",
  parameters: {
    type: "object",
    properties: {
      removeNodeModules: {
        type: "boolean",
        description:
          "If true, removes node_modules and reinstalls packages before restarting (full rebuild)",
      },
    },
  },
  async execute(
    args: { removeNodeModules?: boolean },
    ctx: AgentContext,
  ) {
    if (!ctx.appId) {
      return "Error: restart_app can only be used in app-scoped chats.";
    }

    const appId = ctx.appId;
    const userId = ctx.userId;
    const wsPath = getAppWorkspacePath(userId, appId);

    // Look up app's dev_command and install_command
    const appResult = await ctx.sql(
      `SELECT dev_command, install_command FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
    if (appResult.rows.length === 0) {
      return "Error: app not found.";
    }
    const { dev_command, install_command } = appResult.rows[0];

    try {
      // Optionally remove node_modules for a full rebuild
      if (args.removeNodeModules) {
        const nmPath = `${wsPath}/node_modules`;
        try {
          await Deno.remove(nmPath, { recursive: true });
        } catch {
          // node_modules may not exist — that's fine
        }

        // Run install command
        if (install_command) {
          const result = JSON.parse(await duckdb(
            `SELECT * FROM trex_devx_run_command('${escapeSql(wsPath)}', '${escapeSql(install_command)}')`
          ));
          if (!result.ok) {
            return `Error: install command failed: ${(result.output || "").slice(0, 500)}`;
          }
        }
      }

      // Stop then start the dev server
      devServerManager.stop(userId, appId);
      const status = await devServerManager.start(
        userId,
        appId,
        wsPath,
        dev_command,
        install_command,
      );

      const rebuildNote = args.removeNodeModules
        ? " (node_modules cleared and reinstalled)"
        : "";
      return `Dev server restarted successfully${rebuildNote}. Status: ${status.status}`;
    } catch (err) {
      return `Error restarting dev server: ${err.message}`;
    }
  },
  getConsentPreview(args: { removeNodeModules?: boolean }) {
    return args.removeNodeModules
      ? "Restart dev server (full rebuild: remove node_modules + reinstall)"
      : "Restart dev server";
  },
};
