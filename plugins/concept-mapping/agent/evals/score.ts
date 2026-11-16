// Scores a submission CSV against gold mappings: a row is correct when its
// target or alternative concept id is among the gold's accepted ids. Rows
// missing from the predictions count as wrong.
import { parseCsvRecords, SUBMISSION_HEADER } from "../lib/csv.ts";

export interface GoldRow {
  source_data_identifier: string;
  source_code: string;
  accepted: number[];
}

export interface Score {
  n: number;
  correct: number;
  accuracy: number;
  byInstitution: Record<string, { n: number; correct: number }>;
}

/** Accepts a bare CSV or a reply that contains one (e.g. in a code fence). */
export function score(predictions: string, gold: GoldRow[]): Score {
  const start = predictions.indexOf(SUBMISSION_HEADER);
  const body = start === -1 ? "" : predictions.slice(start).split(/\n```/)[0];
  const records = parseCsvRecords(body);
  const header = records[0] ?? [];
  const col = (name: string) => header.indexOf(name);
  const picks = new Map<string, number[]>();
  for (const r of records.slice(1)) {
    const key = `${r[col("source_data_identifier")]}|${r[col("source_code")]}`;
    const ids = [r[col("target_concept_id")], r[col("alternative_target_concept_id")]]
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0);
    picks.set(key, ids);
  }
  const byInstitution: Score["byInstitution"] = {};
  let correct = 0;
  for (const g of gold) {
    const hit = (picks.get(`${g.source_data_identifier}|${g.source_code}`) ?? []).some((id) => g.accepted.includes(id));
    const b = (byInstitution[g.source_data_identifier] ??= { n: 0, correct: 0 });
    b.n++;
    if (hit) {
      b.correct++;
      correct++;
    }
  }
  return { n: gold.length, correct, accuracy: gold.length ? correct / gold.length : 0, byInstitution };
}
