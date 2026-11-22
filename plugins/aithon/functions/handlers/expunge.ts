// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/expunge.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import {
  escapeIdentifier,
  escapeString,
  toQualifiedSchema,
  validateDatasetId,
  validateFhirId,
  validateResourceType,
} from "../sql_safety.ts";

export const ALLOW_EXPUNGE_ENV = "FHIR_ALLOW_EXPUNGE";

/**
 * Patient-owned resources removed by `_cascade=delete`: [resource type, Reference element].
 * Mirrors Rust: PATIENT_CASCADE (keep both lists identical).
 */
export const PATIENT_CASCADE: ReadonlyArray<readonly [string, string]> = [
  ["AdverseEvent", "subject"],
  ["AllergyIntolerance", "patient"],
  ["Basic", "subject"],
  ["BodyStructure", "patient"],
  ["CarePlan", "subject"],
  ["CareTeam", "subject"],
  ["ChargeItem", "subject"],
  ["Claim", "patient"],
  ["ClaimResponse", "patient"],
  ["ClinicalImpression", "subject"],
  ["Communication", "subject"],
  ["CommunicationRequest", "subject"],
  ["Composition", "subject"],
  ["Condition", "subject"],
  ["Consent", "patient"],
  ["Coverage", "beneficiary"],
  ["CoverageEligibilityRequest", "patient"],
  ["CoverageEligibilityResponse", "patient"],
  ["DetectedIssue", "patient"],
  ["DeviceRequest", "subject"],
  ["DeviceUseStatement", "subject"],
  ["DiagnosticReport", "subject"],
  ["DocumentManifest", "subject"],
  ["DocumentReference", "subject"],
  ["Encounter", "subject"],
  ["EnrollmentRequest", "candidate"],
  ["EpisodeOfCare", "patient"],
  ["ExplanationOfBenefit", "patient"],
  ["FamilyMemberHistory", "patient"],
  ["Flag", "subject"],
  ["Goal", "subject"],
  ["ImagingStudy", "subject"],
  ["Immunization", "patient"],
  ["ImmunizationEvaluation", "patient"],
  ["ImmunizationRecommendation", "patient"],
  ["Invoice", "subject"],
  ["List", "subject"],
  ["MeasureReport", "subject"],
  ["Media", "subject"],
  ["MedicationAdministration", "subject"],
  ["MedicationDispense", "subject"],
  ["MedicationRequest", "subject"],
  ["MedicationStatement", "subject"],
  ["MolecularSequence", "patient"],
  ["NutritionOrder", "patient"],
  ["Observation", "subject"],
  ["Procedure", "subject"],
  ["QuestionnaireResponse", "subject"],
  ["RelatedPerson", "patient"],
  ["RequestGroup", "subject"],
  ["ResearchSubject", "individual"],
  ["RiskAssessment", "subject"],
  ["ServiceRequest", "subject"],
  ["Specimen", "subject"],
  ["SupplyDelivery", "patient"],
  ["VisionPrescription", "patient"],
];

export function parseAllowFlag(value: string | undefined | null): boolean {
  return ["true", "1", "yes"].includes((value ?? "").trim().toLowerCase());
}

/** Returns whether `_cascade=delete` was requested; any other value is rejected. */
export function parseCascade(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (value === "delete") return true;
  throw FhirError.badRequest(`Unsupported _cascade value '${value}' (only 'delete' is supported)`);
}

/** `patientId` must already be validated as a FHIR id. Mirrors Rust: build_patient_reference_condition */
export function buildPatientReferenceCondition(element: string, patientId: string): string {
  const id = patientId.replaceAll(".", "\\.");
  return `regexp_full_match(json_extract_string(_raw, '$.${element}.reference'), '(.*/)?Patient/${id}(/_history/[^/]+)?')`;
}

export function buildListTablesSql(dbName: string, datasetId: string): string {
  return `SELECT table_name FROM information_schema.tables WHERE table_catalog = '${escapeString(dbName)}' AND table_schema = '${escapeString(datasetId.replaceAll("-", "_"))}'`;
}

export function buildExpungeHistoryByIdSql(schemaName: string, resourceType: string, id: string): string {
  return `DELETE FROM ${schemaName}._history WHERE _resource_type = '${escapeString(resourceType)}' AND _id = '${escapeString(id)}' RETURNING _id`;
}

export function buildExpungeByIdSql(schemaName: string, resourceType: string, id: string): string {
  return `DELETE FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE _id = '${escapeString(id)}' RETURNING _id`;
}

