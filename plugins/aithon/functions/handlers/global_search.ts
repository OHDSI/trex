// @ts-nocheck - Deno edge function

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import { validateDatasetId, toQualifiedSchema, toQualifiedMetaSchema, escapeString } from "../sql_safety.ts";

const MAX_PER_TABLE = 20;
const MAX_TOTAL = 100;

/**
 * Build the search SQL for a single resource table.
 * Uses ILIKE on CAST(_raw AS VARCHAR) with an escaped literal (no parameterised
 * queries in this driver — mirrors the escapeString pattern used throughout).
 */
export function buildGlobalSearchSql(schema: string, tableName: string, q: string): string {
  const escaped = escapeString(q);
  return `SELECT _raw FROM ${schema}."${tableName}" WHERE CAST(_raw AS VARCHAR) ILIKE '%${escaped}%' AND _is_deleted = false LIMIT ${MAX_PER_TABLE}`;
}

/**
 * GET /{datasetId}/$global-search?q=<term>
 * Returns a FHIR searchset Bundle of matches across ALL resource tables in the dataset.
 */
export async function globalSearch(
  datasetId: string,
  q: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  // Empty query → empty Bundle
  if (!q || q.trim() === "") {
    return Response.json(
      { resourceType: "Bundle", type: "searchset", total: 0, entry: [] },
      { headers: { "content-type": "application/fhir+json" } },
    );
  }

  // Validate the dataset exists
  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const existsSql = `SELECT id FROM ${metaSchema}._datasets WHERE id = '${escapeString(datasetId)}'`;
  const existsRows = await conn.query(existsSql);
  if (existsRows.length === 0) {
    throw FhirError.notFound(`Dataset '${datasetId}' not found`);
  }

  const schema = toQualifiedSchema(state.dbName, datasetId);

  // List all non-internal tables in this dataset's schema (same as counts)
  const schemaName = datasetId.replaceAll("-", "_");
  const listSql = `SELECT table_name FROM information_schema.tables WHERE table_schema = '${escapeString(schemaName)}' AND table_name NOT LIKE '\\_%'`;
  let tableRows: any[];
  try {
    tableRows = await conn.query(listSql);
  } catch (e) {
    console.error(`[fhir] $global-search list tables failed: ${String(e)}`);
    return Response.json(
      { resourceType: "Bundle", type: "searchset", total: 0, entry: [] },
      { headers: { "content-type": "application/fhir+json" } },
    );
  }

  const entry: unknown[] = [];

  for (const row of tableRows) {
    if (entry.length >= MAX_TOTAL) break;

    const tableName: string = row.table_name ?? row.column0 ?? "";
    if (!tableName) continue;

    const sql = buildGlobalSearchSql(schema, tableName, q);
    let rows: any[];
    try {
      rows = await conn.query(sql);
    } catch (e) {
      console.error(`[fhir] $global-search query failed for ${tableName}: ${String(e)}`);
      continue;
    }

    for (const r of rows) {
      if (entry.length >= MAX_TOTAL) break;
      const rawJson: string = r._raw ?? r.column0 ?? "";
      if (!rawJson) continue;
      let resource: Record<string, unknown>;
      try {
        resource = JSON.parse(rawJson);
      } catch {
        continue;
      }
      const rt = typeof resource["resourceType"] === "string" ? resource["resourceType"] : tableName;
      const id = typeof resource["id"] === "string" ? resource["id"] : "";
      entry.push({
        fullUrl: `${rt}/${id}`,
        resource,
        search: { mode: "match" },
      });
    }
  }

  return new Response(
    JSON.stringify({ resourceType: "Bundle", type: "searchset", total: entry.length, entry }),
    { status: 200, headers: { "Content-Type": "application/fhir+json" } },
  );
}
