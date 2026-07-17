// @ts-nocheck - Deno edge function
/**
 * Git operations utility — calls devx-ext DuckDB table functions via Trex.databaseManager().
 */
import { duckdb, escapeSql } from "./duckdb.ts";

interface GitFile {
  path: string;
  status: string;
}

interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

const BRANCH_NAME_REGEX = /^[a-zA-Z0-9/_.-]+$/;

function validateBranchName(name: string): void {
  if (!BRANCH_NAME_REGEX.test(name)) {
    throw new Error(`Invalid branch name: "${name}"`);
  }
  if (name.includes("..") || name === "HEAD" || name.endsWith(".lock")) {
    throw new Error(`Invalid branch name: "${name}"`);
  }
}

class GitOps {
  private locks = new Map<string, Promise<void>>();

  /** Acquire a per-app lock for serializing mutating operations */
  async withLock<T>(appId: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(appId)) {
      await this.locks.get(appId);
    }
    let resolve: () => void;
    const lock = new Promise<void>((r) => { resolve = r; });
    this.locks.set(appId, lock);
    try {
      return await fn();
    } finally {
      this.locks.delete(appId);
      resolve!();
    }
  }

  async init(wsPath: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_init('${escapeSql(wsPath)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  /** Clone `url` into `dest` (must be an empty/new directory). */
  async clone(url: string, dest: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_clone('${escapeSql(url)}', '${escapeSql(dest)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  async status(wsPath: string): Promise<{ files: GitFile[] }> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_status('${escapeSql(wsPath)}')`);
    return JSON.parse(json);
  }

  async commit(wsPath: string, message: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_commit('${escapeSql(wsPath)}', '${escapeSql(message)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  async log(wsPath: string, limit = 50): Promise<GitCommit[]> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_log('${escapeSql(wsPath)}', '${limit}')`);
    return JSON.parse(json);
  }

  async diff(wsPath: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_diff('${escapeSql(wsPath)}')`);
    const result = JSON.parse(json);
    return result.diff;
  }

  async branchList(wsPath: string): Promise<{ current: string; branches: string[] }> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_branch_list('${escapeSql(wsPath)}')`);
    return JSON.parse(json);
  }

  async branchCreate(wsPath: string, name: string): Promise<string> {
    validateBranchName(name);
    const json = await duckdb(`SELECT * FROM trex_devx_git_branch_create('${escapeSql(wsPath)}', '${escapeSql(name)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  async branchSwitch(wsPath: string, name: string): Promise<string> {
    validateBranchName(name);
    const json = await duckdb(`SELECT * FROM trex_devx_git_branch_switch('${escapeSql(wsPath)}', '${escapeSql(name)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  async revert(wsPath: string, commitHash: string): Promise<string> {
    if (!/^[a-f0-9]{7,40}$/.test(commitHash)) {
      throw new Error(`Invalid commit hash: "${commitHash}"`);
    }
    const json = await duckdb(`SELECT * FROM trex_devx_git_revert('${escapeSql(wsPath)}', '${escapeSql(commitHash)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  // --- Remote operations ---

  async setRemote(wsPath: string, url: string, _name = "origin"): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_set_remote('${escapeSql(wsPath)}', '${escapeSql(url)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  async push(wsPath: string, remoteUrl: string, _branch?: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_push('${escapeSql(wsPath)}', '${escapeSql(remoteUrl)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  async pull(wsPath: string, remoteUrl: string, _branch?: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_git_pull('${escapeSql(wsPath)}', '${escapeSql(remoteUrl)}')`);
    const result = JSON.parse(json);
    return result.message;
  }

  // --- Worktree operations ---
  // Interim implementation via the allowlisted raw `git` (trex_devx_run_command);
  // swap for dedicated trex_devx_git_worktree_* vtab ops when the Rust ext is rebuilt.
  // run_command splits the command on whitespace (no shell), so paths/branches
  // must not contain spaces — they don't (sanitized ids).

  private async runGit(repoRoot: string, cmd: string): Promise<string> {
    const json = await duckdb(`SELECT * FROM trex_devx_run_command('${escapeSql(repoRoot)}', '${escapeSql(cmd)}')`);
    const r = JSON.parse(json);
    if (!r.ok) throw new Error(r.output || `git failed: ${cmd}`);
    return r.output || "";
  }

  // Fetch a ref from a remote (best-effort; caller decides how to handle failure).
  async fetch(repoRoot: string, remote: string, ref: string): Promise<void> {
    await this.runGit(repoRoot, `git fetch ${remote} ${ref}`);
  }

  // `startPoint` (e.g. "origin/develop") bases the new branch there instead of
  // the repo's current HEAD, so a feature worktree starts from an up-to-date tree.
  async worktreeAdd(repoRoot: string, worktreePath: string, branch: string, startPoint?: string): Promise<string> {
    validateBranchName(branch);
    const from = startPoint ? ` ${startPoint}` : "";
    await this.runGit(repoRoot, `git worktree add ${worktreePath} -b ${branch}${from}`);
    return worktreePath;
  }

  async worktreeRemove(repoRoot: string, worktreePath: string, force = false): Promise<void> {
    await this.runGit(repoRoot, `git worktree remove ${force ? "--force " : ""}${worktreePath}`);
  }

  async worktreePrune(repoRoot: string): Promise<void> {
    try { await this.runGit(repoRoot, `git worktree prune`); } catch { /* best effort */ }
  }

  async worktreeList(repoRoot: string): Promise<{ path: string; head: string; branch: string | null; bare: boolean; detached: boolean }[]> {
    let out = "";
    try { out = await this.runGit(repoRoot, `git worktree list --porcelain`); } catch { return []; }
    const entries: { path: string; head: string; branch: string | null; bare: boolean; detached: boolean }[] = [];
    let cur: { path: string; head: string; branch: string | null; bare: boolean; detached: boolean } | null = null;
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (cur) entries.push(cur);
        cur = { path: line.slice(9).trim(), head: "", branch: null, bare: false, detached: false };
      } else if (cur && line.startsWith("HEAD ")) {
        cur.head = line.slice(5).trim();
      } else if (cur && line.startsWith("branch ")) {
        cur.branch = line.slice(7).trim().replace("refs/heads/", "");
      } else if (cur && line.trim() === "bare") {
        cur.bare = true;
      } else if (cur && line.trim() === "detached") {
        cur.detached = true;
      }
    }
    if (cur) entries.push(cur);
    return entries;
  }

  async mergeBranch(repoRoot: string, branch: string): Promise<string> {
    validateBranchName(branch);
    return await this.runGit(repoRoot, `git merge --no-ff ${branch}`);
  }

  async deleteBranch(repoRoot: string, branch: string, force = false): Promise<void> {
    validateBranchName(branch);
    await this.runGit(repoRoot, `git branch ${force ? "-D" : "-d"} ${branch}`);
  }
}

export const gitOps = new GitOps();
