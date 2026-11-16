// Local hybrid search index over the OMOP vocabulary, kept in the vocabulary
// database (schema CONCEPT_MAPPING_INDEX_SCHEMA): one row per searchable term
// (standard concept names, English synonyms, and names of non-standard
// concepts that map to a standard concept), with a full-text vector for
// lexical search and an optional pgvector embedding for dense search. Built
// and embedded by scripts/build-index.ts; queried by retrieve_candidates.
import type { QueryFn } from "./runs.ts";
import { type Concept, type Env, RETRIEVAL_VOCABULARIES } from "./vocab.ts";

const ENGLISH = 4180186; // language_concept_id of English synonyms

export function indexSchema(env: Env): string {
  const s = env("CONCEPT_MAPPING_INDEX_SCHEMA")?.trim() || "concept_mapping_search";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error(`invalid CONCEPT_MAPPING_INDEX_SCHEMA: ${JSON.stringify(s)}`);
  return s;
}

const ph = (from: number, n: number) => Array.from({ length: n }, (_, i) => `$${from + i}`).join(", ");

export interface BuildOptions {
  vocabSchema: string;
  indexSchema: string;
  /** Embedding dimensions (fixed per index). */
  dims: number;
  /** Embedding model string the vectors are made with ("" for lexical only). */
  model: string;
}

