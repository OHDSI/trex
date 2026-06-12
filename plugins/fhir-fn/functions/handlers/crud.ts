// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/crud.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import {
  validateDatasetId,
  validateResourceType,
  validateFhirId,
  toQualifiedSchema,
} from "../sql_safety.ts";
import { ResourceRegistry } from "../fhir/resource_registry.ts";
import {
  buildInsertSql,
  buildUpdateSql,
} from "../schema/sql_builder.ts";

// ---------------------------------------------------------------------------
// Pure helpers (port of crud.rs pure fns, exact SQL strings)
// ---------------------------------------------------------------------------

/**
 * Stamp `id` and `meta` (`versionId`, `lastUpdated`) onto a FHIR resource JSON object.
 * No-op if `resource` is not a plain object.
 * Mirrors Rust: stamp_resource_meta
 */
export function stampResourceMeta(
  resource: Record<string, unknown>,
  id: string,
  version: number,
  now: string,
): void {
  if (resource !== null && typeof resource === "object" && !Array.isArray(resource)) {
    resource["id"] = id;
    resource["meta"] = {
      versionId: String(version),
      lastUpdated: now,
    };
  }
}

/**
 * Extract a numeric version from an If-Match ETag like `W/"3"` or `"3"`.
 * Returns undefined if the string doesn't parse to a non-negative integer.
 * Mirrors Rust: parse_if_match_etag
 */
