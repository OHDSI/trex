// OMOP vocabulary access: exact-name lookup (with "Maps to" projection),
// concept details for judging, and validation of a chosen concept.
// Queries use only portable SQL and positional parameters; the schema name is
// the one interpolated identifier and is validated first.
import pg from "pg";
import type { QueryFn } from "./runs.ts";

export type Env = (k: string) => string | undefined;

export interface Concept {
  conceptId: number;
  conceptName: string;
  vocabularyId: string;
  domainId: string;
  conceptClassId: string;
  standardConcept: string | null;
  invalidReason: string | null;
}

export type VerbatimHit = Concept & { matchedVia: "name" | "synonym" | "maps_to"; matchedTerm: string };

export type ConceptDetails = Concept & { synonyms: string[]; parents: string[]; children: string[] };

/** Standard vocabularies the retrieval may return (challenge mapping rules). */
export const RETRIEVAL_VOCABULARIES = [
  "SNOMED",
  "LOINC",
  "CPT4",
  "HCPCS",
  "ICD10PCS",
  "ICD9Proc",
  "OPCS4",
  "OMOP Extension",
  "HemOnc",
  "Cancer Modifier",
  "OMOP Genomic",
  "RxNorm",
  "RxNorm Extension",
  "CVX",
];

/** Preferred order when several concepts are semantically equivalent. */
export const VOCABULARY_PREFERENCE = [
  "SNOMED",
  "LOINC",
  "CPT4",
  "HCPCS",
  "ICD10PCS",
  "ICD9Proc",
  "OPCS4",
  "OMOP Extension",
];

export function vocabSchema(env: Env): string {
  const s = env("CONCEPT_MAPPING_VOCAB_SCHEMA")?.trim() || "vocab";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error(`invalid CONCEPT_MAPPING_VOCAB_SCHEMA: ${JSON.stringify(s)}`);
  return s;
}

const pools = new Map<string, QueryFn>();

/** Query fn for the vocabulary: a dedicated pool if a URL is set, else the worker's own database. */
export function vocabQuery(env: Env, fallback: QueryFn): QueryFn {
  const url = env("CONCEPT_MAPPING_VOCAB_DATABASE_URL")?.trim();
  if (!url) return fallback;
  let q = pools.get(url);
  if (!q) {
    const pool = new pg.Pool({ connectionString: url, max: 4 });
    q = async (sql, params) => ({ rows: (await pool.query(sql, params ?? [])).rows });
    pools.set(url, q);
  }
  return q;
}

/** Placeholders `$from..$from+n-1`. */
function placeholders(from: number, n: number): string {
  return Array.from({ length: n }, (_, i) => `$${from + i}`).join(", ");
}

const CONCEPT_COLUMNS =
  "c.concept_id, c.concept_name, c.vocabulary_id, c.domain_id, c.concept_class_id, c.standard_concept, c.invalid_reason";

interface ConceptRecord {
  concept_id: number;
  concept_name: string;
  vocabulary_id: string;
  domain_id: string;
  concept_class_id: string;
  standard_concept: string | null;
  invalid_reason: string | null;
}

function toConcept(r: ConceptRecord): Concept {
  return {
    conceptId: Number(r.concept_id),
    conceptName: r.concept_name,
    vocabularyId: r.vocabulary_id,
    domainId: r.domain_id,
    conceptClassId: r.concept_class_id,
    standardConcept: r.standard_concept,
    invalidReason: r.invalid_reason,
  };
}

export async function verbatimMatch(q: QueryFn, schema: string, terms: string[], limit: number): Promise<VerbatimHit[]> {
  const cleaned = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (cleaned.length === 0) return [];
  const t = placeholders(1, cleaned.length);
  const v = placeholders(cleaned.length + 1, RETRIEVAL_VOCABULARIES.length);
  const limitParam = `$${cleaned.length + RETRIEVAL_VOCABULARIES.length + 1}`;
  const sql = `
    WITH hits AS (
      SELECT c.concept_id, lower(c.concept_name) AS term, 'name' AS via, 0 AS via_rank
        FROM ${schema}.concept c WHERE lower(c.concept_name) IN (${t})
      UNION ALL
      SELECT s.concept_id, lower(s.concept_synonym_name) AS term, 'synonym' AS via, 1 AS via_rank
        FROM ${schema}.concept_synonym s WHERE lower(s.concept_synonym_name) IN (${t})
    ),
    resolved AS (
      SELECT CASE WHEN src.standard_concept = 'S' THEN src.concept_id ELSE r.concept_id_2 END AS target_id,
             CASE WHEN src.standard_concept = 'S' THEN h.via ELSE 'maps_to' END AS via,
             CASE WHEN src.standard_concept = 'S' THEN h.via_rank ELSE 2 END AS via_rank,
             h.term
        FROM hits h
        JOIN ${schema}.concept src ON src.concept_id = h.concept_id
        LEFT JOIN ${schema}.concept_relationship r
          ON r.concept_id_1 = src.concept_id AND r.relationship_id = 'Maps to' AND r.invalid_reason IS NULL
       WHERE src.standard_concept = 'S' OR r.concept_id_2 IS NOT NULL
    )
    SELECT ${CONCEPT_COLUMNS}, x.via, x.term
      FROM (
        SELECT target_id, via, term,
               row_number() OVER (PARTITION BY target_id ORDER BY via_rank) AS rn,
               min(via_rank) OVER (PARTITION BY target_id) AS best_rank
          FROM resolved
      ) x
      JOIN ${schema}.concept c ON c.concept_id = x.target_id
     WHERE x.rn = 1
       AND c.standard_concept = 'S' AND c.invalid_reason IS NULL
       AND c.vocabulary_id IN (${v})
     ORDER BY x.best_rank, c.concept_id
     LIMIT ${limitParam}`;
  const { rows } = await q(sql, [...cleaned, ...RETRIEVAL_VOCABULARIES, limit]);
  return (rows as Array<ConceptRecord & { via: VerbatimHit["matchedVia"]; term: string }>).map((r) => ({
    ...toConcept(r),
    matchedVia: r.via,
    matchedTerm: r.term,
  }));
}

