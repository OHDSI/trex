// @ts-nocheck - Deno edge function

/** Physical mapping for one MRI attribute → a FHIR resource + JSON path. */
export interface AttrMapping {
  resourceType: string;          // canonical FHIR type, e.g. "Patient"
  jsonPath: string;              // path within _raw, e.g. "$.gender"
  kind: "text" | "num";
  binnable: boolean;             // numeric axes that support binsize
  derive?: "ageYears";           // optional server-side derivation
}

/** configPath (relative) → mapping. The frontend never sees this; the
 *  IFR→ELM translator uses it to resolve attributes to SQL. */
export type ConfigMapping = Record<string, AttrMapping>;

/** Curated defaults for common resources. Keys are display attribute names. */
export const CURATED_ATTRS: Record<string, Record<string, AttrMapping>> = {
  Patient: {
    Age:    { resourceType: "Patient", jsonPath: "$.birthDate", kind: "num", binnable: true, derive: "ageYears" },
    Gender: { resourceType: "Patient", jsonPath: "$.gender", kind: "text", binnable: false },
  },
  Condition: {
    Code:   { resourceType: "Condition", jsonPath: "$.code.coding[0].code", kind: "text", binnable: false },
  },
  Observation: {
    Code:   { resourceType: "Observation", jsonPath: "$.code.coding[0].code", kind: "text", binnable: false },
    Value:  { resourceType: "Observation", jsonPath: "$.valueQuantity.value", kind: "num", binnable: true },
  },
  Procedure: {
    Code:   { resourceType: "Procedure", jsonPath: "$.code.coding[0].code", kind: "text", binnable: false },
  },
};

/** Display name of the "interaction" for a non-Patient resource type. */
export const INTERACTION_NAMES: Record<string, string> = {
  Condition: "Diagnosis",
  Observation: "Observation",
  Procedure: "Procedure",
  MedicationRequest: "Medication",
  Encounter: "Encounter",
};
