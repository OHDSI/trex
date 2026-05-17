// @ts-nocheck - Deno edge function
/**
 * API routes for prototypes — HTML files produced by the visual-prototyping skill.
 * Convention: <app workspace>/prototypes/<name>/index.html
 */

import { getAppWorkspacePath } from "../tools/workspace.ts";

export async function handlePrototypeRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /apps/:id/prototypes — list prototypes/*/index.html in the app workspace
  const listMatch = path.match(/\/apps\/([^/]+)\/prototypes$/);
  if (listMatch && method === "GET") {
    const appId = listMatch[1];
    const appCheck = await sql(
      `SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const wsPath = getAppWorkspacePath(userId, appId);
    const dir = `${wsPath}/prototypes`;

    let entries: { name: string; path: string; mtime: number }[] = [];
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isDirectory) continue;
        const indexPath = `${dir}/${entry.name}/index.html`;
        try {
          const stat = await Deno.stat(indexPath);
          if (stat.isFile) {
            entries.push({
              name: entry.name,
              path: `prototypes/${entry.name}/index.html`,
              mtime: stat.mtime ? stat.mtime.getTime() : 0,
            });
          }
        } catch { /* missing index.html — skip */ }
      }
    } catch { /* prototypes dir doesn't exist yet */ }

    entries.sort((a, b) => b.mtime - a.mtime);
    return Response.json(entries, { headers: corsHeaders });
  }

  return null;
}
