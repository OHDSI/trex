// @ts-nocheck - Deno edge function
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";

const FHIR_JSON = { "content-type": "application/fhir+json" };

export function handleStructureDefinitionList(state: AppState): Response {
  return new Response(JSON.stringify({ resourceTypes: state.registry.listResourceTypes() }), { status: 200, headers: FHIR_JSON });
}

export function handleStructureDefinitionRead(state: AppState, type: string): Response {
  const sd = state.registry.getResourceDefinition(type);
  if (!sd) throw FhirError.notFound(`StructureDefinition '${type}' not found`);
  return new Response(JSON.stringify(sd), { status: 200, headers: FHIR_JSON });
}
