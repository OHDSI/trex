// Broader-concept candidates: ancestors of the top retrieved concepts, scored
// by how much of the top of the list lies below them (rank-weighted, as in
// reciprocal rank fusion). A broadMatch target is often the parent of what
// retrieval finds, and the judges can only pick concepts that are candidates.
import type { QueryFn } from "./runs.ts";
import { type Concept, RETRIEVAL_VOCABULARIES } from "./vocab.ts";

export interface AncestorOptions {
  /** Levels above a candidate to consider. */
  maxLevels: number;
  /** Minimum rank-weighted share of the top candidates below an ancestor. */
  minSupport: number;
  /** Maximum ancestors returned. */
  cap: number;
  /** Minimum depth below a hierarchy root (0 = roots allowed). */
  minDepth: number;
}

export type AncestorCandidate = Concept & { support: number; depth: number };

const RRF_K = 60;
const ph = (from: number, n: number) => Array.from({ length: n }, (_, i) => `$${from + i}`).join(", ");

export async function ancestorCandidates(
  q: QueryFn,
  vocab: string,
  top: Array<{ conceptId: number; rank: number }>,
  o: AncestorOptions,
): Promise<AncestorCandidate[]> {
  if (top.length === 0) return [];
  const weight = new Map(top.map((t) => [t.conceptId, 1 / (RRF_K + t.rank)]));
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  const ids = [...weight.keys()];
  const vStart = ids.length + 1;
  const { rows } = await q(
    `SELECT a.descendant_concept_id AS below, c.concept_id, c.concept_name, c.vocabulary_id, c.domain_id,
            c.concept_class_id, c.standard_concept, c.invalid_reason
       FROM ${vocab}.concept_ancestor a
       JOIN ${vocab}.concept c ON c.concept_id = a.ancestor_concept_id
      WHERE a.descendant_concept_id IN (${ph(1, ids.length)})
        AND a.min_levels_of_separation BETWEEN 1 AND $${vStart + RETRIEVAL_VOCABULARIES.length}
        AND c.standard_concept = 'S' AND c.invalid_reason IS NULL
        AND c.vocabulary_id IN (${ph(vStart, RETRIEVAL_VOCABULARIES.length)})`,
    [...ids, ...RETRIEVAL_VOCABULARIES, o.maxLevels],
  );
  type Row = {
    below: number;
    concept_id: number;
    concept_name: string;
    vocabulary_id: string;
    domain_id: string;
    concept_class_id: string;
    standard_concept: string | null;
    invalid_reason: string | null;
  };
  const found = new Map<number, { concept: Concept; support: number }>();
  for (const r of rows as Row[]) {
    const id = Number(r.concept_id);
    if (weight.has(id)) continue; // already a candidate
    const entry = found.get(id) ?? {
      concept: {
        conceptId: id,
        conceptName: r.concept_name,
        vocabularyId: r.vocabulary_id,
        domainId: r.domain_id,
        conceptClassId: r.concept_class_id,
        standardConcept: r.standard_concept,
        invalidReason: r.invalid_reason,
      },
      support: 0,
    };
    entry.support += (weight.get(Number(r.below)) ?? 0) / total;
    found.set(id, entry);
  }
  const supported = [...found.entries()].filter(([, e]) => e.support >= o.minSupport - 1e-9);
  if (supported.length === 0) return [];
  const sIds = supported.map(([id]) => id);

  // Depth: longest path up to any ancestor (0 for a root).
  const depthRows = (await q(
    `SELECT descendant_concept_id AS id, max(max_levels_of_separation) AS depth
       FROM ${vocab}.concept_ancestor
      WHERE descendant_concept_id IN (${ph(1, sIds.length)}) AND ancestor_concept_id <> descendant_concept_id
      GROUP BY descendant_concept_id`,
    sIds,
  )).rows as Array<{ id: number; depth: number }>;
  const depth = new Map(depthRows.map((r) => [Number(r.id), Number(r.depth)]));
  const deep = sIds.filter((id) => (depth.get(id) ?? 0) >= o.minDepth);
  if (deep.length === 0) return [];

  // Keep only the most specific: drop any kept concept that is an ancestor of another kept one.
  const rel = (await q(
    `SELECT DISTINCT ancestor_concept_id AS id FROM ${vocab}.concept_ancestor
      WHERE ancestor_concept_id IN (${ph(1, deep.length)}) AND descendant_concept_id IN (${ph(deep.length + 1, deep.length)})
        AND ancestor_concept_id <> descendant_concept_id`,
    [...deep, ...deep],
  )).rows as Array<{ id: number }>;
  const general = new Set(rel.map((r) => Number(r.id)));

  return deep
    .filter((id) => !general.has(id))
    .map((id) => ({
      ...found.get(id)!.concept,
      support: Math.round(found.get(id)!.support * 1000) / 1000,
      depth: depth.get(id) ?? 0,
    }))
    .sort((a, b) => b.depth - a.depth || b.support - a.support || a.conceptId - b.conceptId)
    .slice(0, o.cap);
}
