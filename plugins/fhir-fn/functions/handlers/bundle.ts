// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/bundle.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import { validateDatasetId } from "../sql_safety.ts";
import { toQualifiedSchema } from "../sql_safety.ts";
import { ResourceRegistry } from "../fhir/resource_registry.ts";
import { processBundleEntries, ProcessedEntry } from "../fhir/bundle_processor.ts";
import { buildInsertSql, buildUpdateSql } from "../schema/sql_builder.ts";
import { buildHistoryInsertSql } from "./crud.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_BUNDLE_ENTRIES = 10_000;

// ---------------------------------------------------------------------------
// Pure helpers (port of bundle.rs pure fns, exact SQL/JSON)
// ---------------------------------------------------------------------------

/**
 * Build the response entry for a POST in a transaction/batch bundle.
 * Mirrors Rust: build_post_response_entry
 */
export function buildPostResponseEntry(
  datasetId: string,
  resourceType: string,
  serverId: string,
): any {
  return {
    response: {
      status: "201 Created",
      location: `/${datasetId}/${resourceType}/${serverId}`,
      etag: 'W/"1"',
    },
  };
}

/**
 * Build the response entry for a PUT in a transaction/batch bundle.
 * Mirrors Rust: build_put_response_entry
 */
export function buildPutResponseEntry(
  datasetId: string,
  resourceType: string,
  serverId: string,
  version: number,
  isNew: boolean,
): any {
  const status = isNew ? "201 Created" : "200 OK";
  return {
    response: {
      status,
      location: `/${datasetId}/${resourceType}/${serverId}`,
      etag: `W/"${version}"`,
    },
  };
}

/**
 * Build the response entry for a DELETE in a transaction/batch bundle.
 * Mirrors Rust: build_delete_response_entry
 */
export function buildDeleteResponseEntry(): any {
  return {
    response: {
      status: "204 No Content",
    },
  };
}

/**
 * Build an OperationOutcome wrapper for a single failing entry in a batch bundle.
 * Mirrors Rust: build_batch_error_entry
 */
export function buildBatchErrorEntry(errorMessage: string): any {
  return {
    response: {
      status: "400 Bad Request",
      outcome: {
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "processing",
            diagnostics: errorMessage,
          },
        ],
      },
    },
  };
}

/**
 * Build the outer Bundle response wrapper.
 * Mirrors Rust: build_bundle_response
 */
export function buildBundleResponse(entries: any[], bundleType: string): any {
  return {
    resourceType: "Bundle",
    type: bundleType,
    entry: entries,
  };
}

/**
 * Build the SELECT used by the bundle DELETE branch to fetch current version + raw.
 * Mirrors Rust: build_delete_check_sql (exact SQL)
 */
export function buildDeleteCheckSql(
  schemaName: string,
  resourceType: string,
): string {
  return `SELECT _version_id::VARCHAR, _raw FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = $1 AND NOT _is_deleted`;
}

/**
 * Build the soft-delete UPDATE used by the bundle DELETE branch.
 * Mirrors Rust: build_bundle_delete_sql (exact SQL)
 */
export function buildBundleDeleteSql(
  schemaName: string,
  resourceType: string,
  newVersion: number,
): string {
  return `UPDATE ${schemaName}."${resourceType.toLowerCase()}" SET _is_deleted = true, _version_id = ${newVersion}, _last_updated = CURRENT_TIMESTAMP WHERE _id = $1`;
}

/**
 * Stamp `id` and meta (versionId=1, lastUpdated) on a POST'd resource.
 * Mirrors Rust: stamp_post_resource_meta
 */
export function stampPostResourceMeta(
  resource: any,
  serverId: string,
  now: string,
): void {
  if (resource !== null && typeof resource === "object" && !Array.isArray(resource)) {
    resource.id = serverId;
    resource.meta = {
      versionId: "1",
      lastUpdated: now,
    };
  }
}

// ---------------------------------------------------------------------------
// classify bundle type
// ---------------------------------------------------------------------------

/**
 * Classify a bundle body as "transaction" or "batch".
 * Mirrors Rust: classify_bundle
 */
