// @ts-nocheck - Deno edge function
import { AttrMapping, ConfigMapping, CURATED_ATTRS, INTERACTION_NAMES } from "./mapping.ts";

export interface GeneratedConfig {
  mriConfig: any;        // MRI-shaped JSON sent to the frontend
  mapping: ConfigMapping; // in-memory configPath → AttrMapping
}

const CONFIG_VERSION = "1";

/** Build an MRI config + mapping for a dataset from the resource types present in it. */
export function generateConfig(datasetId: string, presentTypes: string[]): GeneratedConfig {
  const mapping: ConfigMapping = {};

  // ---- patient.attributes (Patient-level) ----
  const attributes: Record<string, any> = {};
  let order = 1;
  const patientCurated = CURATED_ATTRS["Patient"] ?? {};
  for (const [name, m] of Object.entries(patientCurated)) {
    attributes[name] = {
      type: m.kind,
      ordered: m.kind === "num",
      measure: m.kind === "num",
      category: m.kind === "text",
      filtercard: { visible: true, order: order++ },
      patientlist: { visible: true },
    };
    mapping[`patient.attributes.${name}`] = m;
  }

  // The patient-count measure must exist in the config so the frontend can
  // resolve measures[].id = "patient.attributes.pcount" via getAttributeByPath.
  attributes["pcount"] = {
    type: "num",
    ordered: false,
    measure: true,
    category: false,
    filtercard: { visible: false },
    patientlist: { visible: false },
  };
  mapping["patient.attributes.pcount"] = { resourceType: "Patient", jsonPath: "$.id", kind: "num", binnable: false };

  // ---- patient.interactions (one per non-Patient resource present) ----
  const interactions: Record<string, any> = {};
  for (const rt of presentTypes) {
    if (rt === "Patient") continue;
    const interName = INTERACTION_NAMES[rt] ?? rt;
    const curated = CURATED_ATTRS[rt];
    if (!curated) continue; // generic fallback deferred (see plan scope)
    const interAttrs: Record<string, any> = {};
    for (const [name, m] of Object.entries(curated)) {
      interAttrs[name] = { type: m.kind, expression: m.jsonPath };
      mapping[`patient.interactions.${interName}.attributes.${name}`] = m;
    }
    interactions[interName] = { name: interName, order: Object.keys(interactions).length + 1, attributes: interAttrs };
  }

  const mriConfig = {
    meta: {
      configId: `fhir-${datasetId}`,
      configVersion: CONFIG_VERSION,
      configName: `FHIR dataset ${datasetId}`,
    },
    config: {
      patient: { attributes, interactions },
      pageTitle: "Patient Analytics",
    },
  };

  return { mriConfig, mapping };
}
