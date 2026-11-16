// Retrieval evaluation for the concept-mapper (no LLM): runs retrieve_candidates
// for every gold row and reports Recall@k and ancestor hits per predicate.
//
//   deno run -A --no-config --import-map plugins/concept-mapping/importmap.json \
//     plugins/concept-mapping/scripts/eval-retrieval.ts <gold.csv> [--limit 30] [--queries english|source|both]
//
// Uses the same env as the agent (CONCEPT_MAPPING_VOCAB_DATABASE_URL or
// DATABASE_URL, CONCEPT_MAPPING_SEMANTIC_SEARCH, ...). Refuses to run when the
// gold overlaps the configured calibration examples.
import pg from "pg";
import { loadExamples } from "../agent/lib/fewshot.ts";
import { ancestorHitRate, type GoldRow, overlappingCodes, parseGoldCsv, recallAtK, recallWithExtra } from "../agent/lib/retrievaleval.ts";
import { type Env, vocabSchema } from "../agent/lib/vocab.ts";
import { retrieveCandidates } from "../agent/tools/retrieve_candidates.ts";

export function queriesFor(row: GoldRow, mode: string): string[] {
  const q = mode === "both"
    ? [row.source_name, row.original_source_name]
    : mode === "source"
    ? [row.original_source_name]
    : [row.source_name];
  return q.filter((s) => s && s.trim());
}

async function main() {
  const env: Env = (k) => Deno.env.get(k);
  const [file, ...rest] = Deno.args;
  if (!file) throw new Error("usage: eval-retrieval.ts <gold.csv> [--limit 30] [--queries english|source|both]");
  const flag = (f: string, d: string) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : d);
  const limit = Number(flag("--limit", "30"));
  const mode = flag("--queries", "english");
  const gold = parseGoldCsv(await Deno.readTextFile(file));
  const overlap = overlappingCodes(gold, await loadExamples(env));
  if (overlap.length) {
    throw new Error(`gold overlaps calibration examples (${overlap.length} rows, e.g. ${overlap[0]}); unset CONCEPT_MAPPING_EXAMPLES_FILE`);
  }
  const url = env("CONCEPT_MAPPING_VOCAB_DATABASE_URL") || env("DATABASE_URL");
  if (!url) throw new Error("set CONCEPT_MAPPING_VOCAB_DATABASE_URL or DATABASE_URL");
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const sql = async (s: string, p?: unknown[]) => ({ rows: (await pool.query(s, p ?? [])).rows });
  try {
    const rows = [];
    const errors = new Set<string>();
    for (const g of gold) {
      const out = await retrieveCandidates({ queries: queriesFor(g, mode), limit }, { sql, env });
      if (out.semantic_error) errors.add(out.semantic_error.slice(0, 120));
      const isAncestor = (c: { sources: string[] }) => c.sources.includes("ancestor");
      rows.push({
        candidates: out.candidates.filter((c) => !isAncestor(c)).map((c) => c.concept_id),
        extra: out.candidates.filter(isAncestor).map((c) => c.concept_id),
        accepted: g.accepted,
        predicate: g.predicate,
      });
    }
    const report = {
      gold: file,
      rows: rows.length,
      mode,
      limit,
      semantic_search: env("CONCEPT_MAPPING_SEMANTIC_SEARCH") || "local",
      // Recall@k over the retrieved candidates only (ancestors excluded).
      recall: recallAtK(rows, [1, 3, 5, 10, 30]),
      // Whether the gold is among all candidates the judges see: retrieved plus appended ancestors.
      recall_with_ancestors: recallWithExtra(rows),
      ancestors_per_row: rows.reduce((n, r) => n + r.extra.length, 0) / Math.max(rows.length, 1),
      gold_is_ancestor_within_2: await ancestorHitRate(sql, vocabSchema(env), rows, 2),
      errors: [...errors],
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    Deno.exit(1);
  }
}
