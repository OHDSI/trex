// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/dataset.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import {
  validateDatasetId,
  toQualifiedMetaSchema,
  toQualifiedSchema,
} from "../sql_safety.ts";
import { buildDatasetExistsSql } from "./metadata.ts";
import { DefinitionRegistry } from "../fhir/structure_definition.ts";
import { generateDdl } from "../schema/generator.ts";

// ---------------------------------------------------------------------------
// Meta schema init (port of init_fhir_meta from lib.rs lines ~34-72)
// ---------------------------------------------------------------------------

export async function initFhirMeta(conn: Conn, dbName: string): Promise<void> {
  const metaSchema = toQualifiedMetaSchema(dbName);

  await conn.query(`CREATE SCHEMA IF NOT EXISTS ${metaSchema}`);

  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${metaSchema}._datasets (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        structure_definitions JSON,
        resource_types VARCHAR[],
        status VARCHAR NOT NULL DEFAULT 'active'
    )`,
  );

  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${metaSchema}._export_jobs (
        id VARCHAR PRIMARY KEY,
        dataset_id VARCHAR NOT NULL,
        resource_types VARCHAR[],
        status VARCHAR NOT NULL DEFAULT 'accepted',
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        completed_at TIMESTAMP,
        output_files JSON,
        error_message VARCHAR
    )`,
  );
}

// ---------------------------------------------------------------------------
// Pure helpers (port of pure fns in dataset.rs, exact SQL strings)
// ---------------------------------------------------------------------------

/**
 * Validate that a create-dataset id contains only alphanumeric and hyphen chars.
 * Throws FhirError.badRequest on failure.
 */
export function validateCreateDatasetId(id: string): void {
  if (id.length === 0 || !/^[a-zA-Z0-9\-]+$/.test(id)) {
    throw FhirError.badRequest(
      "Dataset ID must contain only alphanumeric characters and hyphens",
    );
  }
}

/** Build the DDL that creates the `_history` table inside a dataset schema. */
export function buildHistoryDdl(qualifiedSchema: string): string {
  return `CREATE TABLE IF NOT EXISTS ${qualifiedSchema}._history (
            _id VARCHAR NOT NULL,
            _resource_type VARCHAR NOT NULL,
            _version_id INTEGER NOT NULL,
            _last_updated TIMESTAMP NOT NULL,
            _raw JSON NOT NULL,
            _is_deleted BOOLEAN NOT NULL DEFAULT false,
            PRIMARY KEY (_id, _version_id)
        )`;
}

/** Build the DDL that creates the `_valueset_expansion` table. */
export function buildValuesetExpansionDdl(qualifiedSchema: string): string {
  return `CREATE TABLE IF NOT EXISTS ${qualifiedSchema}._valueset_expansion (
            valueset_url VARCHAR NOT NULL,
            valueset_version VARCHAR,
            code VARCHAR NOT NULL,
            system VARCHAR NOT NULL,
            display VARCHAR
        )`;
}

/**
 * Build the comma-separated SQL list literal of properly-escaped resource type names
 * used inside `INSERT INTO ... _datasets (..., [..])`.
 */
export function buildResourceTypesSqlList(types: string[]): string {
  return types.map((t) => `'${t.replaceAll("'", "''")}'`).join(", ");
}

/** Build the `INSERT INTO ..._datasets` SQL (with `$1`/`$2` placeholders for id/name). */
export function buildInsertDatasetSql(metaSchema: string, resourceTypesSql: string): string {
  return `INSERT INTO ${metaSchema}._datasets (id, name, status, resource_types) VALUES ($1, $2, 'active', [${resourceTypesSql}])`;
}

/** Build the success response body for createDataset. */
export function buildCreateDatasetResponse(
  id: string,
  name: string,
  createdTypes: string[],
  errors: string[],
): Record<string, unknown> {
  const response: Record<string, unknown> = {
    id,
    name,
    status: "active",
    resource_types: createdTypes,
    resource_count: createdTypes.length,
  };
  if (errors.length > 0) {
    response.warnings = errors;
  }
  return response;
}

/** Map (columns, row) into a plain object using column names as keys. */
export function rowToDatasetObject(columns: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    if (i < row.length) {
      obj[columns[i]] = row[i];
    }
  }
  return obj;
}

/**
 * Classify a dataset status string for deleteDataset preconditions.
 * Throws FhirError.conflict if the dataset is busy.
 */
