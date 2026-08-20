// @ts-nocheck - Deno edge function
/**
 * Provider configuration CRUD routes.
 * Manages multiple provider configs per user for multi-provider support.
 */
import { deriveAuthShape } from "../auth_shape.ts";
import { encryptionConfigured, readProviderKey, writeProviderKeyFields } from "../provider_key.ts";

// Non-secret display mask, matches the shape the SQL CASE expressions used
// to produce directly in the column before encryption existed.
function maskKey(plaintext) {
  if (!plaintext) return null;
  return plaintext.substring(0, 8) + "..." + plaintext.slice(-4);
}

// Resolve a row's key for display (masking, auth_shape) purposes only. Unlike
// the coder-turn read sites (index.ts), a row this can't decrypt must not take
// down the whole management UI (list/rename/delete) with it — degrade to
// "unknown" for that one row and log, rather than failing the request.
async function resolveForDisplay(row) {
  try {
    return await readProviderKey(row);
  } catch (err) {
    console.error(
      "[provider-configs] could not decrypt api_key for display (row id " + row.id + "):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function handleProviderConfigRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /provider-configs — list all configs for this user
  if (path.endsWith("/provider-configs") && method === "GET") {
    // Select the raw key material (plaintext and/or encrypted pair) so both
    // the masked preview and auth_shape can be computed from the actually
    // resolved value — once a row is encrypted, the plaintext api_key column
    // alone is NULL, so deriving these straight from SQL would silently show
    // "no key" / auth_shape "none" for a row that has one (auth_shape "iam"
    // gates the bedrock legacy-loop fallback in useEffectiveLoop.ts, so this
    // isn't just cosmetic).
    const result = await sql(
      `SELECT id, user_id, provider, model, api_key, api_key_encrypted, api_key_iv,
              base_url, display_name, is_active, created_at, updated_at
       FROM devx.provider_configs WHERE user_id = $1
       ORDER BY is_active DESC, updated_at DESC`,
      [userId],
    );
    for (const row of result.rows) {
      const resolved = await resolveForDisplay(row);
      row.auth_shape = deriveAuthShape(resolved);
      row.api_key = maskKey(resolved);
      delete row.api_key_encrypted;
      delete row.api_key_iv;
    }
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /provider-configs — create new provider config
  if (path.endsWith("/provider-configs") && method === "POST") {
    const body = await req.json();
    const { provider, model, api_key, base_url, display_name } = body;
    if (!provider || !model) {
      return Response.json({ error: "provider and model are required" }, { status: 400, headers: corsHeaders });
    }

    // Route through the encryption helper and write all three columns in the
    // same statement, so a row is never half-migrated (plaintext with a
    // dangling encrypted pair, or vice versa).
    const keyFields = await writeProviderKeyFields(api_key || null);
    const result = await sql(
      `INSERT INTO devx.provider_configs (user_id, provider, model, api_key, api_key_encrypted, api_key_iv, base_url, display_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, provider, model, api_key, api_key_encrypted, api_key_iv,
                 base_url, display_name, is_active, created_at, updated_at`,
      [userId, provider, model, keyFields.api_key, keyFields.api_key_encrypted, keyFields.api_key_iv, base_url || null, display_name || null],
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

    const created = result.rows[0];
    const resolvedKey = await resolveForDisplay(created);
    created.api_key = maskKey(resolvedKey);
    delete created.api_key_encrypted;
    delete created.api_key_iv;

    return Response.json(created, { status: 201, headers: corsHeaders });
  }

  // POST /provider-configs/encrypt-existing — encrypt every row still holding
  // a plaintext key. Idempotent: rows that are already encrypted are skipped,
  // and running it twice changes nothing. A no-op when no encryption key is
  // configured — it reports that rather than failing.
  if (path.endsWith("/provider-configs/encrypt-existing") && method === "POST") {
    const totalResult = await sql(
      `SELECT COUNT(*) as cnt FROM devx.provider_configs WHERE user_id = $1`,
      [userId],
    );
    const total = parseInt(totalResult.rows[0]?.cnt ?? "0");

    if (!encryptionConfigured()) {
      return Response.json(
        { migrated: 0, skipped: total, encryptionConfigured: false },
        { headers: corsHeaders },
      );
    }

    const candidates = (await sql(
      `SELECT id, api_key FROM devx.provider_configs WHERE user_id = $1 AND api_key IS NOT NULL`,
      [userId],
    )).rows;

    let migrated = 0;
    for (const row of candidates) {
      // One statement per row, all three columns together: the plaintext
      // column is nulled in the same UPDATE that writes the encrypted pair,
      // so a row is never observed half-migrated.
      const keyFields = await writeProviderKeyFields(row.api_key);
      await sql(
        `UPDATE devx.provider_configs
         SET api_key = $1, api_key_encrypted = $2, api_key_iv = $3, updated_at = NOW()
         WHERE id = $4 AND user_id = $5`,
        [keyFields.api_key, keyFields.api_key_encrypted, keyFields.api_key_iv, row.id, userId],
      );
      migrated++;
    }

    return Response.json(
      { migrated, skipped: total - migrated, encryptionConfigured: true },
      { headers: corsHeaders },
    );
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
    if (api_key !== undefined) {
      // All three key columns are set together, only when the request
      // actually sends a key — an update that omits api_key (e.g. renaming a
      // config) must leave the existing credential, encrypted or plaintext,
      // completely untouched rather than nulling it.
      const keyFields = await writeProviderKeyFields(api_key || null);
      sets.push(`api_key = $${paramIdx++}`); params.push(keyFields.api_key);
      sets.push(`api_key_encrypted = $${paramIdx++}`); params.push(keyFields.api_key_encrypted);
      sets.push(`api_key_iv = $${paramIdx++}`); params.push(keyFields.api_key_iv);
    }
    if (base_url !== undefined) { sets.push(`base_url = $${paramIdx++}`); params.push(base_url || null); }
    if (display_name !== undefined) { sets.push(`display_name = $${paramIdx++}`); params.push(display_name || null); }

    if (sets.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
    }

    sets.push("updated_at = NOW()");

    const result = await sql(
      `UPDATE devx.provider_configs SET ${sets.join(", ")}
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, provider, model, api_key, api_key_encrypted, api_key_iv,
                 base_url, display_name, is_active, created_at, updated_at`,
      params,
    );

    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const updated = result.rows[0];
    const resolvedKey = await resolveForDisplay(updated);
    updated.api_key = maskKey(resolvedKey);
    delete updated.api_key_encrypted;
    delete updated.api_key_iv;
    return Response.json(updated, { headers: corsHeaders });
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
