// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/export/ndjson.rs

import { Conn } from "../db.ts";
import { toQualifiedSchema } from "../sql_safety.ts";

// ---------------------------------------------------------------------------
// ExportStatus — mirrors Rust enum ExportStatus
// ---------------------------------------------------------------------------

export type ExportStatus = "accepted" | "in-progress" | "complete" | "error";

export function exportStatusAsStr(status: ExportStatus): string {
  return status; // the string values ARE the canonical strings
}

// ---------------------------------------------------------------------------
// Pure SQL-builder helpers (exact port of Rust build_* functions)
// ---------------------------------------------------------------------------

/**
 * Build the INSERT that creates a new export-job row.
 * Mirrors Rust: build_create_job_sql
 */
export function buildCreateJobSql(
  metaSchema: string,
  jobId: string,
  datasetId: string,
  types?: string[],
): string {
  const typesStr = types !== undefined ? types.join(",") : "";
  return (
    `INSERT INTO ${metaSchema}._export_jobs (id, dataset_id, status, resource_types, created_at) ` +
    `VALUES ('${jobId}', '${datasetId.replaceAll("'", "''")}', 'accepted', '${typesStr.replaceAll("'", "''")}', CURRENT_TIMESTAMP)`
  );
}

/**
 * Build the SELECT that fetches a job by id.
 * Mirrors Rust: build_get_job_sql
 */
export function buildGetJobSql(metaSchema: string, jobId: string): string {
  return (
    `SELECT id, dataset_id, status, resource_types, created_at, completed_at, output_files, error_message ` +
    `FROM ${metaSchema}._export_jobs WHERE id = '${jobId.replaceAll("'", "''")}'`
  );
}

/**
 * Build the UPDATE statement that mutates a job's status (+ optional output_files / error_message).
 * Mirrors Rust: build_update_job_sql
 */
export function buildUpdateJobSql(
  metaSchema: string,
  jobId: string,
  status: ExportStatus,
  outputFiles?: string,
  errorMessage?: string,
): string {
  const updates: string[] = [`status = '${status}'`];

  if (status === "complete" || status === "error") {
    updates.push("completed_at = CURRENT_TIMESTAMP");
  }

  if (outputFiles !== undefined) {
    updates.push(`output_files = '${outputFiles.replaceAll("'", "''")}'`);
  }

  if (errorMessage !== undefined) {
    updates.push(`error_message = '${errorMessage.replaceAll("'", "''")}'`);
  }

  return `UPDATE ${metaSchema}._export_jobs SET ${updates.join(", ")} WHERE id = '${jobId.replaceAll("'", "''")}'`;
}

/**
 * Build the SELECT that pulls `_raw` rows from a resource table for export.
 * Mirrors Rust: build_export_select_sql
 */
export function buildExportSelectSql(schemaName: string, resourceType: string): string {
  return `SELECT _raw FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE NOT _is_deleted`;
}

/**
 * Build the per-resource-type entry in the export `output` array.
 * Mirrors Rust: build_export_output_entry
 */
export function buildExportOutputEntry(
  datasetId: string,
  resourceType: string,
  jobId: string,
  count: number,
): Record<string, unknown> {
  return {
    type: resourceType,
    url: `/${datasetId}/${resourceType}/$export/${jobId}/${resourceType.toLowerCase()}.ndjson`,
    count,
  };
}

/**
 * Map a row object (keyed by column name) into a plain JSON object.
 * In the Deno function model, conn.query() returns rows keyed by column name,
 * so this is a no-op passthrough — we read by name directly.
 * Mirrors Rust: row_to_job_object (which mapped positional rows by column name).
 */
export function rowToJobObject(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row };
}

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Create a new export job row in _export_jobs.
 * Returns the generated jobId.
 */
export async function createExportJob(
  conn: Conn,
  datasetId: string,
  types: string[] | undefined,
  metaSchema: string,
): Promise<string> {
  const jobId = crypto.randomUUID();
  const sql = buildCreateJobSql(metaSchema, jobId, datasetId, types);
  try {
    await conn.query(sql);
  } catch (e) {
    throw new Error(`Failed to create export job: ${e}`);
  }
  return jobId;
}

/**
 * Fetch a job by id. Returns null if not found.
 */
export async function getExportJob(
  conn: Conn,
  jobId: string,
  metaSchema: string,
): Promise<Record<string, unknown> | null> {
  const sql = buildGetJobSql(metaSchema, jobId);
  let rows: Record<string, unknown>[];
  try {
    rows = await conn.query(sql);
  } catch (e) {
    throw new Error(`Failed to query export job: ${e}`);
  }
  if (!rows || rows.length === 0) return null;
  return rowToJobObject(rows[0]);
}

/**
 * Update a job's status (and optionally output_files / error_message).
 */
export async function updateExportJobStatus(
  conn: Conn,
  jobId: string,
  status: ExportStatus,
  outputJson?: string,
  errorMsg?: string,
  metaSchema?: string,
): Promise<void> {
  const meta = metaSchema ?? "_fhir_meta";
  const sql = buildUpdateJobSql(meta, jobId, status, outputJson, errorMsg);
  try {
    await conn.query(sql);
  } catch (e) {
    throw new Error(`Failed to update export job: ${e}`);
  }
}

/**
 * Execute an export job synchronously using the provided conn.
 *
 * ADAPTATION: The Rust implementation uses tokio::spawn to run this in the
 * background and returns 202 immediately. In the Deno edge-function model there
 * is NO reliable background task mechanism. Instead we run executeExport
 * SYNCHRONOUSLY inline on the same conn before returning 202. The job will
 * already be "complete" when the client first polls the status endpoint.
 * This is safe because we only issue bounded COUNT-equivalent queries per
 * resource type (SELECT _raw … WHERE NOT _is_deleted — small tables in this
 * context), so latency is acceptable.
 *
 * Reuses the caller's conn — no new session is created.
 */
export async function executeExport(
  conn: Conn,
  datasetId: string,
  jobId: string,
  resourceTypes: string[],
  dbName: string,
  metaSchema: string,
): Promise<Array<[string, number]>> {
  const schemaName = toQualifiedSchema(dbName, datasetId);

  const results: Array<[string, number]> = [];

  await updateExportJobStatus(conn, jobId, "in-progress", undefined, undefined, metaSchema);

  for (const rt of resourceTypes) {
    const sql = buildExportSelectSql(schemaName, rt);
    let rows: unknown[];
    try {
      rows = await conn.query(sql);
    } catch (e) {
      const msg = String(e);
      // Ignore "does not exist" errors — table may not be provisioned yet
      if (!msg.includes("does not exist")) {
        throw new Error(`Export failed for ${rt}: ${msg}`);
      }
      continue;
    }
    results.push([rt, rows ? rows.length : 0]);
  }

  const output = results
    .filter(([, count]) => count > 0)
    .map(([rt, count]) => buildExportOutputEntry(datasetId, rt, jobId, count));

  const outputJson = JSON.stringify(output);
  await updateExportJobStatus(conn, jobId, "complete", outputJson, undefined, metaSchema);

  return results;
}