export function checkDatasetDeletable(status: string, datasetId: string): void {
  if (status === "deleting" || status === "exporting") {
    throw FhirError.conflict(
      `Dataset '${datasetId}' has active operations (status: ${status})`,
    );
  }
}

/** Determine whether an INSERT error message indicates a duplicate-key violation. */
export function isDuplicateDatasetError(msg: string): boolean {
  return msg.includes("Duplicate") || msg.includes("duplicate") || msg.includes("UNIQUE");
}

/** Build the SELECT that returns a dataset's columns for get queries. */
export function buildSelectDatasetSql(metaSchema: string, datasetId: string): string {
  return `SELECT id, name, status, created_at, resource_types FROM ${metaSchema}._datasets WHERE id = '${datasetId.replaceAll("'", "''")}'`;
}

/** Build the SELECT used by `deleteDataset` to fetch the status column. */
export function buildSelectDatasetStatusSql(metaSchema: string, datasetId: string): string {
  return `SELECT status FROM ${metaSchema}._datasets WHERE id = '${datasetId.replaceAll("'", "''")}'`;
}

/** Build the UPDATE that marks a dataset row as `status = 'deleting'`. */
export function buildMarkDeletingSql(metaSchema: string, datasetId: string): string {
  return `UPDATE ${metaSchema}._datasets SET status = 'deleting' WHERE id = '${datasetId.replaceAll("'", "''")}'`;
}

/** Build the DROP SCHEMA statement (always with `IF EXISTS ... CASCADE`). */
export function buildDropSchemaSql(qualifiedSchema: string): string {
  return `DROP SCHEMA IF EXISTS ${qualifiedSchema} CASCADE`;
}

/** Build the DELETE from `_datasets` statement. */
export function buildDeleteDatasetRowSql(metaSchema: string, datasetId: string): string {
  return `DELETE FROM ${metaSchema}._datasets WHERE id = '${datasetId.replaceAll("'", "''")}'`;
}

/** Build the UPDATE that appends new resource types to the dataset's `resource_types` list. */
export function buildUpdateDatasetTypesSql(
  metaSchema: string,
  datasetId: string,
  newTypesSql: string,
): string {
  return `UPDATE ${metaSchema}._datasets SET resource_types = list_concat(resource_types, [${newTypesSql}]) WHERE id = '${datasetId.replaceAll("'", "''")}'`;
}

/** Build the JSON response body for updateDataset (added types + skipped count). */
export function buildUpdateDatasetResponse(
  datasetId: string,
  added: string[],
  totalRequested: number,
): Record<string, unknown> {
  return {
    id: datasetId,
    added_types: added,
    skipped: totalRequested - added.length,
  };
}

// ---------------------------------------------------------------------------
// parseCustomDefinitions (port of parse_custom_definitions in dataset.rs)
// ---------------------------------------------------------------------------

/**
 * Parse and validate a FHIR Bundle of StructureDefinitions.
 * Returns { names, customDefs } where names is the list of resource type names
 * and customDefs is the loaded DefinitionRegistry.
 * Throws FhirError.badRequest on any validation failure.
 */
export function parseCustomDefinitions(
  bundle: unknown,
): { names: string[]; customDefs: DefinitionRegistry } {
  const b = bundle as Record<string, unknown>;
  const resourceType = typeof b?.resourceType === "string" ? b.resourceType : "";
  if (resourceType !== "Bundle") {
    throw FhirError.badRequest("structure_definitions must be a FHIR Bundle");
  }

  const entries = b?.entry;
  if (!Array.isArray(entries)) {
    throw FhirError.badRequest("Bundle missing 'entry' array");
  }
  if (entries.length === 0) {
    throw FhirError.badRequest("structure_definitions Bundle is empty");
  }

  const bundleStr = JSON.stringify(bundle);
  const emptyTypes = '{"resourceType":"Bundle","type":"collection","entry":[]}';

  let registry: DefinitionRegistry;
  try {
    registry = DefinitionRegistry.loadFromJson(bundleStr, emptyTypes);
  } catch (e) {
    throw FhirError.badRequest(`Invalid StructureDefinitions: ${e}`);
  }

  const names = registry.resourceTypeNames();
  if (names.length === 0) {
    throw FhirError.badRequest("No valid resource StructureDefinitions found in Bundle");
  }

  return { names, customDefs: registry };
}

