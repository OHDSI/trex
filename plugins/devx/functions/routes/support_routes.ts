// @ts-nocheck - Deno edge function
// Instance-global support settings: Discord<->GitHub user map + Slack allowlist.
// Unlike the other route modules these tables are NOT user-scoped — they are
// deployment-level config consumed by the claw/d2esupport agents.
export async function handleSupportRoutes(path, method, req, userId, sql, corsHeaders) {
  const [cleanPath, query] = path.split("?");

  // GET /support/user-map
  if (cleanPath.endsWith("/support/user-map") && method === "GET") {
    const result = await sql(
      `SELECT id, github_login, discord_user_id, display_name, created_at
       FROM devx.user_map ORDER BY github_login`,
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /support/user-map
  if (cleanPath.endsWith("/support/user-map") && method === "POST") {
    const body = await req.json();
    const { github_login, discord_user_id, display_name } = body;
    if (!github_login?.trim() || !discord_user_id?.trim()) {
      return Response.json({ error: "github_login and discord_user_id required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.user_map (github_login, discord_user_id, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (github_login) DO UPDATE SET
         discord_user_id = EXCLUDED.discord_user_id,
         display_name = EXCLUDED.display_name,
         updated_at = NOW()
       RETURNING id, github_login, discord_user_id, display_name, created_at`,
      [github_login.trim(), discord_user_id.trim(), display_name?.trim() || null],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // PATCH/DELETE /support/user-map/:id
  const mapMatch = cleanPath.match(/\/support\/user-map\/([^/]+)$/);
  if (mapMatch && method === "PATCH") {
    const body = await req.json();
    const sets = [];
    const params = [];
    let idx = 1;
    for (const field of ["github_login", "discord_user_id", "display_name"]) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field]);
      }
    }
    if (sets.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
    }
    sets.push(`updated_at = NOW()`);
    params.push(mapMatch[1]);
    const result = await sql(
      `UPDATE devx.user_map SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING id, github_login, discord_user_id, display_name, created_at`,
      params,
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(result.rows[0], { headers: corsHeaders });
  }
  if (mapMatch && method === "DELETE") {
    await sql(`DELETE FROM devx.user_map WHERE id = $1`, [mapMatch[1]]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // GET /support/discord-ids?logins=a,b
  if (cleanPath.endsWith("/support/discord-ids") && method === "GET") {
    const logins = (new URLSearchParams(query || "").get("logins") || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (logins.length === 0) {
      return Response.json({ mappings: {}, unmapped: [] }, { headers: corsHeaders });
    }
    const result = await sql(
      `SELECT github_login, discord_user_id FROM devx.user_map WHERE github_login = ANY($1)`,
      [logins],
    );
    const mappings = {};
    for (const row of result.rows) mappings[row.github_login] = row.discord_user_id;
    const unmapped = logins.filter((l) => !(l in mappings));
    return Response.json({ mappings, unmapped }, { headers: corsHeaders });
  }

  // GET /support/slack-allowlist/check?user=U123  (empty list => not allowed: fail closed)
  if (cleanPath.endsWith("/support/slack-allowlist/check") && method === "GET") {
    const user = (new URLSearchParams(query || "").get("user") || "").trim();
    if (!user) return Response.json({ allowed: false }, { headers: corsHeaders });
    const result = await sql(`SELECT id FROM devx.slack_allowlist WHERE slack_user_id = $1`, [user]);
    return Response.json({ allowed: result.rows.length > 0 }, { headers: corsHeaders });
  }

  // GET /support/slack-allowlist
  if (cleanPath.endsWith("/support/slack-allowlist") && method === "GET") {
    const result = await sql(
      `SELECT id, slack_user_id, note, created_at FROM devx.slack_allowlist ORDER BY created_at`,
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /support/slack-allowlist
  if (cleanPath.endsWith("/support/slack-allowlist") && method === "POST") {
    const body = await req.json();
    if (!body.slack_user_id?.trim()) {
      return Response.json({ error: "slack_user_id required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.slack_allowlist (slack_user_id, note)
       VALUES ($1, $2)
       ON CONFLICT (slack_user_id) DO UPDATE SET note = EXCLUDED.note
       RETURNING id, slack_user_id, note, created_at`,
      [body.slack_user_id.trim(), body.note?.trim() || null],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // DELETE /support/slack-allowlist/:id
  const allowMatch = cleanPath.match(/\/support\/slack-allowlist\/([^/]+)$/);
  if (allowMatch && allowMatch[1] !== "check" && method === "DELETE") {
    await sql(`DELETE FROM devx.slack_allowlist WHERE id = $1`, [allowMatch[1]]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return null;
}
