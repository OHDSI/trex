// @ts-nocheck - Deno edge function
import { FhirError } from "./error.ts";

/**
 * Validates a dataset ID: 1–128 chars, ASCII alphanumeric + hyphens only.
 * Throws FhirError.badRequest on failure.
 */
export function validateDatasetId(id: string): void {
  if (id.length === 0 || id.length > 128) {
    throw FhirError.badRequest("Dataset ID must be 1-128 characters");
  }
  if (!/^[a-zA-Z0-9\-]+$/.test(id)) {
    throw FhirError.badRequest(
      "Dataset ID must contain only alphanumeric characters and hyphens",
    );
  }
}

/**
 * Validates a FHIR resource type string against shape rules and a registry.
 * Duck-typed registry: { isKnownResourceType(rt: string): boolean }
 * Throws FhirError.badRequest on failure.
 */
export function validateResourceType(
  rt: string,
  registry: { isKnownResourceType(rt: string): boolean },
): void {
  if (rt.length === 0 || rt.length > 64) {
    throw FhirError.badRequest("Invalid resource type");
  }
  if (!/^[a-zA-Z0-9]+$/.test(rt)) {
    throw FhirError.badRequest(`Invalid resource type: '${rt}'`);
  }
  if (!registry.isKnownResourceType(rt)) {
    throw FhirError.badRequest(`Unknown resource type: '${rt}'`);
  }
}

/**
 * Validates a FHIR resource ID: 1–64 chars, ASCII alphanumeric + '-' + '.' + '_'.
 * Throws FhirError.badRequest on failure.
 */
export function validateFhirId(id: string): void {
  if (id.length === 0 || id.length > 64) {
    throw FhirError.badRequest("Resource ID must be 1-64 characters");
  }
  if (!/^[a-zA-Z0-9\-._]+$/.test(id)) {
    throw FhirError.badRequest("Resource ID contains invalid characters");
  }
}

/**
 * Validates a version ID: must be a positive integer (> 0).
 * Throws FhirError.badRequest on failure.
 */
export function validateVersionId(id: string): void {
  const n = Number(id);
  // Must parse as an integer and be > 0; also reject floats and non-numeric strings
  if (!Number.isInteger(n) || n <= 0 || String(n) !== id) {
    throw FhirError.badRequest("Version ID must be a positive integer");
  }
}

/**
 * Validates that id is a well-formed UUID (8-4-4-4-12 hex groups).
 * Throws FhirError.badRequest on failure.
 */
export function validateUuid(id: string): void {
  const uuidRe =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRe.test(id)) {
    throw FhirError.badRequest("Invalid UUID format");
  }
}

/**
 * Wraps name in double-quotes, doubling any internal double-quotes.
 * e.g. escapeIdentifier('foo"bar') => '"foo""bar"'
 */
export function escapeIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Escapes single-quotes in a SQL string literal by doubling them.
 * e.g. escapeString("it's") => "it''s"
 */
export function escapeString(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Returns the quoted schema name for a dataset, replacing hyphens with underscores.
 * e.g. toSchemaName("my-dataset") => '"my_dataset"'
 */
export function toSchemaName(datasetId: string): string {
  return escapeIdentifier(datasetId.replaceAll("-", "_"));
}

/**
 * Returns a fully qualified schema reference: "<db>"."<dataset>".
 * e.g. toQualifiedSchema("memory", "my-dataset") => '"memory"."my_dataset"'
 */
export function toQualifiedSchema(dbName: string, datasetId: string): string {
  return `${escapeIdentifier(dbName)}.${escapeIdentifier(datasetId.replaceAll("-", "_"))}`;
}

/**
 * Returns the fully qualified meta-schema reference for a database.
 * e.g. toQualifiedMetaSchema("memory") => '"memory"."_fhir_meta"'
 */
export function toQualifiedMetaSchema(dbName: string): string {
  return `${escapeIdentifier(dbName)}."_fhir_meta"`;
}
