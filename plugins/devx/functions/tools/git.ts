// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { gitOps } from "../git.ts";

export const gitInitTool: ToolDefinition<Record<string, never>> = {
  name: "GitInit",
  description: "Initialize a git repository in the app workspace.",
  parameters: { type: "object", properties: {}, required: [] },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview() { return "Initialize git repository"; },
  async execute(_args, ctx) {
    return await gitOps.withLock(ctx.workspacePath, () => gitOps.init(ctx.workspacePath));
  },
};

export const gitCommitTool: ToolDefinition<{ message: string }> = {
  name: "GitCommit",
  description: "Stage all changes and create a git commit.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Commit message" },
    },
    required: ["message"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) { return `Commit: "${args.message}"`; },
  async execute(args, ctx) {
    return await gitOps.withLock(ctx.workspacePath, () => gitOps.commit(ctx.workspacePath, args.message));
  },
};

export const gitStatusTool: ToolDefinition<Record<string, never>> = {
  name: "GitStatus",
  description: "Show uncommitted changes in the workspace.",
  parameters: { type: "object", properties: {}, required: [] },
  defaultConsent: "always",
  modifiesState: false,
  async execute(_args, ctx) {
    const { files } = await gitOps.status(ctx.workspacePath);
    if (files.length === 0) return "Working tree clean — no uncommitted changes.";
    return files.map((f) => `${f.status} ${f.path}`).join("\n");
  },
};

export const gitLogTool: ToolDefinition<{ limit?: number }> = {
  name: "GitLog",
  description: "Show recent git commit history.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Number of commits (default 20)" },
    },
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,
  async execute(args, ctx) {
    const commits = await gitOps.log(ctx.workspacePath, args.limit ?? 20);
    if (commits.length === 0) return "No commits yet.";
    return commits
      .map((c) => `${c.hash.substring(0, 7)} ${c.date.substring(0, 10)} ${c.message}`)
      .join("\n");
  },
};

export const gitDiffTool: ToolDefinition<Record<string, never>> = {
  name: "GitDiff",
  description: "Show diff of uncommitted changes.",
  parameters: { type: "object", properties: {}, required: [] },
  defaultConsent: "always",
  modifiesState: false,
  async execute(_args, ctx) {
    return await gitOps.diff(ctx.workspacePath);
  },
};

export const gitBranchListTool: ToolDefinition<Record<string, never>> = {
  name: "GitBranchList",
  description: "List git branches and show the current branch.",
  parameters: { type: "object", properties: {}, required: [] },
  defaultConsent: "always",
  modifiesState: false,
  async execute(_args, ctx) {
    const { current, branches } = await gitOps.branchList(ctx.workspacePath);
    return branches.map((b) => `${b === current ? "* " : "  "}${b}`).join("\n");
  },
};

export const gitBranchCreateTool: ToolDefinition<{ name: string }> = {
  name: "GitBranchCreate",
  description: "Create a new git branch.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Branch name" } },
    required: ["name"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) { return `Create branch: ${args.name}`; },
  async execute(args, ctx) {
    return await gitOps.withLock(ctx.workspacePath, () => gitOps.branchCreate(ctx.workspacePath, args.name));
  },
};

export const gitBranchSwitchTool: ToolDefinition<{ name: string }> = {
  name: "GitBranchSwitch",
  description: "Switch to a different git branch.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Branch name to switch to" } },
    required: ["name"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) { return `Switch to branch: ${args.name}`; },
  async execute(args, ctx) {
    return await gitOps.withLock(ctx.workspacePath, () => gitOps.branchSwitch(ctx.workspacePath, args.name));
  },
};

export const gitRevertTool: ToolDefinition<{ commit_hash: string }> = {
  name: "GitRevert",
  description: "Revert the workspace to a specific commit.",
  parameters: {
    type: "object",
    properties: { commit_hash: { type: "string", description: "Commit hash to revert to" } },
    required: ["commit_hash"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) { return `Revert to commit: ${args.commit_hash.substring(0, 7)}`; },
  async execute(args, ctx) {
    return await gitOps.withLock(ctx.workspacePath, () => gitOps.revert(ctx.workspacePath, args.commit_hash));
  },
};
