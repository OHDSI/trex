// @ts-nocheck - Deno edge function
import { mcpManager } from "../mcp_manager.ts";

export async function handleMcpRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /mcp/servers
  if (path.endsWith("/mcp/servers") && method === "GET") {
    const result = await sql(
      `SELECT id, user_id, name, transport, command, args, env, url, headers, enabled, created_at
       FROM devx.mcp_servers WHERE user_id = $1 ORDER BY name`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /mcp/servers
  if (path.endsWith("/mcp/servers") && method === "POST") {
    const body = await req.json();
    const { name, transport, command, args, env, url, headers } = body;
    if (!name || !transport) {
      return Response.json({ error: "name and transport required" }, { status: 400, headers: corsHeaders });
    }
    if (!["stdio", "http"].includes(transport)) {
      return Response.json({ error: "transport must be stdio or http" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.mcp_servers (user_id, name, transport, command, args, env, url, headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, name, transport, command, args, env, url, headers, enabled, created_at`,
      [userId, name, transport, command || null, JSON.stringify(args || []), JSON.stringify(env || {}), url || null, JSON.stringify(headers || {})],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // PATCH /mcp/servers/:id
  const patchMatch = path.match(/\/mcp\/servers\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    const serverId = patchMatch[1];
    const body = await req.json();
    if (body.transport !== undefined && !["stdio", "http"].includes(body.transport)) {
      return Response.json({ error: "transport must be stdio or http" }, { status: 400, headers: corsHeaders });
    }
    const sets = [];
    const params = [];
    let idx = 1;

    for (const field of ["name", "transport", "command", "url", "enabled"]) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field]);
      }
    }
    for (const jsonField of ["args", "env", "headers"]) {
      if (body[jsonField] !== undefined) {
        sets.push(`${jsonField} = $${idx++}`);
        params.push(JSON.stringify(body[jsonField]));
      }
    }
    if (sets.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
    }
    sets.push(`updated_at = NOW()`);
    params.push(serverId, userId);
    const result = await sql(
      `UPDATE devx.mcp_servers SET ${sets.join(", ")}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING id, user_id, name, transport, command, args, env, url, headers, enabled, created_at`,
      params,
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    // Dispose cached client on config change
    const server = result.rows[0];
    mcpManager.disconnect(userId, server.name);

    return Response.json(server, { headers: corsHeaders });
  }

  // DELETE /mcp/servers/:id
  if (patchMatch && method === "DELETE") {
    const serverId = patchMatch[1];
    // Get name before deleting for client cleanup
    const nameResult = await sql(
      `SELECT name FROM devx.mcp_servers WHERE id = $1 AND user_id = $2`,
      [serverId, userId],
    );
    if (nameResult.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    mcpManager.disconnect(userId, nameResult.rows[0].name);
    await sql(`DELETE FROM devx.mcp_servers WHERE id = $1 AND user_id = $2`, [serverId, userId]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // POST /mcp/servers/:id/test
  const testMatch = path.match(/\/mcp\/servers\/([^/]+)\/test$/);
  if (testMatch && method === "POST") {
    const serverId = testMatch[1];
    const result = await sql(
      `SELECT * FROM devx.mcp_servers WHERE id = $1 AND user_id = $2`,
      [serverId, userId],
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    try {
      const tools = await mcpManager.getTools(userId, [result.rows[0]]);
      return Response.json({ ok: true, tools }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { headers: corsHeaders });
    }
  }

  return null;
}
