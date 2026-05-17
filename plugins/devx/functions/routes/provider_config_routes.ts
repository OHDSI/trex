// @ts-nocheck - Deno edge function
/**
 * Provider configuration CRUD routes.
 * Manages multiple provider configs per user for multi-provider support.
 */

export async function handleProviderConfigRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /provider-configs — list all configs for this user
  if (path.endsWith("/provider-configs") && method === "GET") {
    const result = await sql(
      `SELECT id, user_id, provider, model,
              CASE WHEN api_key IS NOT NULL AND api_key != '' THEN
                CONCAT(LEFT(api_key, 8), '...', RIGHT(api_key, 4))
              ELSE NULL END AS api_key,
              base_url, display_name, is_active, created_at, updated_at
       FROM devx.provider_configs WHERE user_id = $1
       ORDER BY is_active DESC, updated_at DESC`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /provider-configs — create new provider config
  if (path.endsWith("/provider-configs") && method === "POST") {
    const body = await req.json();
    const { provider, model, api_key, base_url, display_name } = body;
    if (!provider || !model) {
      return Response.json({ error: "provider and model are required" }, { status: 400, headers: corsHeaders });
    }

    const result = await sql(
      `INSERT INTO devx.provider_configs (user_id, provider, model, api_key, base_url, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, provider, model,
                 CASE WHEN api_key IS NOT NULL AND api_key != '' THEN
                   CONCAT(LEFT(api_key, 8), '...', RIGHT(api_key, 4))
                 ELSE NULL END AS api_key,
                 base_url, display_name, is_active, created_at, updated_at`,
      [userId, provider, model, api_key || null, base_url || null, display_name || null],
    );

    // If this is the first config, auto-activate it
    const countResult = await sql(
      `SELECT COUNT(*) as cnt FROM devx.provider_configs WHERE user_id = $1`,
      [userId],
    );
    if (parseInt(countResult.rows[0]?.cnt) === 1) {
      await sql(
        `UPDATE devx.provider_configs SET is_active = true WHERE user_id = $1`,
        [userId],
      );
      result.rows[0].is_active = true;
    }

    return Response.json(result.rows[0], { status: 201, headers: corsHeaders });
  }

  // PUT /provider-configs/:id — update a config
  const updateMatch = path.match(/\/provider-configs\/([^/]+)$/);
  if (updateMatch && method === "PUT" && !path.includes("/activate")) {
    const configId = updateMatch[1];
    const body = await req.json();
    const { provider, model, api_key, base_url, display_name } = body;

    // Build dynamic update — only update fields that are provided
    const sets = [];
    const params = [configId, userId];
    let paramIdx = 3;

    if (provider !== undefined) { sets.push(`provider = $${paramIdx++}`); params.push(provider); }
    if (model !== undefined) { sets.push(`model = $${paramIdx++}`); params.push(model); }
    if (api_key !== undefined) { sets.push(`api_key = $${paramIdx++}`); params.push(api_key || null); }
    if (base_url !== undefined) { sets.push(`base_url = $${paramIdx++}`); params.push(base_url || null); }
    if (display_name !== undefined) { sets.push(`display_name = $${paramIdx++}`); params.push(display_name || null); }

    if (sets.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
    }

    sets.push("updated_at = NOW()");

    const result = await sql(
      `UPDATE devx.provider_configs SET ${sets.join(", ")}
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, provider, model,
                 CASE WHEN api_key IS NOT NULL AND api_key != '' THEN
                   CONCAT(LEFT(api_key, 8), '...', RIGHT(api_key, 4))
                 ELSE NULL END AS api_key,
                 base_url, display_name, is_active, created_at, updated_at`,
      params,
    );

    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // PUT /provider-configs/:id/activate — set as active (deactivates others)
  const activateMatch = path.match(/\/provider-configs\/([^/]+)\/activate$/);
  if (activateMatch && method === "PUT") {
    const configId = activateMatch[1];

    // Deactivate all, then activate the chosen one
    await sql(
      `UPDATE devx.provider_configs SET is_active = false WHERE user_id = $1`,
      [userId],
    );
    const result = await sql(
      `UPDATE devx.provider_configs SET is_active = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, provider, model, is_active`,
      [configId, userId],
    );

    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    // Also update devx.settings for backward compatibility
    const config = result.rows[0];
    await sql(
      `UPDATE devx.settings SET provider = $1, model = $2, updated_at = NOW() WHERE user_id = $3`,
      [config.provider, config.model, userId],
    );

    return Response.json({ ok: true, active: config }, { headers: corsHeaders });
  }

  // DELETE /provider-configs/:id — remove a config
  const deleteMatch = path.match(/\/provider-configs\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    const configId = deleteMatch[1];

    // Check if deleting the active one
    const check = await sql(
      `SELECT is_active FROM devx.provider_configs WHERE id = $1 AND user_id = $2`,
      [configId, userId],
    );
    if (check.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    await sql(
      `DELETE FROM devx.provider_configs WHERE id = $1 AND user_id = $2`,
      [configId, userId],
    );

    // If deleted the active one, activate the most recent remaining
    if (check.rows[0].is_active) {
      await sql(
        `UPDATE devx.provider_configs SET is_active = true
         WHERE id = (SELECT id FROM devx.provider_configs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1)`,
        [userId],
      );
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return null;
}
