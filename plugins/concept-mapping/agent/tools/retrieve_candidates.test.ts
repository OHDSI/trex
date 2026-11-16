import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { execAll, fakeEmbed, HIERARCHY_FIXTURE, vocabSql } from "../lib/testing.ts";
import { buildIndex, embedPending } from "../lib/searchindex.ts";
import { retrieveCandidates } from "./retrieve_candidates.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];
const noSleep = () => Promise.resolve();

Deno.test("with semantic search disabled it returns verbatim-only candidates and never fetches", async () => {
  const sql = await vocabSql();
  let fetched = false;
  const out = await retrieveCandidates(
    { queries: ["Keyhole removal of test organ"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "off" }), fetchFn: (() => { fetched = true; throw new Error(); }) as typeof fetch, sleep: noSleep },
  );
  assertEquals(fetched, false);
  assertEquals(out.semantic_error, "semantic search disabled");
  assertEquals(out.candidates.map((c) => c.concept_id), [9000101]);
  assertEquals(out.retrieval_confidence, "high");
});

Deno.test("a failing Hecate call degrades to low confidence with the error message", async () => {
  const sql = await vocabSql();
  const out = await retrieveCandidates(
    { queries: ["something unknown"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "hecate", HECATE_URL: "https://h.example" }), fetchFn: (() => Promise.reject(new Error("connect refused"))) as typeof fetch, sleep: noSleep },
  );
  assertEquals(out.retrieval_confidence, "low");
  assertMatch(out.semantic_error ?? "", /connect refused/);
});

Deno.test("semantic hits missing from the local vocabulary are dropped", async () => {
  const sql = await vocabSql();
  const fetchFn = () => Promise.resolve(new Response(JSON.stringify([{ score: 1, concepts: [
    { concept_id: 88888888, concept_name: "Not in local vocab", vocabulary_id: "SNOMED", domain_id: "Procedure" },
    { concept_id: 9000201, concept_name: "Solo talk therapy", vocabulary_id: "SNOMED", domain_id: "Procedure" },
  ] }])));
  const out = await retrieveCandidates(
    { queries: ["talk therapy"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "hecate", HECATE_URL: "https://h.example" }), fetchFn: fetchFn as typeof fetch, sleep: noSleep },
  );
  assertEquals(out.candidates.map((c) => c.concept_id), [9000201]);
});

Deno.test("limit caps the number of candidates", async () => {
  const sql = await vocabSql();
  const concepts = [9000101, 9000102, 9000201].map((id) => ({ concept_id: id, concept_name: "n", vocabulary_id: "SNOMED", domain_id: "Procedure" }));
  const fetchFn = () => Promise.resolve(new Response(JSON.stringify([{ score: 1, concepts }])));
  const out = await retrieveCandidates(
    { queries: ["q"], limit: 2 },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "hecate", HECATE_URL: "https://h.example" }), fetchFn: fetchFn as typeof fetch, sleep: noSleep },
  );
  assertEquals(out.candidates.length, 2);
  assert(out.candidates.every((c, i) => c.rank === i + 1));
});

Deno.test("after the first semantic failure the remaining queries are skipped", async () => {
  const sql = await vocabSql();
  let calls = 0;
  const out = await retrieveCandidates(
    { queries: ["a", "b", "c"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "hecate", HECATE_URL: "https://h.example" }), fetchFn: (() => { calls++; return Promise.reject(new Error("timeout")); }) as typeof fetch, sleep: noSleep },
  );
  assertEquals(calls, 1);
  assertMatch(out.semantic_error ?? "", /skipped 2 remaining queries/);
});

Deno.test("filtering semantic hits does not touch the hierarchy tables", async () => {
  const base = await vocabSql();
  const seen: string[] = [];
  const sql = (q: string, p?: unknown[]) => { seen.push(q); return base(q, p); };
  const fetchFn = () => Promise.resolve(new Response(JSON.stringify([{ score: 1, concepts: [
    { concept_id: 9000201, concept_name: "Solo talk therapy", vocabulary_id: "SNOMED", domain_id: "Procedure" },
  ] }])));
  await retrieveCandidates({ queries: ["talk therapy"] }, { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "hecate", HECATE_URL: "https://h.example", CONCEPT_MAPPING_ANCESTOR_CANDIDATES: "off" }), fetchFn: fetchFn as typeof fetch, sleep: noSleep });
  assert(!seen.some((q) => q.includes("concept_ancestor")), "retrieval should not query concept_ancestor");
});

Deno.test("hecate mode without HECATE_URL reports the misconfiguration and never fetches", async () => {
  const sql = await vocabSql();
  let fetched = false;
  const out = await retrieveCandidates(
    { queries: ["Keyhole removal of test organ"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "hecate" }), fetchFn: (() => { fetched = true; throw new Error(); }) as typeof fetch, sleep: noSleep },
  );
  assertEquals(fetched, false);
  assertEquals(out.semantic_error, "CONCEPT_MAPPING_SEMANTIC_SEARCH=hecate but HECATE_URL is not set");
});

Deno.test("local mode (the default) without a built index explains how to build it", async () => {
  const sql = await vocabSql();
  const out = await retrieveCandidates({ queries: ["organ removal"] }, { sql, env: env({}), sleep: noSleep });
  assertMatch(out.semantic_error ?? "", /local search index .* not built/);
  assertEquals(out.retrieval_confidence, "low");
});

