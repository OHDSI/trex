// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/metadata.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import { validateDatasetId, toQualifiedMetaSchema } from "../sql_safety.ts";
import { buildCapabilityStatement } from "../fhir/capability.ts";

/**
 * Build the SELECT that checks whether a dataset row exists by id in `_datasets`.
 * Mirrors Rust: format!("SELECT id FROM {}._datasets WHERE id = '{}'", meta_schema, dataset_id.replace('\'', "''"))
 */
export function buildDatasetExistsSql(metaSchema: string, datasetId: string): string {
  return `SELECT id FROM ${metaSchema}._datasets WHERE id = '${datasetId.replaceAll("'", "''")}'`;
}

/**
 * GET /{datasetId}/metadata — return a CapabilityStatement for the dataset.
 * Mirrors Rust get_metadata:
 *   1. validateDatasetId (throws FhirError.badRequest on failure)
 *   2. Check the dataset exists in _datasets; 404 if not
 *   3. Build and return the CapabilityStatement
 */
export async function getMetadata(
  datasetId: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const sql = buildDatasetExistsSql(metaSchema, datasetId);
  const rows = await conn.query(sql);

  if (rows.length === 0) {
    throw FhirError.notFound(`Dataset '${datasetId}' not found`);
  }

  const cs = buildCapabilityStatement(state.registry, state.searchParams, datasetId);
  return Response.json(cs);
}
