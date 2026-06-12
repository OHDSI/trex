// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/upsert.rs

import { Conn } from "../db.ts";
import { AppState } from "../state.ts";
import { ResourceRegistry } from "../fhir/resource_registry.ts";
import { buildInsertSql, buildUpdateSql } from "../schema/sql_builder.ts";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Stamp id and meta (versionId, lastUpdated) on a resource object.
 * No-op if resource is not a plain object.
 * Mirrors Rust: stamp_upsert_meta
 */
export function stampUpsertMeta(resource: any, id: string, version: number, now: string): void {
  if (resource !== null && typeof resource === "object" && !Array.isArray(resource)) {
    resource.id = id;
    resource.meta = {
      versionId: String(version),
      lastUpdated: now,
    };
  }
}

/**
 * Build the parameterized INSERT into `_history` used by the upsert path.
 * Mirrors Rust: build_upsert_history_sql (exact SQL)
 */
export function buildUpsertHistorySql(schema: string, currentVersion: number): string {
  return `INSERT INTO ${schema}._history (_id, _resource_type, _version_id, _last_updated, _raw, _is_deleted) VALUES ($1, $2, ${currentVersion}, CURRENT_TIMESTAMP, $3, false)`;
}

// ---------------------------------------------------------------------------
// UpsertResult
// ---------------------------------------------------------------------------

export interface UpsertResult {
  version: number;
  isNew: boolean;
}

// ---------------------------------------------------------------------------
// upsertResource
// ---------------------------------------------------------------------------

/**
 * Shared upsert logic: reads current version, writes history if existing,
 * stamps meta, then inserts or updates.
 *
 * Does NOT issue BEGIN/COMMIT — the caller (bundle transaction) owns the
 * transaction. This mirrors the Rust upsert_resource_inner behaviour when
 * called with outer_conn = Some(conn) (owns_transaction = false).
 *
 * Mirrors Rust: upsert_resource / upsert_resource_inner
 */
export async function upsertResource(
  conn: Conn,
  state: AppState,
  schemaName: string,
  resourceType: string,
  resourceId: string,
  body: any,
  now: string,
): Promise<UpsertResult> {
  const tableName = ResourceRegistry.tableName(resourceType);

  // --- Check current version (mirrors build_check_version_sql-style SELECT) ---
  const checkSql = `SELECT _version_id::VARCHAR, _raw FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = $1`;

  let currentVersion: number;
  let isNew: boolean;
  let currentRaw: string;

  try {
    const rows = await conn.query(checkSql, [resourceId]);
    if (!rows || rows.length === 0) {
      currentVersion = 0;
      isNew = true;
      currentRaw = "";
    } else {
      const row = rows[0];
      const vStr: string = row._version_id ?? row.column0 ?? "1";
      const n = parseInt(vStr, 10);
      currentVersion = isNaN(n) ? 1 : n;
      currentRaw = row._raw ?? row.column1 ?? "{}";
      isNew = false;
    }
  } catch (e) {
    throw new Error(`Failed to check resource: ${e}`);
  }

  const newVersion = currentVersion + 1;

  // --- Stamp meta onto a deep copy of body ---
  const resource = JSON.parse(JSON.stringify(body));
  stampUpsertMeta(resource, resourceId, newVersion, now);

  let rawJson: string;
  try {
    rawJson = JSON.stringify(resource);
  } catch (e) {
    throw new Error(`JSON serialize: ${e}`);
  }

  // --- Write current version into _history (only when updating existing) ---
  if (!isNew) {
    const historySql = buildUpsertHistorySql(schemaName, currentVersion);
    try {
      await conn.query(historySql, [resourceId, resourceType, currentRaw]);
    } catch (e) {
      throw new Error(`History write failed for ${resourceType}/${resourceId}: ${e}`);
    }
  }

  // --- Insert or update ---
  let transformSpec: string;
  let columnNames: string[];
  try {
    transformSpec = state.registry.getJsonTransform(resourceType);
    columnNames = state.registry.getColumnNames(resourceType);
  } catch (e) {
    throw new Error(`Transform spec: ${e}`);
  }

  const upsertSql = isNew
    ? buildInsertSql(schemaName, tableName, newVersion, transformSpec, columnNames)
    : buildUpdateSql(schemaName, tableName, newVersion, transformSpec, columnNames);

  try {
    await conn.query(upsertSql, [resourceId, rawJson]);
  } catch (e) {
    throw new Error(`Upsert failed: ${e}`);
  }

  return { version: newVersion, isNew };
}
