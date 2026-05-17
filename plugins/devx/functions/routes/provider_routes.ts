// @ts-nocheck - Deno edge function

export async function handleProviderRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /providers — list custom providers
  if (path.endsWith("/providers") && method === "GET") {
    const result = await sql(
      `SELECT id, user_id, name, base_url, models, created_at FROM devx.custom_providers WHERE user_id = $1 ORDER BY name`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /providers — create custom provider
  if (path.endsWith("/providers") && method === "POST") {
    const body = await req.json();
    const { name, base_url, api_key, models } = body;
    if (!name || !base_url) {
      return Response.json({ error: "name and base_url required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.custom_providers (user_id, name, base_url, api_key, models)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, name, base_url, models, created_at`,
      [userId, name, base_url, api_key || null, JSON.stringify(models || [])],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // DELETE /providers/:id
  const deleteMatch = path.match(/\/providers\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    const providerId = deleteMatch[1];
    await sql(`DELETE FROM devx.custom_providers WHERE id = $1 AND user_id = $2`, [providerId, userId]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // GET /tools — list all tools with user consent
  if (path.endsWith("/tools") && method === "GET") {
    const { TOOL_DEFINITIONS } = await import("../tools/registry.ts");
    const consentResult = await sql(
      `SELECT tool_name, consent FROM devx.tool_consents WHERE user_id = $1`,
      [userId],
    );
    const consents = {};
    for (const row of consentResult.rows) {
      consents[row.tool_name] = row.consent;
    }
    const tools = TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      defaultConsent: t.defaultConsent,
      modifiesState: t.modifiesState || false,
      userConsent: consents[t.name] || null,
    }));
    return Response.json(tools, { headers: corsHeaders });
  }

  // PATCH /tools/:name/consent — update consent
  const consentMatch = path.match(/\/tools\/([^/]+)\/consent$/);
  if (consentMatch && method === "PATCH") {
    const toolName = decodeURIComponent(consentMatch[1]);
    // Validate: must be a known built-in tool or an MCP tool (prefixed mcp_)
    if (toolName.length > 200 || !/^[a-zA-Z0-9_]+$/.test(toolName)) {
      return Response.json({ error: "Invalid tool name" }, { status: 400, headers: corsHeaders });
    }
    const body = await req.json();
    const { consent } = body;
    if (!consent || !["always", "ask", "never"].includes(consent)) {
      return Response.json({ error: "consent must be always, ask, or never" }, { status: 400, headers: corsHeaders });
    }
    await sql(
      `INSERT INTO devx.tool_consents (user_id, tool_name, consent)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tool_name) DO UPDATE SET consent = $3`,
      [userId, toolName, consent],
    );
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return null;
}
