// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/history.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import {
  validateDatasetId,
  validateResourceType,
  validateFhirId,
  validateVersionId,
  toQualifiedSchema,
} from "../sql_safety.ts";

// ---------------------------------------------------------------------------
// Pure helpers (port of history.rs pure fns, exact SQL strings)
// ---------------------------------------------------------------------------

/**
 * Build the SELECT that pulls history rows for one resource (newest version first).
 * Mirrors Rust: build_history_sql (exact SQL byte-identical)
 */
export function buildHistorySql(
  schemaName: string,
  resourceType: string,
  resourceId: string,
): string {
  return `SELECT _version_id::VARCHAR, _last_updated::VARCHAR, _raw, _is_deleted::VARCHAR FROM ${schemaName}._history WHERE _id = '${resourceId.replaceAll("'", "''")}' AND _resource_type = '${resourceType.replaceAll("'", "''")}' ORDER BY _version_id DESC`;
}

/**
 * Build the SELECT that pulls the current version of one resource from its table.
 * Mirrors Rust: build_current_version_sql (exact SQL byte-identical)
 */
export function buildCurrentVersionSql(
  schemaName: string,
  resourceType: string,
  resourceId: string,
): string {
  return `SELECT _version_id::VARCHAR, _last_updated::VARCHAR, _raw, _is_deleted::VARCHAR FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = '${resourceId.replaceAll("'", "''")}'`;
}

/**
 * Build a single history bundle entry from a row of (version_id, _, _raw, _is_deleted).
 * Returns undefined if `_raw` is not parseable JSON.
 * Mirrors Rust: build_history_entry
 */
export function buildHistoryEntry(
  datasetId: string,
  resourceType: string,
  resourceId: string,
  version: string,
  raw: string,
  isDeleted: boolean,
): Record<string, unknown> | undefined {
  let resource: unknown;
  try {
    resource = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const method = isDeleted ? "DELETE" : "PUT";
  return {
    fullUrl: `/${datasetId}/${resourceType}/${resourceId}`,
    resource,
    request: {
      method,
      url: `${resourceType}/${resourceId}`,
    },
    response: {
      status: "200",
      etag: `W/"${version}"`,
    },
  };
}

/**
 * Build the final Bundle wrapping an array of history entries.
 * Mirrors Rust: build_history_bundle
 */
export function buildHistoryBundle(entries: Record<string, unknown>[]): Record<string, unknown> {
  return {
    resourceType: "Bundle",
    type: "history",
    total: entries.length,
    entry: entries,
  };
}

/**
 * Build the SELECT that fetches a specific historical version row from `_history`.
 * Mirrors Rust: build_history_version_sql (exact SQL byte-identical)
 */
export function buildHistoryVersionSql(
  schemaName: string,
  resourceType: string,
  resourceId: string,
  versionId: string,
): string {
  return `SELECT _raw FROM ${schemaName}._history WHERE _id = '${resourceId.replaceAll("'", "''")}' AND _resource_type = '${resourceType.replaceAll("'", "''")}' AND _version_id = ${versionId}`;
}

/**
 * Build the SELECT that fetches a specific version row from the current resource table.
 * Used as a fallback when the row isn't in `_history` yet (it's the live version).
 * Mirrors Rust: build_current_version_by_id_sql (exact SQL byte-identical)
 */
export function buildCurrentVersionByIdSql(
  schemaName: string,
  resourceType: string,
  resourceId: string,
  versionId: string,
): string {
  return `SELECT _raw FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = '${resourceId.replaceAll("'", "''")}' AND _version_id = ${versionId}`;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /{ds}/{rt}/{id}/_history  -> history Bundle (type "history")
 */
export async function resourceHistory(
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

  const currentSql = buildCurrentVersionSql(schemaName, resourceType, id);
  const historySql = buildHistorySql(schemaName, resourceType, id);

  const entries: Record<string, unknown>[] = [];

  // First: fetch current version row from the live table
  let currentRows: any[];
  try {
    currentRows = await conn.query(currentSql);
  } catch (e) {
    console.error(`[fhir] Failed to read current version for history: ${e}`);
    throw FhirError.internal("Failed to read current version");
  }

  for (const row of currentRows ?? []) {
    // Columns: _version_id (0), _last_updated (1), _raw (2), _is_deleted (3)
    // conn.query returns objects keyed by column name
    const raw: string = row._raw ?? "{}";
    const version: string = row._version_id ?? "1";
    const isDeletedStr: string = row._is_deleted ?? "false";
    const isDeleted = isDeletedStr === "true";
    const entry = buildHistoryEntry(datasetId, resourceType, id, version, raw, isDeleted);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }

  // Second: fetch historical rows from _history table (already ordered DESC)
  let historyRows: any[];
  try {
    historyRows = await conn.query(historySql);
  } catch (e) {
    console.error(`[fhir] Failed to read history rows: ${e}`);
    throw FhirError.internal("Failed to read history");
  }

  for (const row of historyRows ?? []) {
    // Columns: _version_id (0), _last_updated (1), _raw (2), _is_deleted (3)
    const raw: string = row._raw ?? "{}";
    const version: string = row._version_id ?? "1";
    // history rows are always non-deleted (soft-delete writes to live table)
    const entry = buildHistoryEntry(datasetId, resourceType, id, version, raw, false);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }

  return new Response(JSON.stringify(buildHistoryBundle(entries)), {
    status: 200,
    headers: { "Content-Type": "application/fhir+json" },
  });
}

/**
 * GET /{ds}/{rt}/{id}/_history/{versionId} -> the specific version resource
 */
export async function readResourceVersion(
  datasetId: string,
  resourceType: string,
  id: string,
  versionId: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);
  validateFhirId(id);
  validateVersionId(versionId);

  const schemaName = toQualifiedSchema(state.dbName, datasetId);

  const historySql = buildHistoryVersionSql(schemaName, resourceType, id, versionId);

  let historyRows: any[];
  try {
    historyRows = await conn.query(historySql);
  } catch (e) {
    console.error(`[fhir] Failed to read version: ${e}`);
    throw FhirError.internal("Failed to read version");
  }

  if (historyRows && historyRows.length > 0) {
    // Found in _history table
    const raw: string = historyRows[0]._raw ?? "{}";
    let resource: unknown;
    try {
      resource = JSON.parse(raw);
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

  // Not in _history — try the current (live) table as fallback
  const currentSql = buildCurrentVersionByIdSql(schemaName, resourceType, id, versionId);

  let currentRows: any[];
  try {
    currentRows = await conn.query(currentSql);
  } catch (e) {
    console.error(`[fhir] Failed to read current version: ${e}`);
    throw FhirError.internal("Failed to read version");
  }

  if (currentRows && currentRows.length > 0) {
    const raw: string = currentRows[0]._raw ?? "{}";
    let resource: unknown;
    try {
      resource = JSON.parse(raw);
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

  throw FhirError.notFound(
    `Version ${versionId} of ${resourceType}/${id} not found`,
  );
}
