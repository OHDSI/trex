// Self-consistency vote over judge picks: majority on concept id, then
// majority on predicate among the judges that picked the winner.
import type { Predicate } from "./csv.ts";

export interface Vote {
  concept_id: number | null;
  predicate: string | null;
}

export interface VoteResult {
  concept_id: number | null;
  predicate: Predicate | null;
  agreement: number;
  tie: boolean;
}

export function majorityVote(votes: Vote[]): VoteResult {
  const counts = new Map<number, number>();
  for (const v of votes) if (v.concept_id !== null) counts.set(v.concept_id, (counts.get(v.concept_id) ?? 0) + 1);
  if (counts.size === 0) return { concept_id: null, predicate: null, agreement: 0, tie: false };
  const best = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, n]) => n === best).map(([id]) => id);
  // Map preserves insertion order, so tied[0] is the first-voted of the tied ids.
  const winner = tied[0];
  const preds = votes.filter((v) => v.concept_id === winner).map((v) => v.predicate);
  const exact = preds.filter((p) => p === "exactMatch").length;
  const broad = preds.filter((p) => p === "broadMatch").length;
  return { concept_id: winner, predicate: exact > broad ? "exactMatch" : "broadMatch", agreement: best, tie: tied.length > 1 };
}
