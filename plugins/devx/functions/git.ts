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
}

export const gitOps = new GitOps();