// ---------------------------------------------------------------------------
// Conn adapter: the Conn interface uses query() which returns array of objects,
// but our DDL/DML statements don't need rows back; errors are thrown.
// We use a small wrapper so errors propagate as FhirError.
// ---------------------------------------------------------------------------

/** Execute a SQL statement via conn.query(); throws on error (which propagates). */
async function exec(conn: Conn, sql: string, params?: unknown[]): Promise<void> {
  await conn.query(sql, params);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function createDataset(
  body: any,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  const id: string = body?.id ?? "";
  const name: string = body?.name ?? "";

  validateCreateDatasetId(id);

  // Ensure meta schema exists
  await initFhirMeta(conn, state.dbName);

  // Compute resource types: custom SD path or default registry path
  let resourceTypeNames: string[];
  let customDefs: DefinitionRegistry | undefined;

  if (body?.structure_definitions != null) {
    const parsed = parseCustomDefinitions(body.structure_definitions);
    resourceTypeNames = parsed.names;
    customDefs = parsed.customDefs;
  } else {
    resourceTypeNames = state.registry.resourceTypeNames();
    if (resourceTypeNames.length === 0) {
      throw FhirError.internal("No FHIR definitions loaded on server");
    }
    customDefs = undefined;
  }

  const qualifiedSchema = toQualifiedSchema(state.dbName, id);

  // CREATE SCHEMA
  try {
    await exec(conn, `CREATE SCHEMA IF NOT EXISTS ${qualifiedSchema}`);
  } catch (e) {
    console.error("[fhir] Failed to create schema:", e);
    throw FhirError.internal("Failed to create schema");
  }

  // CREATE _history table
  try {
    await exec(conn, buildHistoryDdl(qualifiedSchema));
  } catch (e) {
    console.error("[fhir] Failed to create _history table:", e);
    throw FhirError.internal("Failed to create _history table");
  }

  // CREATE _valueset_expansion table
  try {
    await exec(conn, buildValuesetExpansionDdl(qualifiedSchema));
  } catch (e) {
    console.error("[fhir] Failed to create _valueset_expansion table:", e);
    throw FhirError.internal("Failed to create _valueset_expansion table");
  }

  // Generate and run DDL for each resource type
  const createdTypes: string[] = [];
  const errors: string[] = [];

  if (customDefs !== undefined) {
    // Custom SD path: generate DDL from the custom DefinitionRegistry
    for (const typeName of resourceTypeNames) {
      try {
        const ddl = generateDdl(customDefs, typeName, qualifiedSchema);
        try {
          await exec(conn, ddl);
          createdTypes.push(typeName);
        } catch (e) {
          errors.push(`${typeName}: ${String(e)}`);
        }
      } catch (e) {
        errors.push(`${typeName}: ${String(e)}`);
      }
    }
  } else {
    // Default path: use the registry's generateAllDdl
    const allDdl = state.registry.generateAllDdl(qualifiedSchema);
    for (const { resourceType: typeName, ddl, error } of allDdl) {
      if (error !== null || ddl === null) {
        errors.push(`${typeName}: ${error ?? "no DDL"}`);
        continue;
      }
      try {
        await exec(conn, ddl);
        createdTypes.push(typeName);
      } catch (e) {
        errors.push(`${typeName}: ${String(e)}`);
      }
    }
  }

  if (createdTypes.length === 0) {
    // Best-effort cleanup
    try { await exec(conn, `DROP SCHEMA IF EXISTS ${qualifiedSchema} CASCADE`); } catch { /* ignore */ }
    console.error("[fhir] Failed to create any resource tables:", errors.join("; "));
    throw FhirError.internal("Failed to create any resource tables");
  }

  const resourceTypesSql = buildResourceTypesSqlList(createdTypes);
  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const insertSql = buildInsertDatasetSql(metaSchema, resourceTypesSql);

  try {
    await exec(conn, insertSql, [id, name]);
  } catch (e) {
    const msg = String(e);
    if (isDuplicateDatasetError(msg)) {
      throw FhirError.conflict(`Dataset '${id}' already exists`);
    }
    console.error("[fhir] Failed to register dataset:", e);
    throw FhirError.internal("Failed to register dataset");
  }

  const responseBody = buildCreateDatasetResponse(id, name, createdTypes, errors);
  return new Response(JSON.stringify(responseBody), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

export async function listDatasets(conn: Conn, state: AppState): Promise<Response> {
  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const sql = `SELECT id, name, status, created_at, resource_types FROM ${metaSchema}._datasets`;

  let rows: any[];
  try {
    rows = await conn.query(sql);
  } catch (e) {
    console.error("[fhir] Failed to list datasets:", e);
    throw FhirError.internal("Failed to list datasets");
  }

  // conn.query returns array of plain objects (not [columns, rows] tuples)
  // so we just return them directly
  return Response.json(rows ?? []);
}

export async function getDataset(
  datasetId: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const sql = buildSelectDatasetSql(metaSchema, datasetId);

  let rows: any[];
  try {
    rows = await conn.query(sql);
  } catch (e) {
    console.error("[fhir] Failed to get dataset:", e);
    throw FhirError.internal("Failed to get dataset");
  }

  if (!rows || rows.length === 0) {
    throw FhirError.notFound(`Dataset '${datasetId}' not found`);
  }

  return Response.json(rows[0]);
}

export async function updateDataset(
  datasetId: string,
  body: any,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const checkSql = buildDatasetExistsSql(metaSchema, datasetId);

  let checkRows: any[];
  try {
    checkRows = await conn.query(checkSql);
  } catch (e) {
    console.error("[fhir] Failed to check dataset:", e);
    throw FhirError.internal("Failed to check dataset");
  }

  if (!checkRows || checkRows.length === 0) {
    throw FhirError.notFound(`Dataset '${datasetId}' not found`);
  }

  // update_dataset in Rust requires structure_definitions bundle
  const sdBundle = body?.structure_definitions;
  if (!sdBundle) {
    throw FhirError.badRequest("Missing 'structure_definitions' field");
  }

  const { names: newTypes, customDefs } = parseCustomDefinitions(sdBundle);
  const qualifiedSchema = toQualifiedSchema(state.dbName, datasetId);

  const added: string[] = [];

  for (const typeName of newTypes) {
    let ddl: string;
    try {
      ddl = generateDdl(customDefs, typeName, qualifiedSchema);
    } catch (e) {
      console.error(`[fhir] Failed to generate DDL for ${typeName}:`, e);
      throw FhirError.internal(`Failed to generate DDL for ${typeName}`);
    }

    try {
      await exec(conn, ddl);
      added.push(typeName);
    } catch (e) {
      console.error(`[fhir] Failed to create table for ${typeName}:`, e);
      throw FhirError.internal(`Failed to create table for ${typeName}`);
    }
  }

  if (added.length > 0) {
    const newTypesSql = buildResourceTypesSqlList(added);
    try {
      await exec(conn, buildUpdateDatasetTypesSql(metaSchema, datasetId, newTypesSql));
    } catch { /* best-effort, mirrors Rust let _ = ... */ }
  }

  return Response.json(buildUpdateDatasetResponse(datasetId, added, newTypes.length));
}

export async function deleteDataset(
  datasetId: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const metaSchema = toQualifiedMetaSchema(state.dbName);
  const checkSql = buildSelectDatasetStatusSql(metaSchema, datasetId);

  let checkRows: any[];
  try {
    checkRows = await conn.query(checkSql);
  } catch (e) {
    console.error("[fhir] Failed to check dataset:", e);
    throw FhirError.internal("Failed to check dataset");
  }

  if (!checkRows || checkRows.length === 0) {
    throw FhirError.notFound(`Dataset '${datasetId}' not found`);
  }

  // Check status
  const status = String(checkRows[0]?.status ?? "");
  checkDatasetDeletable(status, datasetId);

  // Mark deleting (best-effort, mirrors Rust let _ = ...)
  try {
    await exec(conn, buildMarkDeletingSql(metaSchema, datasetId));
  } catch { /* best-effort */ }

  // Drop schema
  const qualifiedSchema = toQualifiedSchema(state.dbName, datasetId);
  try {
    await exec(conn, buildDropSchemaSql(qualifiedSchema));
  } catch (e) {
    console.error("[fhir] Failed to drop schema:", e);
    throw FhirError.internal("Failed to drop schema");
  }

  // Delete dataset row
  try {
    await exec(conn, buildDeleteDatasetRowSql(metaSchema, datasetId));
  } catch (e) {
    console.error("[fhir] Failed to delete dataset record:", e);
    throw FhirError.internal("Failed to delete dataset record");
  }

  return new Response(null, { status: 204 });
}
