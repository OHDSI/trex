// @ts-nocheck - Deno edge function

export async function handleTrexRoutes(path, method, req, userId, sql, corsHeaders) {
  // POST /apps/:id/database/create
  const dbCreateMatch = path.match(/\/apps\/([^/]+)\/database\/create$/);
  if (dbCreateMatch && method === "POST") {
    const appId = dbCreateMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    // Sanitize appId for schema name (replace hyphens with underscores)
    const safeId = appId.replace(/[^a-zA-Z0-9]/g, "_");
    const schemaName = `devx_app_${safeId}`;

    // Validate schema name against strict pattern
    if (!/^devx_app_[a-zA-Z0-9_]+$/.test(schemaName)) {
      return Response.json({ error: "Invalid schema name" }, { status: 400, headers: corsHeaders });
    }

    await sql(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`, []);
    await sql(
      `INSERT INTO devx.app_databases (app_id, schema_name)
       VALUES ($1, $2) ON CONFLICT (schema_name) DO NOTHING`,
      [appId, schemaName],
    );

    return Response.json({ schema_name: schemaName }, { headers: corsHeaders });
  }

  // GET /apps/:id/database/tables
  const tablesMatch = path.match(/\/apps\/([^/]+)\/database\/tables$/);
  if (tablesMatch && method === "GET") {
    const appId = tablesMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const dbResult = await sql(
      `SELECT schema_name FROM devx.app_databases WHERE app_id = $1`,
      [appId],
    );
    if (dbResult.rows.length === 0) {
      return Response.json({ error: "No database for this app" }, { status: 404, headers: corsHeaders });
    }
    const schemaName = dbResult.rows[0].schema_name;

    const tables = await sql(
      `SELECT table_name, table_type
       FROM information_schema.tables
       WHERE table_schema = $1
       ORDER BY table_name`,
      [schemaName],
    );
    return Response.json(tables.rows, { headers: corsHeaders });
  }

  // GET /apps/:id/database/tables/:table
  const tableDescMatch = path.match(/\/apps\/([^/]+)\/database\/tables\/([^/]+)$/);
  if (tableDescMatch && method === "GET") {
    const appId = tableDescMatch[1];
    const tableName = tableDescMatch[2];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const dbResult = await sql(`SELECT schema_name FROM devx.app_databases WHERE app_id = $1`, [appId]);
    if (dbResult.rows.length === 0) {
      return Response.json({ error: "No database for this app" }, { status: 404, headers: corsHeaders });
    }

    const columns = await sql(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [dbResult.rows[0].schema_name, tableName],
    );
    return Response.json(columns.rows, { headers: corsHeaders });
  }

  return null;
}