/** Creates the index tables (idempotent) and inserts any missing terms. Returns the term count. */
export async function buildIndex(q: QueryFn, o: BuildOptions): Promise<number> {
  const { vocabSchema: v, indexSchema: x } = o;
  if (!Number.isInteger(o.dims) || o.dims < 1 || o.dims > 4000) throw new Error(`invalid dims ${o.dims}`);
  await q("CREATE EXTENSION IF NOT EXISTS vector");
  await q(`CREATE SCHEMA IF NOT EXISTS ${x}`);
  await q(`CREATE TABLE IF NOT EXISTS ${x}.meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const { rows: metaRows } = await q(`SELECT key, value FROM ${x}.meta`);
  const meta = Object.fromEntries((metaRows as Array<{ key: string; value: string }>).map((r) => [r.key, r.value]));
  if (meta.dims && Number(meta.dims) !== o.dims) {
    throw new Error(`index ${x} was built with ${meta.dims} dimensions, not ${o.dims}; drop schema ${x} to rebuild`);
  }
  if (meta.model && o.model && meta.model !== o.model) {
    throw new Error(`index ${x} was embedded with ${meta.model}, not ${o.model}; drop schema ${x} to rebuild`);
  }
  await q(`CREATE TABLE IF NOT EXISTS ${x}.terms (
    id BIGSERIAL PRIMARY KEY,
    concept_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('name', 'synonym', 'source')),
    tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', term)) STORED,
    embedding HALFVEC(${o.dims}),
    UNIQUE (concept_id, term)
  )`);
  await q(`CREATE INDEX IF NOT EXISTS terms_tsv_idx ON ${x}.terms USING gin (tsv)`);
  await q(`CREATE INDEX IF NOT EXISTS terms_pending_idx ON ${x}.terms (id) WHERE embedding IS NULL`);
  await q(
    `INSERT INTO ${x}.meta (key, value) VALUES ('dims', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(o.dims)],
  );
  if (o.model) {
    await q(
      `INSERT INTO ${x}.meta (key, value) VALUES ('model', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [o.model],
    );
  }

  const vocabs = ph(1, RETRIEVAL_VOCABULARIES.length);
  const target = `c.standard_concept = 'S' AND c.invalid_reason IS NULL AND c.vocabulary_id IN (${vocabs})`;
  await q(
    `INSERT INTO ${x}.terms (concept_id, term, kind)
     SELECT c.concept_id, c.concept_name, 'name' FROM ${v}.concept c WHERE ${target}
     ON CONFLICT (concept_id, term) DO NOTHING`,
    RETRIEVAL_VOCABULARIES,
  );
  await q(
    `INSERT INTO ${x}.terms (concept_id, term, kind)
     SELECT DISTINCT c.concept_id, s.concept_synonym_name, 'synonym'
       FROM ${v}.concept_synonym s JOIN ${v}.concept c ON c.concept_id = s.concept_id
      WHERE ${target} AND s.language_concept_id = ${ENGLISH} AND s.concept_synonym_name <> c.concept_name
     ON CONFLICT (concept_id, term) DO NOTHING`,
    RETRIEVAL_VOCABULARIES,
  );
  await q(
    `INSERT INTO ${x}.terms (concept_id, term, kind)
     SELECT DISTINCT c.concept_id, src.concept_name, 'source'
       FROM ${v}.concept src
       JOIN ${v}.concept_relationship r
         ON r.concept_id_1 = src.concept_id AND r.relationship_id = 'Maps to' AND r.invalid_reason IS NULL
       JOIN ${v}.concept c ON c.concept_id = r.concept_id_2
      WHERE src.standard_concept IS DISTINCT FROM 'S' AND ${target} AND src.concept_name <> c.concept_name
     ON CONFLICT (concept_id, term) DO NOTHING`,
    RETRIEVAL_VOCABULARIES,
  );
  return (await indexStatus(q, x)).terms;
}

/** Creates the vector index once embeddings exist (much faster than maintaining it while loading). */
export async function createVectorIndex(q: QueryFn, x: string): Promise<void> {
  await q(`CREATE INDEX IF NOT EXISTS terms_embedding_idx ON ${x}.terms USING hnsw (embedding halfvec_cosine_ops)`);
}

const vecLiteral = (v: number[]) => `[${v.join(",")}]`;

/** Embeds terms that have no embedding yet, `batch` at a time. Returns how many were embedded. */
export async function embedPending(
  q: QueryFn,
  x: string,
  embed: (texts: string[]) => Promise<number[][]>,
  batch: number,
  onProgress?: (done: number) => void,
): Promise<number> {
  let done = 0;
  for (;;) {
    const { rows } = await q(`SELECT id, term FROM ${x}.terms WHERE embedding IS NULL ORDER BY id LIMIT $1`, [batch]);
    const pending = rows as Array<{ id: number | string; term: string }>;
    if (pending.length === 0) return done;
    const vectors = await embed(pending.map((r) => r.term));
    const params: unknown[] = [];
    const values = pending.map((r, i) => {
      params.push(Number(r.id), vecLiteral(vectors[i]));
      return `($${params.length - 1}::bigint, $${params.length}::halfvec)`;
    });
    await q(
      `UPDATE ${x}.terms t SET embedding = v.e FROM (VALUES ${values.join(", ")}) AS v(id, e) WHERE t.id = v.id`,
      params,
    );
    done += pending.length;
    onProgress?.(done);
  }
}

export interface IndexStatus {
  exists: boolean;
  terms: number;
  embedded: number;
  dims?: number;
  model?: string;
}

export async function indexStatus(q: QueryFn, x: string): Promise<IndexStatus> {
  const { rows } = await q(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'terms'",
    [x],
  );
  if (rows.length === 0) return { exists: false, terms: 0, embedded: 0 };
  const counts = (await q(
    `SELECT count(*)::int AS terms, count(embedding)::int AS embedded FROM ${x}.terms`,
  )).rows[0] as { terms: number; embedded: number };
  const meta = Object.fromEntries(
    ((await q(`SELECT key, value FROM ${x}.meta`)).rows as Array<{ key: string; value: string }>).map((r) => [r.key, r.value]),
  );
  return {
    exists: true,
    terms: Number(counts.terms),
    embedded: Number(counts.embedded),
    dims: meta.dims ? Number(meta.dims) : undefined,
    model: meta.model,
  };
}

const CONCEPT_COLUMNS =
  "c.concept_id, c.concept_name, c.vocabulary_id, c.domain_id, c.concept_class_id, c.standard_concept, c.invalid_reason";

interface Row {
  concept_id: number;
  concept_name: string;
  vocabulary_id: string;
  domain_id: string;
  concept_class_id: string;
  standard_concept: string | null;
  invalid_reason: string | null;
}

const toConcept = (r: Row): Concept => ({
  conceptId: Number(r.concept_id),
  conceptName: r.concept_name,
  vocabularyId: r.vocabulary_id,
  domainId: r.domain_id,
  conceptClassId: r.concept_class_id,
  standardConcept: r.standard_concept,
  invalidReason: r.invalid_reason,
});

/**
 * Full-text search: any query word may match (OR), ranked by cover density,
 * best term per concept; equal ranks prefer the shorter (more general) name.
 * Restricted to valid standard concepts.
 */
export async function lexicalSearch(q: QueryFn, v: string, x: string, query: string, limit: number): Promise<Concept[]> {
  const { rows } = await q(
    `WITH tq AS (
       SELECT CASE WHEN numnode(plainto_tsquery('english', $1)) = 0 THEN NULL
                   ELSE replace(plainto_tsquery('english', $1)::text, ' & ', ' | ')::tsquery END AS q
     ),
     hits AS (
       SELECT t.concept_id, max(ts_rank_cd(t.tsv, tq.q)) AS rank, min(length(t.term)) AS len
         FROM ${x}.terms t, tq
        WHERE tq.q IS NOT NULL AND t.tsv @@ tq.q
        GROUP BY t.concept_id
        ORDER BY rank DESC, len, t.concept_id
        LIMIT $2
     )
     SELECT ${CONCEPT_COLUMNS} FROM hits h JOIN ${v}.concept c ON c.concept_id = h.concept_id
      WHERE c.standard_concept = 'S' AND c.invalid_reason IS NULL
      ORDER BY h.rank DESC, h.len, c.concept_id`,
    [query, limit],
  );
  return (rows as Row[]).map(toConcept);
}

/** Nearest terms by cosine distance (HNSW), best term per concept. */
export async function denseSearch(q: QueryFn, v: string, x: string, vec: number[], limit: number): Promise<Concept[]> {
  const { rows } = await q(
    `WITH nn AS (
       SELECT concept_id, embedding <=> $1::halfvec AS d
         FROM ${x}.terms WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::halfvec
        LIMIT $2
     ),
     best AS (SELECT concept_id, min(d) AS d FROM nn GROUP BY concept_id)
     SELECT ${CONCEPT_COLUMNS} FROM best b JOIN ${v}.concept c ON c.concept_id = b.concept_id
      WHERE c.standard_concept = 'S' AND c.invalid_reason IS NULL
      ORDER BY b.d, c.concept_id
      LIMIT $3`,
    [vecLiteral(vec), limit * 3, limit],
  );
  return (rows as Row[]).map(toConcept);
}
