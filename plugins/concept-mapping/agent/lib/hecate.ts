// Client for the Hecate semantic search API over the OHDSI vocabularies.
import { type Concept, RETRIEVAL_VOCABULARIES } from "./vocab.ts";

interface HecateConcept {
  concept_id: number | string;
  concept_name?: string;
  vocabulary_id?: string;
  domain_id?: string;
  concept_class_id?: string;
}

export async function hecateSearch(
  baseUrl: string,
  query: string,
  limit: number,
  fetchFn: typeof fetch = fetch,
): Promise<Concept[]> {
  const url = new URL("/api/search_standard", baseUrl);
  url.search = new URLSearchParams({ q: query, limit: String(limit), standard_concept: "S" }).toString();
  const res = await fetchFn(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Hecate returned HTTP ${res.status}`);
  const groups = await res.json() as Array<{ concepts?: HecateConcept[] }>;
  const seen = new Set<number>();
  const out: Concept[] = [];
  for (const g of groups ?? []) {
    for (const c of g.concepts ?? []) {
      const id = Number(c.concept_id);
      if (!Number.isInteger(id) || seen.has(id) || !RETRIEVAL_VOCABULARIES.includes(c.vocabulary_id ?? "")) continue;
      seen.add(id);
      out.push({
        conceptId: id,
        conceptName: c.concept_name ?? "",
        vocabularyId: c.vocabulary_id ?? "",
        domainId: c.domain_id ?? "",
        conceptClassId: c.concept_class_id ?? "",
        standardConcept: "S",
        invalidReason: null,
      });
    }
  }
  return out.slice(0, limit);
}
