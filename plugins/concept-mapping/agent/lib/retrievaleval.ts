// Retrieval-only evaluation: is the gold concept among the retrieved
// candidates (Recall@k), and if not, is it an ancestor of one of them (so a
// broader-concept step could reach it)? No LLM involved.
import { parseCsvRecords } from "./csv.ts";
import type { QueryFn } from "./runs.ts";

export interface GoldRow {
  source_data_identifier: string;
  source_code: string;
  original_source_name: string;
  source_name: string;
  accepted: number[];
  predicate: string;
}

export interface RetrievedRow {
  candidates: number[];
  accepted: number[];
  predicate: string;
}

const ALIASES: Record<string, string[]> = {
  source_data_identifier: ["source_data_identifier"],
  source_code: ["source_code"],
  original_source_name: ["original_source_name", "original_source_term"],
  source_name: ["source_name", "source_term"],
  target_concept_id: ["target_concept_id"],
  alternative: ["alternative_target_concept_id", "target_concept_id_b"],
  predicate: ["predicate"],
};

export function parseGoldCsv(text: string): GoldRow[] {
  const records = parseCsvRecords(text);
  const header = (records[0] ?? []).map((h) => h.trim());
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    col[key] = header.findIndex((h) => names.includes(h));
    if (col[key] === -1 && key !== "alternative") throw new Error(`gold CSV: missing column ${names.join(" or ")}`);
  }
  return records.slice(1).map((r) => {
    const get = (k: string) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    return {
      source_data_identifier: get("source_data_identifier"),
      source_code: get("source_code"),
      original_source_name: get("original_source_name"),
      source_name: get("source_name"),
      accepted: [get("target_concept_id"), get("alternative")].map(Number).filter((n) => Number.isInteger(n) && n > 0),
      predicate: get("predicate"),
    };
  });
}

/** Gold rows that also appear among calibration examples (same institution and code). */
export function overlappingCodes(
  gold: Array<{ source_data_identifier: string; source_code: string }>,
  examples: Array<{ source_data_identifier: string; source_code: string }>,
): string[] {
  const ex = new Set(examples.map((e) => `${e.source_data_identifier}|${e.source_code}`));
  return gold.map((g) => `${g.source_data_identifier}|${g.source_code}`).filter((k) => ex.has(k));
}

export function recallAtK(rows: RetrievedRow[], ks: number[]): Record<string, Record<number, number>> {
  const out: Record<string, Record<number, number>> = {};
  for (const group of ["all", "exactMatch", "broadMatch"]) {
    const sel = rows.filter((r) => group === "all" || r.predicate === group);
    out[group] = {};
    for (const k of ks) {
      const hits = sel.filter((r) => r.candidates.slice(0, k).some((c) => r.accepted.includes(c))).length;
      out[group][k] = sel.length ? hits / sel.length : 0;
    }
  }
  return out;
}

/** Share of rows (per predicate) whose gold is an ancestor, within maxLevels, of a top-10 candidate. */
export async function ancestorHitRate(
  q: QueryFn,
  vocab: string,
  rows: RetrievedRow[],
  maxLevels: number,
): Promise<Record<string, number>> {
  const hit: boolean[] = [];
  for (const r of rows) {
    const cands = r.candidates.slice(0, 10);
    if (cands.length === 0 || r.accepted.length === 0) {
      hit.push(false);
      continue;
    }
    const p1 = cands.map((_, i) => `$${i + 1}`).join(", ");
    const p2 = r.accepted.map((_, i) => `$${cands.length + i + 1}`).join(", ");
    const { rows: found } = await q(
      `SELECT 1 FROM ${vocab}.concept_ancestor
        WHERE descendant_concept_id IN (${p1}) AND ancestor_concept_id IN (${p2})
          AND min_levels_of_separation BETWEEN 1 AND $${cands.length + r.accepted.length + 1} LIMIT 1`,
      [...cands, ...r.accepted, maxLevels],
    );
    hit.push(found.length > 0);
  }
  const out: Record<string, number> = {};
  for (const group of ["all", "exactMatch", "broadMatch"]) {
    const idx = rows.map((r, i) => (group === "all" || r.predicate === group ? i : -1)).filter((i) => i >= 0);
    out[group] = idx.length ? idx.filter((i) => hit[i]).length / idx.length : 0;
  }
  return out;
}

/** Share of rows (per predicate) whose gold is in the retrieved list or the appended extras (e.g. ancestors). */
export function recallWithExtra(rows: Array<RetrievedRow & { extra: number[] }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of ["all", "exactMatch", "broadMatch"]) {
    const sel = rows.filter((r) => group === "all" || r.predicate === group);
    const hits = sel.filter((r) => [...r.candidates, ...r.extra].some((c) => r.accepted.includes(c))).length;
    out[group] = sel.length ? hits / sel.length : 0;
  }
  return out;
}