export function classifyBundle(body: any): "transaction" | "batch" {
  const rt = body?.resourceType ?? "";
  if (rt !== "Bundle") {
    throw FhirError.badRequest("Expected a FHIR Bundle resource");
  }
  const bundleType = body?.type ?? "";
  if (bundleType === "transaction" || bundleType === "batch") {
    return bundleType;
  }
  throw FhirError.badRequest(
    `Unsupported Bundle type: '${bundleType}'. Must be 'transaction' or 'batch'`,
  );
}

// ---------------------------------------------------------------------------
// Per-entry processing
// ---------------------------------------------------------------------------

async function processSingleEntry(
  state: AppState,
  schemaName: string,
  datasetId: string,
  entry: ProcessedEntry,
  conn: Conn,
): Promise<any> {
  if (entry.resourceType !== undefined && !/^[A-Za-z0-9]+$/.test(entry.resourceType)) {
    throw FhirError.badRequest(`Invalid resourceType '${entry.resourceType}'`);
  }

  const tableName = ResourceRegistry.tableName(entry.resourceType);

  switch (entry.method) {
    case "POST": {
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const resource = JSON.parse(JSON.stringify(entry.resource));
      stampPostResourceMeta(resource, entry.serverId, now);

      let rawJson: string;
      try {
        rawJson = JSON.stringify(resource);
      } catch (e) {
        throw new Error(`JSON serialize: ${e}`);
      }

      let transformSpec: string;
      let columnNames: string[];
      try {
        transformSpec = state.registry.getJsonTransform(entry.resourceType);
        columnNames = state.registry.getColumnNames(entry.resourceType);
      } catch (e) {
        throw new Error(`Transform spec: ${e}`);
      }

      const insertSql = buildInsertSql(
        schemaName,
        tableName,
        1,
        transformSpec,
        columnNames,
      );

      try {
        await conn.query(insertSql, [entry.serverId, rawJson]);
      } catch (e) {
        throw new Error(`Insert failed: ${e}`);
      }

      return buildPostResponseEntry(datasetId, entry.resourceType, entry.serverId);
    }

    case "PUT": {
      // Read current version (check if exists)
      const checkSql = `SELECT _version_id::VARCHAR, _raw FROM ${schemaName}."${entry.resourceType.toLowerCase()}" WHERE _id = $1`;
      let currentVersion: number;
      let isNew: boolean;
      let currentRaw: string;

      try {
        const rows = await conn.query(checkSql, [entry.serverId]);
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
        throw new Error(`Check failed: ${e}`);
      }

      const newVersion = currentVersion + 1;
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

      const resource = JSON.parse(JSON.stringify(entry.resource));
      resource.id = entry.serverId;
      resource.meta = {
        versionId: String(newVersion),
        lastUpdated: now,
      };

      let rawJson: string;
      try {
        rawJson = JSON.stringify(resource);
      } catch (e) {
        throw new Error(`JSON serialize: ${e}`);
      }

      // Write current version into _history (only when updating an existing resource)
      if (!isNew) {
        const historySql = buildHistoryInsertSql(schemaName, currentVersion);
        try {
          await conn.query(historySql, [entry.serverId, entry.resourceType, currentRaw]);
        } catch (e) {
          console.error(
            `[fhir] WARNING: history write failed for ${entry.resourceType}/${entry.serverId}: ${e}`,
          );
        }
      }

      let transformSpec: string;
      let columnNames: string[];
      try {
        transformSpec = state.registry.getJsonTransform(entry.resourceType);
        columnNames = state.registry.getColumnNames(entry.resourceType);
      } catch (e) {
        throw new Error(`Transform spec: ${e}`);
      }

      const upsertSql = isNew
        ? buildInsertSql(schemaName, tableName, newVersion, transformSpec, columnNames)
        : buildUpdateSql(schemaName, tableName, newVersion, transformSpec, columnNames);

      try {
        await conn.query(upsertSql, [entry.serverId, rawJson]);
      } catch (e) {
        throw new Error(`Upsert failed: ${e}`);
      }

      return buildPutResponseEntry(
        datasetId,
        entry.resourceType,
        entry.serverId,
        newVersion,
        isNew,
      );
    }

    case "DELETE": {
      if (!entry.serverId) {
        throw new Error("DELETE entry missing resource id");
      }

      const checkSql = buildDeleteCheckSql(schemaName, entry.resourceType);

      let currentVersion: number;
      let currentRaw: string;

      try {
        const rows = await conn.query(checkSql, [entry.serverId]);
        if (!rows || rows.length === 0) {
          throw new Error(
            `Resource ${entry.resourceType}/${entry.serverId} not found`,
          );
        }
        const row = rows[0];
        const vStr: string = row._version_id ?? row.column0 ?? "1";
        const n = parseInt(vStr, 10);
        currentVersion = isNaN(n) ? 1 : n;
        currentRaw = row._raw ?? row.column1 ?? "{}";
      } catch (e) {
        throw new Error(
          e instanceof Error ? e.message : `Delete check failed: ${e}`,
        );
      }

      const newVersion = currentVersion + 1;

      const historySql = buildHistoryInsertSql(schemaName, currentVersion);
      try {
        await conn.query(historySql, [
          entry.serverId,
          entry.resourceType,
          currentRaw,
        ]);
      } catch (e) {
        console.error(
          `[fhir] WARNING: history write failed for ${entry.resourceType}/${entry.serverId}: ${e}`,
        );
      }

      const deleteSql = buildBundleDeleteSql(
        schemaName,
        entry.resourceType,
        newVersion,
      );

      try {
        await conn.query(deleteSql, [entry.serverId]);
      } catch (e) {
        throw new Error(`Delete failed: ${e}`);
      }

      return buildDeleteResponseEntry();
    }

    default:
      throw new Error(`Unsupported method: ${entry.method}`);
  }
}

