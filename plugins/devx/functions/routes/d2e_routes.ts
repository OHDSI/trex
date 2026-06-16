// @ts-nocheck - Deno edge function
import { detectD2E } from "../d2e/detect.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";

async function loadCfg(appId, userId, sql) {
  const r = await sql(`SELECT config FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
  if (r.rows.length === 0) return null;
  return r.rows[0].config || {};
}
async function saveCfg(appId, cfg, sql) {
  await sql(`UPDATE devx.apps SET config = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(cfg), appId]);
}

export async function handleD2ERoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /apps/:id/d2e
  let m = path.match(/\/apps\/([^/]+)\/d2e$/);
  if (m && method === "GET") {
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    return Response.json(cfg.d2e ?? null, { headers: corsHeaders });
  }
  // POST /apps/:id/d2e/select  { key }
  m = path.match(/\/apps\/([^/]+)\/d2e\/select$/);
  if (m && method === "POST") {
    const { key } = await req.json();
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg?.d2e) return Response.json({ error: "Not a d2e app" }, { status: 400, headers: corsHeaders });
    if (!cfg.d2e.subApps.some((s) => s.key === key))
      return Response.json({ error: "Unknown sub-app" }, { status: 400, headers: corsHeaders });
    cfg.d2e.activeSubApp = key;
    await saveCfg(m[1], cfg, sql);
    // TREX.md regeneration is wired in Phase 2 (Task 2.2).
    return Response.json({ ok: true, activeSubApp: key }, { headers: corsHeaders });
  }
  // PATCH /apps/:id/d2e/external-api  { externalApiBase }
  m = path.match(/\/apps\/([^/]+)\/d2e\/external-api$/);
  if (m && method === "PATCH") {
    const { externalApiBase } = await req.json();
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg?.d2e) return Response.json({ error: "Not a d2e app" }, { status: 400, headers: corsHeaders });
    cfg.d2e.externalApiBase = externalApiBase || undefined;
    await saveCfg(m[1], cfg, sql);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }
  // POST /apps/:id/d2e/redetect
  m = path.match(/\/apps\/([^/]+)\/d2e\/redetect$/);
  if (m && method === "POST") {
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg?.d2e) return Response.json({ error: "Not a d2e app" }, { status: 400, headers: corsHeaders });
    const wsPath = getAppWorkspacePath(userId, m[1]);
    const fresh = await detectD2E(wsPath, cfg.d2e.repo);
    fresh.activeSubApp = cfg.d2e.activeSubApp;
    fresh.externalApiBase = cfg.d2e.externalApiBase;
    cfg.d2e = fresh;
    await saveCfg(m[1], cfg, sql);
    return Response.json(fresh, { headers: corsHeaders });
  }
  return null;
}
