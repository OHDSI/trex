// @ts-nocheck - Deno edge function

export async function handlePromptRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /prompts
  if (path.endsWith("/prompts") && method === "GET") {
    const result = await sql(
      `SELECT id, user_id, name, content, category, created_at, updated_at
       FROM devx.prompt_templates WHERE user_id = $1 ORDER BY name`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /prompts
  if (path.endsWith("/prompts") && method === "POST") {
    const body = await req.json();
    const { name, content, category } = body;
    if (!name || !content) {
      return Response.json({ error: "name and content required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.prompt_templates (user_id, name, content, category)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, name, content, category, created_at, updated_at`,
      [userId, name, content, category || "general"],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // PATCH /prompts/:id
  const patchMatch = path.match(/\/prompts\/([^/]+)$/);
  if (patchMatch && method === "PATCH") {
    const promptId = patchMatch[1];
    const body = await req.json();
    const sets = [];
    const params = [];
    let idx = 1;
    for (const field of ["name", "content", "category"]) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field]);
      }
    }
    if (sets.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
    }
    sets.push("updated_at = NOW()");
    params.push(promptId, userId);
    const result = await sql(
      `UPDATE devx.prompt_templates SET ${sets.join(", ")}
       WHERE id = $${idx++} AND user_id = $${idx}
       RETURNING id, user_id, name, content, category, created_at, updated_at`,
      params,
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // DELETE /prompts/:id
  if (patchMatch && method === "DELETE") {
    const promptId = patchMatch[1];
    await sql(`DELETE FROM devx.prompt_templates WHERE id = $1 AND user_id = $2`, [promptId, userId]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  return null;
}
