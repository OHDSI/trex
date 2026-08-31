// @ts-nocheck - Deno edge function
/**
 * Provider configuration CRUD routes.
 * Manages multiple provider configs per user for multi-provider support.
 */
import { deriveAuthShape } from "../auth_shape.ts";
import { maskKey } from "../api_key_mask.ts";
import {
  assertEncryptionMigrated,
  assertProviderConfigEncryptionMigrated,
  encryptionConfigured,
  readProviderKey,
  writeProviderKeyFields,
} from "../provider_key.ts";
import { activateDevxProviderConfig } from "../agent_model_selection.ts";

// Resolve a row's key for display (masking, auth_shape) purposes only. Unlike
// the coder-turn read sites (index.ts), a row this can't decrypt must not take
// down the whole management UI (list/rename/delete) with it — degrade to
// "unknown" for that one row and log, rather than failing the request.
// Returns `status` alongside the value so the caller can distinguish "this
// row has no key" (status "ok", value null) from "this row has a key we
// can't currently read" (status "undecryptable", value null) — both
// otherwise collapse into auth_shape "none", which would silently hide a
// broken (possibly genuinely IAM-shaped) credential behind "not configured".
async function resolveForDisplay(row) {
  try {
    return { value: await readProviderKey(row), status: "ok" };
  } catch (err) {
    console.error(
      "[provider-configs] could not decrypt api_key for display (row id " + row.id + "):",
      err instanceof Error ? err.message : err,
    );
    return { value: null, status: "undecryptable" };
  }
}

