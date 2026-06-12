// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/export.rs

import { Conn } from "../db.ts";
import { AppState } from "../state.ts";
import { FhirError } from "../error.ts";
import { validateDatasetId, validateResourceType, validateUuid } from "../sql_safety.ts";
import { toQualifiedMetaSchema } from "../sql_safety.ts";
import {
  createExportJob,
  getExportJob,
  executeExport,
} from "../export/ndjson.ts";

// ---------------------------------------------------------------------------
// parseExportTypes — mirrors Rust parse_export_types
// ---------------------------------------------------------------------------

/**
 * Parse the `_type` query parameter into a list of resource types, validating each.
 * When `_type` is absent, return all known types from the registry.
 * Rejects unknown types with a 400 FhirError.
 */
export function parseExportTypes(
  params: Record<string, string>,
  registry: { resourceTypeNames(): string[]; isKnownResourceType(rt: string): boolean },
): string[] {
  const typeParam = params["_type"];
  if (typeParam !== undefined) {
    const parsed = typeParam.split(",").map((s) => s.trim());
    for (const rt of parsed) {
      validateResourceType(rt, registry);
    }
    return parsed;
  }
  return registry.resourceTypeNames();
}

// ---------------------------------------------------------------------------
// buildStatusResponse — mirrors Rust build_status_response
// ---------------------------------------------------------------------------

/**
 * Build the HTTP status + JSON body for an export job status response.
 *
 * Status code mapping (matches export.rs build_status_response exactly):
 *   "accepted"    → 202  { status, jobId }
 *   "in-progress" → 202  { status, jobId }
 *   "complete"    → 200  { transactionTime, request, requiresAccessToken, output, error }
 *   "error"       → throws FhirError.internal("Export failed")
 *   unknown       → throws FhirError.internal("Unknown job status")
 */
export function buildStatusResponse(
  job: Record<string, unknown>,
  datasetId: string,
  jobId: string,
): [number, Record<string, unknown>] {
  const status = (typeof job["status"] === "string" ? job["status"] : "unknown") as string;

  switch (status) {
    case "accepted":
    case "in-progress":
      return [202, { status, jobId }];

    case "complete": {
      const outputFilesRaw = job["output_files"];
      let outputFiles: unknown[] = [];
      if (typeof outputFilesRaw === "string") {
        try {
          outputFiles = JSON.parse(outputFilesRaw);
        } catch {
          outputFiles = [];
        }
      }
      const completedAt =
        typeof job["completed_at"] === "string" ? job["completed_at"] : "";
      return [
        200,
        {
          transactionTime: completedAt,
          request: `/${datasetId}/$export`,
          requiresAccessToken: false,
          output: outputFiles,
          error: [],
        },
      ];
    }

    case "error":
      throw FhirError.internal("Export failed");

    default:
      throw FhirError.internal("Unknown job status");
  }
}

// ---------------------------------------------------------------------------
// systemExport — mirrors Rust system_export
// ---------------------------------------------------------------------------

/**
 * GET /{ds}/$export
 *
 * Creates an export job for all (or _type-filtered) resource types, then runs
 * executeExport synchronously inline (see ndjson.ts for adaptation note), then
 * returns 202 + Content-Location header.
 */
export async function systemExport(
  datasetId: string,
  query: Record<string, string>,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const resourceTypes = parseExportTypes(query, state.registry);
  const metaSchema = toQualifiedMetaSchema(state.dbName);

  const jobId = await createExportJob(conn, datasetId, resourceTypes, metaSchema).catch((e) => {
    throw FhirError.internal(`Failed to create export job: ${e}`);
  });

  await executeExport(conn, datasetId, jobId, resourceTypes, state.dbName, metaSchema).catch(
    (e) => {
      // Log but don't fail the 202 response — job is marked "error" by executeExport internals
      console.error(`[fhir] Export job ${jobId} failed: ${e}`);
    },
  );

  return new Response(JSON.stringify({ status: "accepted", jobId }), {
    status: 202,
    headers: {
      "content-type": "application/json",
      "Content-Location": `/${datasetId}/$export/status/${jobId}`,
    },
  });
}

// ---------------------------------------------------------------------------
// typeExport — mirrors Rust type_export
// ---------------------------------------------------------------------------

/**
 * GET /{ds}/{resourceType}/$export
 *
 * Single-type export. Same inline execution model as systemExport.
 */
export async function typeExport(
  datasetId: string,
  resourceType: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);

  const resourceTypes = [resourceType];
  const metaSchema = toQualifiedMetaSchema(state.dbName);

  const jobId = await createExportJob(conn, datasetId, resourceTypes, metaSchema).catch((e) => {
    throw FhirError.internal(`Failed to create export job: ${e}`);
  });

  await executeExport(conn, datasetId, jobId, resourceTypes, state.dbName, metaSchema).catch(
    (e) => {
      console.error(`[fhir] Export job ${jobId} failed: ${e}`);
    },
  );

  return new Response(JSON.stringify({ status: "accepted", jobId }), {
    status: 202,
    headers: {
      "content-type": "application/json",
      "Content-Location": `/${datasetId}/$export/status/${jobId}`,
    },
  });
}

// ---------------------------------------------------------------------------
// exportStatus — mirrors Rust export_status
// ---------------------------------------------------------------------------

/**
 * GET /{ds}/$export/status/{jobId}
 *
 * Returns the job status using buildStatusResponse.
 */
export async function exportStatus(
  datasetId: string,
  jobId: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  // Match the native server: validate dataset id + job id (UUID) before querying.
  validateDatasetId(datasetId);
  validateUuid(jobId);

  const metaSchema = toQualifiedMetaSchema(state.dbName);

  const job = await getExportJob(conn, jobId, metaSchema).catch((e) => {
    throw FhirError.internal(`Failed to get export job: ${e}`);
  });

  if (!job) {
    throw FhirError.notFound(`Export job not found: ${jobId}`);
  }

  const [statusCode, body] = buildStatusResponse(job, datasetId, jobId);

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json" },
  });
}