/** Plain concept rows for ids (no hierarchy); cheap enough to filter retrieval hits. */
export async function conceptsByIds(q: QueryFn, schema: string, ids: number[]): Promise<Concept[]> {
  const unique = [...new Set(ids.map(Number).filter(Number.isInteger))];
  if (unique.length === 0) return [];
  const { rows } = await q(
    `SELECT ${CONCEPT_COLUMNS} FROM ${schema}.concept c WHERE c.concept_id IN (${placeholders(1, unique.length)})`,
    unique,
  );
  return (rows as ConceptRecord[]).map(toConcept);
}

const HIERARCHY_LIMIT = 5;

export async function conceptDetails(q: QueryFn, schema: string, ids: number[]): Promise<ConceptDetails[]> {
  const concepts = await conceptsByIds(q, schema, ids);
  if (concepts.length === 0) return [];
  const found = concepts.map((c) => c.conceptId);
  const p = placeholders(1, found.length);
  const syn = await q(
    `SELECT concept_id, concept_synonym_name AS name FROM ${schema}.concept_synonym WHERE concept_id IN (${p})`,
    found,
  );
  // LATERAL ... LIMIT keeps very general concepts (hundreds of thousands of
  // descendants) cheap: only the first few direct parents/children are read.
  const rel = await q(
    `SELECT ids.concept_id AS concept_id, 'parent' AS kind, x.name
       FROM ${schema}.concept ids
       CROSS JOIN LATERAL (
         SELECT pc.concept_name AS name
           FROM ${schema}.concept_ancestor a JOIN ${schema}.concept pc ON pc.concept_id = a.ancestor_concept_id
          WHERE a.descendant_concept_id = ids.concept_id AND a.min_levels_of_separation = 1
          ORDER BY pc.concept_name LIMIT ${HIERARCHY_LIMIT}) x
      WHERE ids.concept_id IN (${p})
     UNION ALL
     SELECT ids.concept_id AS concept_id, 'child' AS kind, x.name
       FROM ${schema}.concept ids
       CROSS JOIN LATERAL (
         SELECT cc.concept_name AS name
           FROM ${schema}.concept_ancestor a JOIN ${schema}.concept cc ON cc.concept_id = a.descendant_concept_id
          WHERE a.ancestor_concept_id = ids.concept_id AND a.min_levels_of_separation = 1
          ORDER BY cc.concept_name LIMIT ${HIERARCHY_LIMIT}) x
      WHERE ids.concept_id IN (${p})`,
    found,
  );
  const relRows = rel.rows as Array<{ concept_id: number; kind: string; name: string }>;
  return concepts.map((c) => ({
    ...c,
    synonyms: (syn.rows as Array<{ concept_id: number; name: string }>)
      .filter((s) => Number(s.concept_id) === c.conceptId && s.name !== c.conceptName)
      .map((s) => s.name),
    parents: relRows.filter((r) => Number(r.concept_id) === c.conceptId && r.kind === "parent").map((r) => r.name),
    children: relRows.filter((r) => Number(r.concept_id) === c.conceptId && r.kind === "child").map((r) => r.name),
  }));
}

export async function checkMappable(
  q: QueryFn,
  schema: string,
  id: number,
  claimedName: string,
): Promise<{ ok: true; concept: Concept } | { ok: false; reason: string }> {
  const { rows } = await q(`SELECT ${CONCEPT_COLUMNS} FROM ${schema}.concept c WHERE c.concept_id = $1`, [id]);
  if (rows.length === 0) return { ok: false, reason: "not found" };
  const c = toConcept(rows[0] as ConceptRecord);
  if (c.standardConcept !== "S") return { ok: false, reason: "not standard" };
  if (c.invalidReason) return { ok: false, reason: `invalid (${c.invalidReason})` };
  if (!RETRIEVAL_VOCABULARIES.includes(c.vocabularyId)) {
    return { ok: false, reason: `vocabulary ${c.vocabularyId} is not allowed` };
  }
  if (c.conceptName.trim().toLowerCase() !== claimedName.trim().toLowerCase()) {
    return { ok: false, reason: `name mismatch: vocabulary has "${c.conceptName}"` };
  }
  return { ok: true, concept: c };
}
