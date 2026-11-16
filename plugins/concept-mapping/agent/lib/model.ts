// Model selection for the concept-mapper agent. Mapping quality depends
// heavily on the model, so there is no built-in default: a deployment picks
// one explicitly (agent-specific var first, then the host-wide default).
export function resolveConceptMappingModel(env: (k: string) => string | undefined): string {
  for (const key of ["CONCEPT_MAPPING_MODEL", "TREX_AGENTS_DEFAULT_MODEL"]) {
    const v = env(key)?.trim();
    if (v) return v;
  }
  throw new Error(
    "concept-mapper: no model configured (set CONCEPT_MAPPING_MODEL or TREX_AGENTS_DEFAULT_MODEL to a provider/model-id string)",
  );
}
