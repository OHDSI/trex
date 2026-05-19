// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { gitOps } from "../git.ts";
import { decryptToken } from "../crypto.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

async function getGitHubToken(ctx): Promise<string> {
  const result = await ctx.sql(
    `SELECT encrypted_token, token_iv FROM devx.integrations
     WHERE user_id = $1 AND provider = 'github' LIMIT 1`,
    [ctx.userId],
  );
  if (result.rows.length === 0) {
    throw new Error("GitHub not connected. Connect via Settings first.");
  }
  const { encrypted_token, token_iv } = result.rows[0];
  return await decryptToken(encrypted_token, token_iv);
}

async function getRemoteUrl(ctx): Promise<string> {
  // Get app's remote URL from git config
  try {
    const result = JSON.parse(await duckdb(
      `SELECT * FROM trex_devx_run_command('${escapeSql(ctx.workspacePath)}', 'git remote get-url origin')`
    ));
    if (result.ok && result.output) {
      return result.output.trim();
    }
  } catch { /* no remote */ }
  throw new Error("No git remote configured. Connect a GitHub repo first.");
}

function injectToken(remoteUrl: string, token: string): string {
  // https://github.com/user/repo.git → https://x-access-token:TOKEN@github.com/user/repo.git
  return remoteUrl.replace(
    /^https:\/\/github\.com\//,
    `https://x-access-token:${token}@github.com/`,
  );
}

export const gitPushTool: ToolDefinition<{ branch?: string }> = {
  name: "GitPush",
  description: "Push commits to the GitHub remote repository.",
  parameters: {
    type: "object",
    properties: {
      branch: { type: "string", description: "Branch to push (default: current)" },
    },
    required: [],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) {
    return `Push to GitHub${args.branch ? ` (branch: ${args.branch})` : ""}`;
  },
  async execute(args, ctx) {
    const token = await getGitHubToken(ctx);
    const remoteUrl = await getRemoteUrl(ctx);
    const authUrl = injectToken(remoteUrl, token);
    return await gitOps.withLock(ctx.chatId, () =>
      gitOps.push(ctx.workspacePath, authUrl, args.branch),
    );
  },
};

export const gitPullTool: ToolDefinition<{ branch?: string }> = {
  name: "GitPull",
  description: "Pull latest changes from the GitHub remote repository.",
  parameters: {
    type: "object",
    properties: {
      branch: { type: "string", description: "Branch to pull (default: current)" },
    },
    required: [],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) {
    return `Pull from GitHub${args.branch ? ` (branch: ${args.branch})` : ""}`;
  },
  async execute(args, ctx) {
    const token = await getGitHubToken(ctx);
    const remoteUrl = await getRemoteUrl(ctx);
    const authUrl = injectToken(remoteUrl, token);
    return await gitOps.withLock(ctx.chatId, () =>
      gitOps.pull(ctx.workspacePath, authUrl, args.branch),
    );
  },
};