export async function handleProviderConfigRoutes(path, method, req, userId, sql, corsHeaders) {
  // handleProviderConfigRoutes is called on every request that reaches this
  // point in index.ts's `||` dispatch chain (it returns null for a
  // non-matching path), so the migration probe below is scoped to only the
  // branches that actually touch api_key_encrypted/api_key_iv — never run
  // unconditionally here, or an unrelated route would pay for (and fail on)
  // a devx-provider-configs-specific check.

  // GET /provider-configs — list all configs for this user
  if (path.endsWith("/provider-configs") && method === "GET") {
    // Probe before selecting the encrypted columns — see provider_key.ts's
    // assertProviderConfigEncryptionMigrated header comment.
    await assertProviderConfigEncryptionMigrated(sql);
    // Select the raw key material (plaintext and/or encrypted pair) so both
    // the masked preview and auth_shape can be computed from the actually
    // resolved value — once a row is encrypted, the plaintext api_key column
    // alone is NULL, so deriving these straight from SQL would silently show
    // "no key" / auth_shape "none" for a row that has one. auth_shape gates
    // nothing — there is one loop now, and the client-side router that used to
    // force claude-code onto the legacy one is deleted; it's a display-only
    // credential-shape hint for the Settings UI, but that's still real signal,
    // so this isn't just cosmetic.
    const result = await sql(
      `SELECT id, user_id, provider, model, api_key, api_key_encrypted, api_key_iv,
              base_url, display_name, is_active, created_at, updated_at
       FROM devx.provider_configs WHERE user_id = $1
       ORDER BY is_active DESC, updated_at DESC`,
      [userId],
    );
    for (const row of result.rows) {
      // Captured before resolveForDisplay overwrites row.api_key with the
      // masked value below — tells the UI whether this row's credential is
      // still sitting in the legacy plaintext column (so it can offer the
      // encrypt-existing backfill) without exposing any key material itself.
      const wasPlaintextOnly = row.api_key != null && row.api_key_encrypted == null;
      const { value: resolved, status: keyStatus } = await resolveForDisplay(row);
      row.auth_shape = deriveAuthShape(resolved);
      row.api_key = maskKey(resolved);
      row.key_status = keyStatus;
      row.is_plaintext = wasPlaintextOnly;
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

    // Probe before writing the encrypted columns — see provider_key.ts's
    // assertProviderConfigEncryptionMigrated header comment.
    await assertProviderConfigEncryptionMigrated(sql);
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
    const { value: resolvedKey, status: createdKeyStatus } = await resolveForDisplay(created);
    created.api_key = maskKey(resolvedKey);
    created.key_status = createdKeyStatus;
    delete created.api_key_encrypted;
    delete created.api_key_iv;

    return Response.json(created, { status: 201, headers: corsHeaders });
  }

  // POST /provider-configs/encrypt-existing — encrypt every row still holding
  // a plaintext key, in BOTH tables that store one: devx.provider_configs and
  // the caller's legacy devx.settings row. The route keeps its
  // provider-configs path for compatibility with clients already calling it;
  // the two-table split is an implementation detail nobody using the Settings
  // page should have to know about, so there is deliberately one route and
  // one button rather than two of each.
  //
  // Idempotent: rows that already hold an encrypted pair are skipped, and
  // running it twice changes nothing. A no-op when no encryption key is
  // configured — it reports that rather than failing.
  if (path.endsWith("/provider-configs/encrypt-existing") && method === "POST") {
    const totalResult = await sql(
      `SELECT COUNT(*) as cnt FROM devx.provider_configs WHERE user_id = $1`,
      [userId],
    );
    const configsTotal = parseInt(totalResult.rows[0]?.cnt ?? "0");
    // 0 or 1 — devx.settings is keyed by user_id. Counted the same way as
    // provider_configs so `skipped` means the same thing in both halves:
    // "rows this backfill looked at and left alone".
    const settingsTotalResult = await sql(
      `SELECT COUNT(*) as cnt FROM devx.settings WHERE user_id = $1`,
      [userId],
    );
    const settingsTotal = parseInt(settingsTotalResult.rows[0]?.cnt ?? "0");

    if (!encryptionConfigured()) {
      return Response.json(
        {
          migrated: 0,
          skipped: configsTotal + settingsTotal,
          encryptionConfigured: false,
          tables: {
            provider_configs: { migrated: 0, skipped: configsTotal },
            settings: { migrated: 0, skipped: settingsTotal },
          },
        },
        { headers: corsHeaders },
      );
    }

    // Probe BOTH tables before writing anything: a half-run that migrates
    // provider_configs and then dies on a missing V16 would report an error
    // for work it actually did. See provider_key.ts's assertEncryptionMigrated
    // header comment.
    await assertProviderConfigEncryptionMigrated(sql);
    await assertEncryptionMigrated("settings", sql);

    // Excludes rows that already hold an encrypted pair, even though every
    // write path today nulls api_key once it writes api_key_encrypted (so
    // this is currently unreachable) — this keeps "never overwrite an
    // encrypted pair from a stale plaintext column" a structural guarantee
    // of the query rather than an inference from write-path behaviour.
    const candidates = (await sql(
      `SELECT id, api_key FROM devx.provider_configs WHERE user_id = $1 AND api_key IS NOT NULL AND api_key_encrypted IS NULL`,
      [userId],
    )).rows;

    let configsMigrated = 0;
    for (const row of candidates) {
      // One statement per row, all three columns together: the plaintext
      // column is nulled in the same UPDATE that writes the encrypted pair,
      // so a row is never observed half-migrated.
      //
      // The WHERE clause repeats the candidate predicate rather than trusting
      // the SELECT above: a write landing in between has already replaced (or
      // encrypted) this row's key, and matching on the id alone would
      // overwrite that newer credential with the encrypted form of the
      // plaintext this loop read a moment earlier.
      const keyFields = await writeProviderKeyFields(row.api_key);
      // RETURNING so the count reports rows actually rewritten: a row the
      // guard above declined to touch was migrated by whoever raced us, not
      // by this run.
      const written = await sql(
        `UPDATE devx.provider_configs
         SET api_key = $1, api_key_encrypted = $2, api_key_iv = $3, updated_at = NOW()
         WHERE id = $4 AND user_id = $5 AND api_key IS NOT NULL AND api_key_encrypted IS NULL
         RETURNING id`,
        [keyFields.api_key, keyFields.api_key_encrypted, keyFields.api_key_iv, row.id, userId],
      );
      if (written.rows.length > 0) configsMigrated++;
    }

    // The legacy devx.settings row. V7__multi_provider.sql seeded
    // provider_configs from devx.settings WITHOUT clearing the source, so a
    // user predating the multi-provider UI can hold the same key in both
    // tables — encrypting only one of them leaves the plaintext copy behind,
    // which is the whole reason the backfill can't stop at provider_configs.
    // Same candidate predicate, same all-columns-in-one-statement rewrite and
    // same repeat-the-predicate-in-the-WHERE guard as above — the interleaving
    // write here is a PUT /settings, which is reachable from the same page
    // that offers this backfill.
    const settingsCandidates = (await sql(
      `SELECT api_key FROM devx.settings WHERE user_id = $1 AND api_key IS NOT NULL AND api_key_encrypted IS NULL`,
      [userId],
    )).rows;

    let settingsMigrated = 0;
    for (const row of settingsCandidates) {
      const keyFields = await writeProviderKeyFields(row.api_key);
      const written = await sql(
        `UPDATE devx.settings
         SET api_key = $1, api_key_encrypted = $2, api_key_iv = $3, updated_at = NOW()
         WHERE user_id = $4 AND api_key IS NOT NULL AND api_key_encrypted IS NULL
         RETURNING user_id`,
        [keyFields.api_key, keyFields.api_key_encrypted, keyFields.api_key_iv, userId],
      );
      if (written.rows.length > 0) settingsMigrated++;
    }

    // Top-level migrated/skipped are the totals across both tables (the
    // pre-existing response shape, and what the UI reports); `tables` breaks
    // them down for anyone debugging which store still holds plaintext.
    const migrated = configsMigrated + settingsMigrated;
    return Response.json(
      {
        migrated,
        skipped: (configsTotal + settingsTotal) - migrated,
        encryptionConfigured: true,
        tables: {
          provider_configs: { migrated: configsMigrated, skipped: configsTotal - configsMigrated },
          settings: { migrated: settingsMigrated, skipped: settingsTotal - settingsMigrated },
        },
      },
      { headers: corsHeaders },
    );
  }

  // PUT /provider-configs/:id — update a config
  const updateMatch = path.match(/\/provider-configs\/([^/]+)$/);
  if (updateMatch && method === "PUT" && !path.includes("/activate")) {
    // Probe before the RETURNING clause below, which always references the
    // encrypted columns regardless of which fields this request updates —
    // see provider_key.ts's assertProviderConfigEncryptionMigrated header
    // comment.
    await assertProviderConfigEncryptionMigrated(sql);
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
    const { value: resolvedKey, status: updatedKeyStatus } = await resolveForDisplay(updated);
    updated.api_key = maskKey(resolvedKey);
    updated.key_status = updatedKeyStatus;
    delete updated.api_key_encrypted;
    delete updated.api_key_iv;
    return Response.json(updated, { headers: corsHeaders });
  }

  // PUT /provider-configs/:id/activate — set as active (deactivates others).
  // Delegates to activateDevxProviderConfig (agent_model_selection.ts) so
  // this route and PUT /agent-model-selection/devx share the exact same
  // is_active / devx.settings / agent_model_selection write sequence and can
  // never drift apart — see that function's header comment.
  const activateMatch = path.match(/\/provider-configs\/([^/]+)\/activate$/);
  if (activateMatch && method === "PUT") {
    const configId = activateMatch[1];
    try {
      const activated = await activateDevxProviderConfig(userId, configId, sql);
      return Response.json({ ok: true, active: { ...activated, is_active: true } }, { headers: corsHeaders });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "provider config not found") {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      throw err;
    }
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