Deno.test("local mode uses lexical search without any network access", async () => {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: "concept_mapping_search", dims: 4, model: "" });
  const out = await retrieveCandidates(
    { queries: ["organ removal keyhole"] },
    { sql, env: env({}), fetchFn: (() => { throw new Error("no network"); }) as typeof fetch, sleep: noSleep },
  );
  assertEquals(out.semantic_error, undefined);
  assertEquals(out.candidates.map((c) => c.concept_id), [9000101, 9000102]);
  assertEquals(out.candidates[0].sources, ["lexical:organ removal keyhole"]);
});

Deno.test("local mode adds dense hits when the index is embedded with the configured model", async () => {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: "concept_mapping_search", dims: 4, model: "test/fake" });
  await embedPending(sql, "concept_mapping_search", fakeEmbed, 10);
  const out = await retrieveCandidates(
    { queries: ["Talk therapy, solo"] },
    { sql, env: env({ CONCEPT_MAPPING_EMBEDDING_MODEL: "test/fake" }), embed: fakeEmbed, sleep: noSleep },
  );
  const top = out.candidates[0];
  assertEquals(top.concept_id, 9000201);
  assert(top.sources.includes("dense:Talk therapy, solo"));
  assert(top.sources.includes("verbatim"));
});

Deno.test("an embedding model different from the index's is refused, lexical results still return", async () => {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: "concept_mapping_search", dims: 4, model: "test/fake" });
  await embedPending(sql, "concept_mapping_search", fakeEmbed, 10);
  const out = await retrieveCandidates(
    { queries: ["organ removal"] },
    { sql, env: env({ CONCEPT_MAPPING_EMBEDDING_MODEL: "other/model" }), embed: fakeEmbed, sleep: noSleep },
  );
  assertMatch(out.semantic_error ?? "", /index was embedded with test\/fake, not other\/model/);
  assert(out.candidates.length > 0);
});

Deno.test("well-supported ancestors are appended as pickable broader candidates", async () => {
  const sql = await vocabSql();
  await execAll(sql, HIERARCHY_FIXTURE);
  const out = await retrieveCandidates(
    { queries: ["Keyhole removal of test organ", "Open removal of test organ"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "off", CONCEPT_MAPPING_ANCESTOR_CANDIDATES: "on", CONCEPT_MAPPING_ANCESTOR_MIN_DEPTH: "1" }), sleep: noSleep },
  );
  const anc = out.candidates.filter((c) => c.sources.includes("ancestor"));
  assertEquals(anc.map((c) => c.concept_id), [9000102, 9000106]);
  assertEquals(anc[0].support, 1);
  const firstAncestor = out.candidates.findIndex((c) => c.sources.includes("ancestor"));
  assertEquals(out.candidates.slice(firstAncestor).every((c) => c.sources.includes("ancestor")), true);
});

Deno.test("ancestor candidates can be switched off", async () => {
  const sql = await vocabSql();
  await execAll(sql, HIERARCHY_FIXTURE);
  const out = await retrieveCandidates(
    { queries: ["Keyhole removal of test organ", "Open removal of test organ"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "off", CONCEPT_MAPPING_ANCESTOR_CANDIDATES: "off" }), sleep: noSleep },
  );
  assertEquals(out.candidates.some((c) => c.sources.includes("ancestor")), false);
});

Deno.test("with a local index, exact matching tolerates formatting differences", async () => {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: "concept_mapping_search", dims: 4, model: "" });
  const out = await retrieveCandidates(
    { queries: ["KEYHOLE-REMOVAL of test organ (per session)"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "off", CONCEPT_MAPPING_ANCESTOR_CANDIDATES: "off" }), sleep: noSleep },
  );
  assertEquals(out.candidates[0].concept_id, 9000101);
  assert(out.candidates[0].sources.includes("verbatim"));
  assertEquals(out.retrieval_confidence, "high");
});

Deno.test("candidates carry how they matched", async () => {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: "concept_mapping_search", dims: 4, model: "" });
  const out = await retrieveCandidates(
    { queries: ["keyhole removal test organ nos"] },
    { sql, env: env({ CONCEPT_MAPPING_ANCESTOR_CANDIDATES: "off" }), sleep: noSleep },
  );
  assertEquals(out.candidates[0].matched, { term: "Keyhole removal of test organ NOS", kind: "source", vocabulary: "ICD9Proc" });
});

Deno.test("an index built before normalization still serves retrieval", async () => {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: "concept_mapping_search", dims: 4, model: "" });
  await sql("DROP INDEX concept_mapping_search.terms_norm_idx");
  await sql("DROP FUNCTION concept_mapping_search.norm(text)");
  const out = await retrieveCandidates(
    { queries: ["keyhole removal test organ"] },
    { sql, env: env({ CONCEPT_MAPPING_SEMANTIC_SEARCH: "local", CONCEPT_MAPPING_ANCESTOR_CANDIDATES: "off" }), sleep: noSleep },
  );
  assertEquals(out.candidates[0].concept_id, 9000101);
  assertEquals(out.candidates[0].matched?.kind, "name");
});
