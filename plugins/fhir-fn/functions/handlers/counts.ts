// @ts-nocheck - Deno edge function

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import { validateDatasetId, toQualifiedSchema, toQualifiedMetaSchema, escapeString } from "../sql_safety.ts";

/**
 * Build the SQL that lists non-internal table names in a dataset's schema.
 * We query information_schema.tables filtered to the dataset schema, excluding
 * tables whose name starts with "_".
 */
export function buildListTablesSql(dbName: string, datasetId: string): string {
  // The schema name is derived by replacing hyphens with underscores (mirrors toQualifiedSchema logic).
  const schemaName = datasetId.replaceAll("-", "_");
  return `SELECT table_name FROM information_schema.tables WHERE table_schema = '${escapeString(schemaName)}' AND table_name NOT LIKE '\\_%'`;
}

/**
 * Build a COUNT query for non-deleted rows in a resource table.
 */
export function buildCountSql(schema: string, tableName: string): string {
  return `SELECT COUNT(*)::VARCHAR AS cnt FROM ${schema}."${tableName}" WHERE NOT _is_deleted`;
}

/**
 * GET /{datasetId}/$counts — return per-resource-type counts of non-deleted resources.
 * Only types with count > 0 and a known resourceType mapping are included.
 */
export async function getCounts(
  datasetId: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  // Validate the dataset exists
  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const existsSql = `SELECT id FROM ${metaSchema}._datasets WHERE id = '${escapeString(datasetId)}'`;
  const existsRows = await conn.query(existsSql);
  if (existsRows.length === 0) {
    throw FhirError.notFound(`Dataset '${datasetId}' not found`);
  }

  const schema = toQualifiedSchema(state.dbName, datasetId);

  // List all non-internal tables in this dataset's schema
  const listSql = buildListTablesSql(state.dbName, datasetId);
  let tableRows: any[];
  try {
    tableRows = await conn.query(listSql);
  } catch (e) {
    // Schema might not exist yet (no resources created)
    console.error(`[fhir] $counts list tables failed: ${String(e)}`);
    return Response.json({ counts: {} }, { headers: { "content-type": "application/fhir+json" } });
  }

  // Build lowercase→canonical resourceType map from registry
  const allTypes = state.registry.listResourceTypes();
  const lowerToCanonical = new Map<string, string>();
  for (const rt of allTypes) {
    lowerToCanonical.set(rt.toLowerCase(), rt);
  }

  const counts: Record<string, number> = {};

  for (const row of tableRows) {
    const tableName: string = row.table_name ?? row.column0 ?? "";
    if (!tableName) continue;

    // Map lowercase table name → canonical resource type
    const canonical = lowerToCanonical.get(tableName.toLowerCase());
    if (!canonical) continue; // not a known resource type table

    // Count non-deleted rows
    const countSql = buildCountSql(schema, tableName);
    try {
      const countRows = await conn.query(countSql);
      const firstRow = countRows?.[0];
      if (firstRow !== undefined) {
        const cntVal = firstRow.cnt ?? firstRow.column0 ?? "0";
        const n = parseInt(String(cntVal), 10);
        if (!isNaN(n) && n > 0) {
          counts[canonical] = n;
        }
      }
    } catch (e) {
      // Skip tables that error (shouldn't happen but be resilient)
      console.error(`[fhir] $counts count failed for ${tableName}: ${String(e)}`);
    }
  }

  return new Response(JSON.stringify({ counts }), {
    status: 200,
    headers: { "content-type": "application/fhir+json" },
  });
}
