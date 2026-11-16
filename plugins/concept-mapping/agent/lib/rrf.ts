// Reciprocal rank fusion (Cormack et al. 2009) over named result lists.
import { type Concept, VOCABULARY_PREFERENCE } from "./vocab.ts";

export interface RankedList {
  source: string; // "verbatim" or "semantic:<query>"
  concepts: Concept[];
}

export type Fused = Concept & { score: number; sources: string[] };

const prefRank = (v: string) => {
  const i = VOCABULARY_PREFERENCE.indexOf(v);
  return i === -1 ? VOCABULARY_PREFERENCE.length : i;
};

export function rrf(lists: RankedList[], k = 60): Fused[] {
  const byId = new Map<number, Fused>();
  for (const { source, concepts } of lists) {
    concepts.forEach((c, i) => {
      const f = byId.get(c.conceptId) ?? { ...c, score: 0, sources: [] };
      if (!f.sources.includes(source)) {
        f.score += 1 / (k + i + 1);
        f.sources.push(source);
      }
      byId.set(c.conceptId, f);
    });
  }
  for (const f of byId.values()) f.sources.sort();
  return [...byId.values()].sort((a, b) =>
    b.score - a.score || prefRank(a.vocabularyId) - prefRank(b.vocabularyId) || a.conceptId - b.conceptId
  );
}

export function retrievalConfidence(fused: Fused[]): "high" | "medium" | "low" {
  const top = fused[0];
  if (!top) return "low";
  if (top.sources.includes("verbatim") || top.sources.length >= 2) return "high";
  if (top.sources.length === 1 && top.sources[0].startsWith("semantic:")) return "low";
  return "medium";
}
