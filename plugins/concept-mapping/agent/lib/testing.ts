// Test-only helpers: an in-process Postgres (PGlite) exposed as the eve
// QueryFn shape, with the plugin's migration applied.
import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { vector } from "npm:@electric-sql/pglite@0.3/vector";

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

const MIGRATION = new URL("../../migrations/V1__initial_schema.sql", import.meta.url);

export async function pgSql(opts: { migrate?: boolean } = {}): Promise<QueryFn> {
  const db = new PGlite({ extensions: { vector } });
  if (opts.migrate !== false) {
    // trex creates the plugin schema before running migrations; mirror that.
    await db.exec("CREATE SCHEMA IF NOT EXISTS concept_mapping");
    await db.exec(await Deno.readTextFile(MIGRATION));
  }
  return async (sql, params) => {
    const r = await db.query(sql, params ?? []);
    return { rows: r.rows as unknown[] };
  };
}

export async function execAll(sql: QueryFn, script: string): Promise<void> {
  for (const stmt of script.split(";").map((s) => s.trim()).filter(Boolean)) await sql(stmt);
}

// A tiny OMOP vocabulary in schema `vocab`, enough to exercise lookups.
export const VOCAB_FIXTURE = `
CREATE SCHEMA IF NOT EXISTS vocab;
CREATE TABLE vocab.concept (concept_id int primary key, concept_name text, domain_id text, vocabulary_id text, concept_class_id text, standard_concept text, concept_code text, invalid_reason text);
CREATE TABLE vocab.concept_synonym (concept_id int, concept_synonym_name text, language_concept_id int);
CREATE TABLE vocab.concept_relationship (concept_id_1 int, concept_id_2 int, relationship_id text, invalid_reason text);
CREATE TABLE vocab.concept_ancestor (ancestor_concept_id int, descendant_concept_id int, min_levels_of_separation int, max_levels_of_separation int);
INSERT INTO vocab.concept VALUES
 (9000101, 'Keyhole removal of test organ', 'Procedure', 'SNOMED', 'Procedure', 'S', 'T-1', NULL),
 (9000102, 'Removal of test organ', 'Procedure', 'SNOMED', 'Procedure', 'S', 'T-2', NULL),
 (9000201, 'Solo talk therapy', 'Procedure', 'SNOMED', 'Procedure', 'S', 'T-3', NULL),
 (2000001, 'Keyhole removal of test organ NOS', 'Procedure', 'ICD9Proc', '4-dig billing code', NULL, '51.23', NULL),
 (3000001, 'Old procedure', 'Procedure', 'SNOMED', 'Procedure', 'S', '1', 'D'),
 (3000002, 'Classification procedure', 'Procedure', 'SNOMED', 'Procedure', 'C', '2', NULL),
 (9000103, 'Veterinary removal of test organ', 'Procedure', 'Nebraska Lexicon', 'Procedure', 'S', '3', NULL);
INSERT INTO vocab.concept_synonym VALUES (9000201, 'Talk therapy, solo', 4180186);
INSERT INTO vocab.concept_relationship VALUES (2000001, 9000101, 'Maps to', NULL);
INSERT INTO vocab.concept_ancestor VALUES (9000102, 9000101, 1, 1), (9000101, 9000101, 0, 0)
`;

export async function vocabSql(): Promise<QueryFn> {
  const sql = await pgSql();
  await execAll(sql, VOCAB_FIXTURE);
  return sql;
}

/** Deterministic fake embedder: a 4-dimensional vector derived from the text. */
export function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map((t) => {
    const v = [0, 0, 0, 0];
    for (const [i, ch] of [...t.toLowerCase()].entries()) v[i % 4] += ch.charCodeAt(0) / 1000;
    return v;
  }));
}
