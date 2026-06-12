// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/import.rs

import { Conn } from "../db.ts";
import { AppState } from "../state.ts";
import { FhirError } from "../error.ts";
import { validateDatasetId, validateFhirId } from "../sql_safety.ts";
import { toQualifiedSchema } from "../sql_safety.ts";
import { upsertResource } from "./upsert.ts";

// ---------------------------------------------------------------------------
// LineOutcome — mirrors Rust enum
// ---------------------------------------------------------------------------

export type LineOutcome =
  | { kind: "empty" }
  | { kind: "rejected"; resourceType: string | null; error: string }
  | { kind: "accepted"; resource: any; resourceType: string; id: string };

// ---------------------------------------------------------------------------
// classifyImportLine — pure helper, mirrors classify_import_line
// ---------------------------------------------------------------------------

/**
 * Classify one NDJSON line without performing any DB work.
 * Mirrors Rust: classify_import_line
 */
export function classifyImportLine(
  line: string,
  registry: { isKnownResourceType(rt: string): boolean },
): LineOutcome {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { kind: "empty" };
  }

  let resource: any;
  try {
    resource = JSON.parse(trimmed);
  } catch (e) {
    return { kind: "rejected", resourceType: null, error: `Invalid JSON: ${e}` };
  }

  const rt = resource?.resourceType;
  if (typeof rt !== "string" || rt.length === 0) {
    return { kind: "rejected", resourceType: null, error: "Missing resourceType" };
  }

  if (!registry.isKnownResourceType(rt)) {
    return { kind: "rejected", resourceType: rt, error: `Unknown resource type: ${rt}` };
  }

  const rawId = resource?.id;
  let id: string;
  if (rawId !== undefined && rawId !== null) {
    if (typeof rawId !== "string") {
      return { kind: "rejected", resourceType: rt, error: "Invalid resource id: id must be a string" };
    }
    try {
      validateFhirId(rawId);
    } catch (e) {
      return { kind: "rejected", resourceType: rt, error: `Invalid resource id: ${e instanceof FhirError ? e.diagnostics : e}` };
    }
    id = rawId;
  } else {
    // Generate a UUID v4
    id = crypto.randomUUID();
  }

  return { kind: "accepted", resource, resourceType: rt, id };
}

// ---------------------------------------------------------------------------
// importNdjson — handler
// ---------------------------------------------------------------------------

/**
 * POST /{ds}/$import — body is NDJSON (newline-delimited FHIR resources, possibly mixed types)
 * Mirrors Rust: import_ndjson
 *
 * No transaction wrapper — each resource is upserted independently (matches Rust which
 * calls upsert_resource per line without wrapping in an outer transaction).
 */
export async function importNdjson(
  datasetId: string,
  bodyText: string,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);

  const schemaName = toQualifiedSchema(state.dbName, datasetId);

  const successCounts: Record<string, number> = {};
  const errorCounts: Record<string, number> = {};
  const errorDetails: any[] = [];
  let totalSuccess = 0;
  let totalErrors = 0;

  const now = new Date().toISOString();
  const lines = bodyText.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    const outcome = classifyImportLine(line, state.registry);

    if (outcome.kind === "empty") {
      continue;
    }

    if (outcome.kind === "rejected") {
      totalErrors += 1;
      const key = outcome.resourceType ?? "_parse";
      errorCounts[key] = (errorCounts[key] ?? 0) + 1;
      const detail: any = { line: lineNum, error: outcome.error };
      if (outcome.resourceType !== null) {
        detail.resourceType = outcome.resourceType;
      }
      errorDetails.push(detail);
      continue;
    }

    // outcome.kind === "accepted"
    const { resource, resourceType, id } = outcome;

    // Mirror Rust: getJsonTransform + getColumnNames validate the type and throw
    // for unknown types. We don't need the values here (upsertResource re-fetches),
    // only the validation/throw behavior.
    try {
      state.registry.getJsonTransform(resourceType);
      state.registry.getColumnNames(resourceType);
    } catch (e) {
      totalErrors += 1;
      errorCounts[resourceType] = (errorCounts[resourceType] ?? 0) + 1;
      const msg = e instanceof Error ? e.message : String(e);
      // Check if it's a transform spec error or column names error
      errorDetails.push({
        line: lineNum,
        resourceType,
        error: `Transform spec: ${msg}`,
      });
      continue;
    }

    try {
      await upsertResource(conn, state, schemaName, resourceType, id, resource, now);
      totalSuccess += 1;
      successCounts[resourceType] = (successCounts[resourceType] ?? 0) + 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("does not exist") || msg.includes("Table")) {
        throw FhirError.notFound(`Dataset '${datasetId}' not found`);
      }
      totalErrors += 1;
      errorCounts[resourceType] = (errorCounts[resourceType] ?? 0) + 1;
      errorDetails.push({
        line: lineNum,
        resourceType,
        error: msg,
      });
    }
  }

  const responseBody: any = {
    outcome: "complete",
    total: {
      success: totalSuccess,
      errors: totalErrors,
    },
    success: successCounts,
    errors: errorCounts,
  };

  if (errorDetails.length > 0) {
    responseBody.errorDetails = errorDetails;
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