export function parseIfMatchEtag(etag: string): number | undefined {
  // Rust: etag.trim_matches('"').trim_start_matches("W/\"").trim_end_matches('"').parse::<i64>()
  let s = etag;
  // trim_matches('"') removes leading and trailing '"' chars
  s = s.replace(/^"+/, "").replace(/"+$/, "");
  // trim_start_matches("W/\"") removes the literal prefix W/" if present
  if (s.startsWith('W/"')) {
    s = s.slice(3);
  }
  // trim_end_matches('"') removes trailing '"'
  s = s.replace(/"+$/, "");
  const n = parseInt(s, 10);
  if (isNaN(n) || String(n) !== s) return undefined;
  return n;
}

/**
 * Classify a DB error string as "table missing" → NotFound or "other" → Internal.
 * Mirrors Rust: map_table_or_internal_error
 */
export function mapTableOrInternalError(
  msg: string,
  resourceType: string,
  datasetId: string,
  internalLabel: string,
): FhirError {
  if (msg.includes("does not exist") || msg.includes("Table")) {
    return FhirError.notFound(
      `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
    );
  }
  return FhirError.internal(internalLabel);
}

/**
 * Build the SELECT used by readResource to fetch the current version + tombstone.
 * Mirrors Rust: build_read_sql (exact SQL byte-identical)
 */
export function buildReadSql(
  schemaName: string,
  resourceType: string,
  resourceId: string,
): string {
  return `SELECT _raw, _is_deleted::VARCHAR, _version_id::VARCHAR FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = '${resourceId.replaceAll("'", "''")}'`;
}

/**
 * Build the SELECT used by updateResource to check whether a resource exists + current version.
 * Mirrors Rust: build_check_version_sql (exact SQL byte-identical)
 */
export function buildCheckVersionSql(
  schemaName: string,
  resourceType: string,
  resourceId: string,
): string {
  return `SELECT _version_id::VARCHAR, _raw FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = '${resourceId.replaceAll("'", "''")}'`;
}

/**
 * Build the parameterized INSERT into `_history` for the version we are about to supersede.
 * Mirrors Rust: build_history_insert_sql (exact SQL byte-identical)
 */
export function buildHistoryInsertSql(schemaName: string, currentVersion: number): string {
  return `INSERT INTO ${schemaName}._history (_id, _resource_type, _version_id, _last_updated, _raw, _is_deleted) VALUES ($1, $2, ${currentVersion}, CURRENT_TIMESTAMP, $3, false)`;
}

/**
 * Build the soft-delete UPDATE statement used by deleteResource.
 * Mirrors Rust: build_soft_delete_sql (exact SQL byte-identical)
 */
export function buildSoftDeleteSql(
  schemaName: string,
  resourceType: string,
  newVersion: number,
): string {
  return `UPDATE ${schemaName}."${resourceType.toLowerCase()}" SET _is_deleted = true, _version_id = ${newVersion}, _last_updated = CURRENT_TIMESTAMP WHERE _id = $1`;
}

/**
 * Parse a check-version row into [version, rawJson].
 * Returns defaults if the row is malformed.
 * Mirrors Rust: parse_check_row
 */
export function parseCheckRow(row: unknown[]): [number, string] {
  const v = (() => {
    const cell = row[0];
    if (typeof cell === "string") {
      const n = parseInt(cell, 10);
      if (!isNaN(n)) return n;
    }
    return 1;
  })();
  const raw = (() => {
    const cell = row[1];
    if (typeof cell === "string") return cell;
    return "{}";
  })();
  return [v, raw];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function createResource(
  datasetId: string,
  resourceType: string,
  body: any,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);

  const id = crypto.randomUUID();
  const schemaName = toQualifiedSchema(state.dbName, datasetId);
  const tableName = ResourceRegistry.tableName(resourceType);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const resource = typeof body === "object" && body !== null ? { ...body } : {};
  stampResourceMeta(resource, id, 1, now);

  let rawJson: string;
  try {
    rawJson = JSON.stringify(resource);
  } catch (e) {
    throw FhirError.internal(`JSON serialize: ${e}`);
  }

  let transformSpec: string;
  let columnNames: string[];
  try {
    transformSpec = state.registry.getJsonTransform(resourceType);
    columnNames = state.registry.getColumnNames(resourceType);
  } catch (e) {
    throw FhirError.internal(`Transform spec: ${e}`);
  }

  const insertSql = buildInsertSql(schemaName, tableName, 1, transformSpec, columnNames);

  try {
    await conn.query(insertSql, [id, rawJson]);
  } catch (e) {
    const msg = String(e);
    console.error(`[fhir] INSERT error for ${datasetId}.${resourceType}: ${msg}`);
    if (msg.includes("does not exist") || msg.includes("Table")) {
      throw FhirError.notFound(
        `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
      );
    }
    throw FhirError.internal("Failed to create resource");
  }

  const location = `/${datasetId}/${resourceType}/${id}`;

  return new Response(JSON.stringify(resource), {
    status: 201,
    headers: {
      "Content-Type": "application/fhir+json",
      "Location": location,
      "ETag": 'W/"1"',
    },
  });
}

export async function readResource(
  datasetId: string,
  resourceType: string,
  id: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);
  validateFhirId(id);

  const schemaName = toQualifiedSchema(state.dbName, datasetId);
  const sql = buildReadSql(schemaName, resourceType, id);

  let rows: any[];
  try {
    rows = await conn.query(sql);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("does not exist") || msg.includes("not found") || msg.includes("Table")) {
      throw FhirError.notFound(
        `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
      );
    }
    console.error(`[fhir] Failed to read resource: ${msg}`);
    throw FhirError.internal("Failed to read resource");
  }

  if (!rows || rows.length === 0) {
    throw FhirError.notFound(`${resourceType}/${id} not found`);
  }

  const row = rows[0];
  // columns: _raw (0), _is_deleted (1), _version_id (2)
  // conn.query returns array of objects — access by column name
  const rawJson: string = row._raw ?? row.column0 ?? "{}";
  const isDeletedStr: string = row._is_deleted ?? row.column1 ?? "false";
  const versionId: string = row._version_id ?? row.column2 ?? "1";

  const isDeleted = isDeletedStr === "true";

  if (isDeleted) {
    throw FhirError.gone(`${resourceType}/${id} has been deleted`);
  }

  let resource: unknown;
  try {
    resource = JSON.parse(rawJson);
  } catch (e) {
    throw FhirError.internal(`JSON parse: ${e}`);
  }

  return new Response(JSON.stringify(resource), {
    status: 200,
    headers: {
      "Content-Type": "application/fhir+json",
      "ETag": `W/"${versionId}"`,
    },
  });
}

export async function updateResource(
  datasetId: string,
  resourceType: string,
  id: string,
  body: any,
  ifMatch: string | null,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);
  validateFhirId(id);

  const schemaName = toQualifiedSchema(state.dbName, datasetId);
  const tableName = ResourceRegistry.tableName(resourceType);

  // BEGIN/COMMIT around the read-modify-write sequence prevents version races
  try {
    await conn.query("BEGIN TRANSACTION");
  } catch (e) {
    console.error(`[fhir] Failed to begin transaction: ${e}`);
    throw FhirError.internal("Failed to begin transaction");
  }

  const checkSql = buildCheckVersionSql(schemaName, resourceType, id);

  let currentVersion: number;
  let isNew: boolean;
  let currentRaw: string;

  try {
    const rows = await conn.query(checkSql);
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
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    const msg = String(e);
    if (msg.includes("does not exist") || msg.includes("Table")) {
      throw FhirError.notFound(
        `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
      );
    }
    console.error(`[fhir] Failed to check resource: ${msg}`);
    throw FhirError.internal("Failed to check resource");
  }

  // Optimistic concurrency: If-Match header
  if (ifMatch !== null && ifMatch !== undefined) {
    const expected = parseIfMatchEtag(ifMatch);
    if (expected !== undefined) {
      if (!isNew && expected !== currentVersion) {
        try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
        throw FhirError.conflict(
          `Version conflict: expected ${expected}, current ${currentVersion}`,
        );
      }
    }
  }

  const newVersion = currentVersion + 1;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const resource = typeof body === "object" && body !== null ? { ...body } : {};
  stampResourceMeta(resource, id, newVersion, now);

  let rawJson: string;
  try {
    rawJson = JSON.stringify(resource);
  } catch (e) {
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    throw FhirError.internal(`JSON serialize: ${e}`);
  }

  // Write current version into _history (only when updating an existing resource)
  if (!isNew) {
    const historySql = buildHistoryInsertSql(schemaName, currentVersion);
    try {
      await conn.query(historySql, [id, resourceType, currentRaw]);
    } catch (e) {
      try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
      console.error(`[fhir] WARNING: history write failed for ${resourceType}/${id}: ${e}`);
      throw FhirError.internal("Failed to write history");
    }
  }

  let transformSpec: string;
  let columnNames: string[];
  try {
    transformSpec = state.registry.getJsonTransform(resourceType);
    columnNames = state.registry.getColumnNames(resourceType);
  } catch (e) {
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    throw FhirError.internal(`Transform spec: ${e}`);
  }

  const sql = isNew
    ? buildInsertSql(schemaName, tableName, newVersion, transformSpec, columnNames)
    : buildUpdateSql(schemaName, tableName, newVersion, transformSpec, columnNames);

  try {
    await conn.query(sql, [id, rawJson]);
  } catch (e) {
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    console.error(`[fhir] Failed to update resource: ${e}`);
    throw FhirError.internal("Failed to update resource");
  }

  try {
    await conn.query("COMMIT");
  } catch (e) {
    console.error(`[fhir] Failed to commit update transaction: ${e}`);
    throw FhirError.internal("Failed to commit transaction");
  }

  const status = isNew ? 201 : 200;

  return new Response(JSON.stringify(resource), {
    status,
    headers: {
      "Content-Type": "application/fhir+json",
      "ETag": `W/"${newVersion}"`,
    },
  });
}

export async function deleteResource(
  datasetId: string,
  resourceType: string,
  id: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);
  validateFhirId(id);

  const schemaName = toQualifiedSchema(state.dbName, datasetId);

  // BEGIN/COMMIT around the read-modify-write sequence prevents version races
  try {
    await conn.query("BEGIN TRANSACTION");
  } catch (e) {
    console.error(`[fhir] Failed to begin transaction: ${e}`);
    throw FhirError.internal("Failed to begin transaction");
  }

  // Select only non-deleted rows (AND NOT _is_deleted)
  const checkSql = `SELECT _version_id::VARCHAR, _raw FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = '${id.replaceAll("'", "''")}' AND NOT _is_deleted`;

  let currentVersion: number;
  let currentRaw: string;

  try {
    const rows = await conn.query(checkSql);
    if (!rows || rows.length === 0) {
      try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
      throw FhirError.notFound(`${resourceType}/${id} not found`);
    }
    const row = rows[0];
    // parse_check_row equivalently
    const vStr: string = row._version_id ?? row.column0 ?? "1";
    const rawStr: string = row._raw ?? row.column1 ?? "{}";
    const n = parseInt(vStr, 10);
    currentVersion = isNaN(n) ? 1 : n;
    currentRaw = rawStr;
  } catch (e) {
    if (e instanceof FhirError) throw e;
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    const msg = String(e);
    if (msg.includes("does not exist") || msg.includes("Table")) {
      throw FhirError.notFound(
        `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
      );
    }
    console.error(`[fhir] Failed to check resource: ${msg}`);
    throw FhirError.internal("Failed to check resource");
  }

  const newVersion = currentVersion + 1;

  const historySql = buildHistoryInsertSql(schemaName, currentVersion);
  try {
    await conn.query(historySql, [id, resourceType, currentRaw]);
  } catch (e) {
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    console.error(`[fhir] WARNING: history write failed for ${resourceType}/${id}: ${e}`);
    throw FhirError.internal("Failed to write history");
  }

  const deleteSql = buildSoftDeleteSql(schemaName, resourceType, newVersion);
  try {
    await conn.query(deleteSql, [id]);
  } catch (e) {
    try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
    console.error(`[fhir] Failed to delete resource: ${e}`);
    throw FhirError.internal("Failed to delete resource");
  }

  try {
    await conn.query("COMMIT");
  } catch (e) {
    console.error(`[fhir] Failed to commit delete transaction: ${e}`);
    throw FhirError.internal("Failed to commit transaction");
  }

  return new Response(null, { status: 204 });
}