// ---------------------------------------------------------------------------
// Transaction processing
// ---------------------------------------------------------------------------

async function processTransaction(
  state: AppState,
  datasetId: string,
  bundle: any,
  conn: Conn,
): Promise<Response> {
  let entries: ProcessedEntry[];
  try {
    entries = processBundleEntries(bundle, MAX_BUNDLE_ENTRIES);
  } catch (e) {
    throw FhirError.badRequest(String(e instanceof Error ? e.message : e));
  }

  if (entries.length === 0) {
    return Response.json(buildBundleResponse([], "transaction-response"), {
      status: 200,
    });
  }

  const schemaName = toQualifiedSchema(state.dbName, datasetId);

  try {
    await conn.query("BEGIN TRANSACTION");
  } catch (e) {
    console.error(`[fhir] Failed to begin transaction: ${e}`);
    throw FhirError.internal("Failed to begin transaction");
  }

  const responseEntries: any[] = [];

  for (const entry of entries) {
    let respEntry: any;
    try {
      respEntry = await processSingleEntry(state, schemaName, datasetId, entry, conn);
    } catch (e) {
      try { await conn.query("ROLLBACK"); } catch { /* best-effort */ }
      throw FhirError.badRequest(
        `Transaction failed on ${entry.resourceType}/${entry.serverId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
    responseEntries.push(respEntry);
  }

  try {
    await conn.query("COMMIT");
  } catch (e) {
    console.error(`[fhir] Failed to commit transaction: ${e}`);
    throw FhirError.internal("Failed to commit transaction");
  }

  return Response.json(
    buildBundleResponse(responseEntries, "transaction-response"),
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

async function processBatch(
  state: AppState,
  datasetId: string,
  bundle: any,
  conn: Conn,
): Promise<Response> {
  let entries: ProcessedEntry[];
  try {
    entries = processBundleEntries(bundle, MAX_BUNDLE_ENTRIES);
  } catch (e) {
    throw FhirError.badRequest(String(e instanceof Error ? e.message : e));
  }

  if (entries.length === 0) {
    return Response.json(buildBundleResponse([], "batch-response"), {
      status: 200,
    });
  }

  const schemaName = toQualifiedSchema(state.dbName, datasetId);
  const responseEntries: any[] = [];

  for (const entry of entries) {
    try {
      const respEntry = await processSingleEntry(
        state,
        schemaName,
        datasetId,
        entry,
        conn,
      );
      responseEntries.push(respEntry);
    } catch (e) {
      responseEntries.push(
        buildBatchErrorEntry(e instanceof Error ? e.message : String(e)),
      );
    }
  }

  return Response.json(buildBundleResponse(responseEntries, "batch-response"), {
    status: 200,
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function processBundle(
  datasetId: string,
  body: any,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const bundleType = classifyBundle(body);

  if (bundleType === "transaction") {
    return processTransaction(state, datasetId, body, conn);
  } else {
    return processBatch(state, datasetId, body, conn);
  }
}
