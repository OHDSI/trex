// @ts-nocheck - Deno edge function
import { gitOps } from "../git.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { duckdb, escapeSql } from "../duckdb.ts";
import { getGithubToken, injectToken } from "./github_routes.ts";
import { ensureGitConfig } from "../git_identity.ts";

export async function handleGitRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /apps/:id/git/status
  const statusMatch = path.match(/\/apps\/([^/]+)\/git\/status$/);
  if (statusMatch && method === "GET") {
    const appId = statusMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const result = await gitOps.status(wsPath);
      return Response.json(result, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ files: [], error: err.message }, { headers: corsHeaders });
    }
  }

  // GET /apps/:id/git/log
  const logMatch = path.match(/\/apps\/([^/]+)\/git\/log$/);
  if (logMatch && method === "GET") {
    const appId = logMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const commits = await gitOps.log(wsPath);
      return Response.json(commits, { headers: corsHeaders });
    } catch {
      return Response.json([], { headers: corsHeaders });
    }
  }

  // GET /apps/:id/git/branches
  const branchesMatch = path.match(/\/apps\/([^/]+)\/git\/branches$/);
  if (branchesMatch && method === "GET") {
    const appId = branchesMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const result = await gitOps.branchList(wsPath);
      return Response.json(result, { headers: corsHeaders });
    } catch {
      return Response.json({ current: "main", branches: [] }, { headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/branches/create
  const branchCreateMatch = path.match(/\/apps\/([^/]+)\/git\/branches\/create$/);
  if (branchCreateMatch && method === "POST") {
    const appId = branchCreateMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const body = await req.json();
    const name = body.name;
    if (!name || !name.trim()) {
      return Response.json({ error: "Branch name required" }, { status: 400, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const result = await gitOps.withLock(wsPath, () => gitOps.branchCreate(wsPath, name.trim()));
      return Response.json({ ok: true, message: result }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/branches/switch
  const branchSwitchMatch = path.match(/\/apps\/([^/]+)\/git\/branches\/switch$/);
  if (branchSwitchMatch && method === "POST") {
    const appId = branchSwitchMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const body = await req.json();
    const name = body.name;
    if (!name || !name.trim()) {
      return Response.json({ error: "Branch name required" }, { status: 400, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const result = await gitOps.withLock(wsPath, () => gitOps.branchSwitch(wsPath, name.trim()));
      return Response.json({ ok: true, message: result }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/branches/delete
  const branchDeleteMatch = path.match(/\/apps\/([^/]+)\/git\/branches\/delete$/);
  if (branchDeleteMatch && method === "POST") {
    const appId = branchDeleteMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const body = await req.json();
    const name = body.name;
    if (!name || !name.trim()) {
      return Response.json({ error: "Branch name required" }, { status: 400, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const result = JSON.parse(await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(wsPath)}', 'git branch -d ${escapeSql(name.trim())}')`
      ));
      if (!result.ok) {
        throw new Error(result.output || "Failed to delete branch");
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/commit
  const commitMatch = path.match(/\/apps\/([^/]+)\/git\/commit$/);
  if (commitMatch && method === "POST") {
    const appId = commitMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const body = await req.json();
    const message = body.message;
    if (!message || !message.trim()) {
      return Response.json({ error: "Commit message required" }, { status: 400, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      // Identity/signing config must be in place before the commit is created.
      await ensureGitConfig(wsPath, userId, sql).catch(() => {});
      const result = await gitOps.withLock(wsPath, () => gitOps.commit(wsPath, message));
      return Response.json({ ok: true, message: result }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/push — push the current branch to the app's remote
  const pushMatch = path.match(/\/apps\/([^/]+)\/git\/push$/);
  if (pushMatch && method === "POST") {
    const appId = pushMatch[1];
    const appCheck = await sql(`SELECT git_remote_url FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const remoteUrl = appCheck.rows[0].git_remote_url;
    if (!remoteUrl) {
      return Response.json({ error: "No remote configured. Connect a GitHub repo first." }, { status: 400, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const token = await getGithubToken(userId, sql);
      const result = await gitOps.withLock(wsPath, () => gitOps.push(wsPath, injectToken(remoteUrl, token)));
      return Response.json({ ok: true, message: result }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/pull — pull the app's remote into the current branch
  const pullMatch = path.match(/\/apps\/([^/]+)\/git\/pull$/);
  if (pullMatch && method === "POST") {
    const appId = pullMatch[1];
    const appCheck = await sql(`SELECT git_remote_url FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const remoteUrl = appCheck.rows[0].git_remote_url;
    if (!remoteUrl) {
      return Response.json({ error: "No remote configured. Connect a GitHub repo first." }, { status: 400, headers: corsHeaders });
    }
    const wsPath = getAppWorkspacePath(userId, appId);
    try {
      const token = await getGithubToken(userId, sql);
      const result = await gitOps.withLock(wsPath, () => gitOps.pull(wsPath, injectToken(remoteUrl, token)));
      return Response.json({ ok: true, message: result }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // GET /apps/:id/git/worktrees — list run worktrees with per-worktree status
  const wtListMatch = path.match(/\/apps\/([^/]+)\/git\/worktrees$/);
  if (wtListMatch && method === "GET") {
    const appId = wtListMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const repoRoot = getAppWorkspacePath(userId, appId);
    try {
      await gitOps.worktreePrune(repoRoot);
      const list = await gitOps.worktreeList(repoRoot);
      const runs = (await sql(
        `SELECT id, branch, status FROM devx.subagent_runs WHERE app_id = $1 AND branch IS NOT NULL`,
        [appId],
      )).rows;
      const worktrees = [];
      for (const wt of list) {
        const isMain = !wt.path.includes("/.worktrees/");
        let files = [];
        try { files = (await gitOps.status(wt.path)).files || []; } catch { /* worktree may be gone */ }
        const run = runs.find((r) => r.branch === wt.branch);
        worktrees.push({
          path: wt.path,
          branch: wt.branch,
          head: wt.head,
          isMain,
          status: files,
          runId: run?.id || null,
          runStatus: run?.status || null,
        });
      }
      return Response.json({ worktrees }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ worktrees: [], error: err.message }, { headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/worktrees/merge — merge a run branch into the base tree, then remove the worktree
  const wtMergeMatch = path.match(/\/apps\/([^/]+)\/git\/worktrees\/merge$/);
  if (wtMergeMatch && method === "POST") {
    const appId = wtMergeMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const { branch, path: wtPath } = await req.json();
    if (!branch) {
      return Response.json({ error: "branch required" }, { status: 400, headers: corsHeaders });
    }
    const repoRoot = getAppWorkspacePath(userId, appId);
    try {
      // A --no-ff merge creates a commit; make sure it is signed/attributed.
      await ensureGitConfig(repoRoot, userId, sql).catch(() => {});
      const out = await gitOps.withLock(repoRoot, async () => {
        const msg = await gitOps.mergeBranch(repoRoot, branch);
        if (wtPath) { try { await gitOps.worktreeRemove(repoRoot, wtPath, false); } catch { /* leave worktree */ } }
        try { await gitOps.deleteBranch(repoRoot, branch, false); } catch { /* keep if not fully merged */ }
        return msg;
      });
      return Response.json({ ok: true, message: out }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  // POST /apps/:id/git/worktrees/discard — remove a run worktree and delete its branch
  const wtDiscardMatch = path.match(/\/apps\/([^/]+)\/git\/worktrees\/discard$/);
  if (wtDiscardMatch && method === "POST") {
    const appId = wtDiscardMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const { branch, path: wtPath } = await req.json();
    const repoRoot = getAppWorkspacePath(userId, appId);
    try {
      await gitOps.withLock(repoRoot, async () => {
        if (wtPath) await gitOps.worktreeRemove(repoRoot, wtPath, true);
        if (branch) { try { await gitOps.deleteBranch(repoRoot, branch, true); } catch { /* */ } }
      });
      return Response.json({ ok: true }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  return null;
}