export function buildExpungeHistoryWhereSql(schemaName: string, resourceType: string, condition: string): string {
  return `DELETE FROM ${schemaName}._history WHERE _resource_type = '${escapeString(resourceType)}' AND (_id IN (SELECT _id FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE ${condition}) OR ${condition}) RETURNING _id`;
}

export function buildExpungeWhereSql(schemaName: string, resourceType: string, condition: string): string {
  return `DELETE FROM ${schemaName}."${resourceType.toLowerCase()}" WHERE ${condition} RETURNING _id`;
}

export function buildExpungeResponse(resources: number, versions: number): Record<string, unknown> {
  return {
    resourceType: "Parameters",
    parameter: [
      { name: "count", valueInteger: resources },
      { name: "historyCount", valueInteger: versions },
    ],
  };
}

async function rollback(conn: Conn): Promise<void> {
  try { await conn.query("ROLLBACK"); } catch { /* ignore */ }
}

async function execCount(conn: Conn, sql: string, label: string): Promise<number> {
  try {
    const rows = await conn.query(sql);
    return rows?.length ?? 0;
  } catch (e) {
    await rollback(conn);
    console.error(`[fhir] ${label} failed: ${e}`);
    throw FhirError.internal(`${label} failed`);
  }
}

/**
 * POST /{ds}/{type}/{id}/$expunge — permanently removes a resource and all its
 * versions; `?_cascade=delete` on a Patient also removes its owned resources.
 */
export async function expungeResource(
  datasetId: string,
  resourceType: string,
  id: string,
  cascadeParam: string | null,
  conn: Conn,
  state: AppState,
  allowFlag: string | undefined = Deno.env.get(ALLOW_EXPUNGE_ENV),
): Promise<Response> {
  if (!parseAllowFlag(allowFlag)) {
    throw FhirError.forbidden(`$expunge is disabled; set FHIR__ALLOW_EXPUNGE=true to enable it`);
  }
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);
  validateFhirId(id);
  const cascade = parseCascade(cascadeParam);
  if (cascade && resourceType !== "Patient") {
    throw FhirError.badRequest("_cascade=delete is only supported for Patient");
  }

  const schemaName = toQualifiedSchema(state.dbName, datasetId);

  let tables = new Set<string>();
  if (cascade) {
    try {
      const rows = await conn.query(buildListTablesSql(state.dbName, datasetId));
      tables = new Set((rows ?? []).map((r: any) => r.table_name));
    } catch (e) {
      console.error(`[fhir] Failed to list dataset tables: ${e}`);
      throw FhirError.internal("Failed to list dataset tables");
    }
  }

  try {
    await conn.query("BEGIN TRANSACTION");
  } catch (e) {
    console.error(`[fhir] Failed to begin transaction: ${e}`);
    throw FhirError.internal("Failed to begin transaction");
  }

  let versions = await execCount(conn, buildExpungeHistoryByIdSql(schemaName, resourceType, id), "History expunge");

  let resources: number;
  try {
    resources = (await conn.query(buildExpungeByIdSql(schemaName, resourceType, id)))?.length ?? 0;
  } catch (e) {
    await rollback(conn);
    if (String(e).includes("does not exist")) {
      throw FhirError.notFound(`Resource type '${resourceType}' not found in dataset '${datasetId}'`);
    }
    console.error(`[fhir] Failed to expunge resource: ${e}`);
    throw FhirError.internal("Failed to expunge resource");
  }

  if (resources === 0) {
    await rollback(conn);
    throw FhirError.notFound(`${resourceType}/${id} not found`);
  }

  if (cascade) {
    for (const [rtype, element] of PATIENT_CASCADE) {
      if (!tables.has(rtype.toLowerCase())) continue;
      const cond = buildPatientReferenceCondition(element, id);
      versions += await execCount(conn, buildExpungeHistoryWhereSql(schemaName, rtype, cond), "Cascade history expunge");
      resources += await execCount(conn, buildExpungeWhereSql(schemaName, rtype, cond), "Cascade expunge");
    }
  }

  try {
    await conn.query("COMMIT");
  } catch (e) {
    console.error(`[fhir] Failed to commit expunge transaction: ${e}`);
    throw FhirError.internal("Failed to commit transaction");
  }

  // Flush the WAL so the deleted rows don't linger there; another writer can block it.
  try {
    await conn.query(`CHECKPOINT ${escapeIdentifier(state.dbName)}`);
  } catch (e) {
    console.error(`[fhir] WARNING: checkpoint after expunge failed: ${e}`);
  }

  return new Response(JSON.stringify(buildExpungeResponse(resources, versions)), {
    status: 200,
    headers: { "Content-Type": "application/fhir+json" },
  });
}
