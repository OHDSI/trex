// @ts-nocheck - Deno edge function
import { gitOps } from "../git.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

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
      const result = await gitOps.withLock(wsPath, () => gitOps.commit(wsPath, message));
      return Response.json({ ok: true, message: result }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
    }
  }

  return null;
}
