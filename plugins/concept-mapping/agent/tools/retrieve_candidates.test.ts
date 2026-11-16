import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { vocabSql } from "../lib/testing.ts";
import { retrieveCandidates } from "./retrieve_candidates.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];
const noSleep = () => Promise.resolve();

Deno.test("with semantic search disabled it returns verbatim-only candidates and never fetches", async () => {
  const sql = await vocabSql();
  let fetched = false;
  const out = await retrieveCandidates(
    { queries: ["Keyhole removal of test organ"] },
    { sql, env: env({ HECATE_URL: "" }), fetchFn: (() => { fetched = true; throw new Error(); }) as typeof fetch, sleep: noSleep },
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
    { sql, env: env({ HECATE_URL: "https://h.example" }), fetchFn: (() => Promise.reject(new Error("connect refused"))) as typeof fetch, sleep: noSleep },
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
    { sql, env: env({ HECATE_URL: "https://h.example" }), fetchFn: fetchFn as typeof fetch, sleep: noSleep },
  );
  assertEquals(out.candidates.map((c) => c.concept_id), [9000201]);
});

Deno.test("limit caps the number of candidates", async () => {
  const sql = await vocabSql();
  const concepts = [9000101, 9000102, 9000201].map((id) => ({ concept_id: id, concept_name: "n", vocabulary_id: "SNOMED", domain_id: "Procedure" }));
  const fetchFn = () => Promise.resolve(new Response(JSON.stringify([{ score: 1, concepts }])));
  const out = await retrieveCandidates(
    { queries: ["q"], limit: 2 },
    { sql, env: env({ HECATE_URL: "https://h.example" }), fetchFn: fetchFn as typeof fetch, sleep: noSleep },
  );
  assertEquals(out.candidates.length, 2);
  assert(out.candidates.every((c, i) => c.rank === i + 1));
});

Deno.test("after the first semantic failure the remaining queries are skipped", async () => {
  const sql = await vocabSql();
  let calls = 0;
  const out = await retrieveCandidates(
    { queries: ["a", "b", "c"] },
    { sql, env: env({ HECATE_URL: "https://h.example" }), fetchFn: (() => { calls++; return Promise.reject(new Error("timeout")); }) as typeof fetch, sleep: noSleep },
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
  await retrieveCandidates({ queries: ["talk therapy"] }, { sql, env: env({ HECATE_URL: "https://h.example" }), fetchFn: fetchFn as typeof fetch, sleep: noSleep });
  assert(!seen.some((q) => q.includes("concept_ancestor")), "retrieval should not query concept_ancestor");
});

Deno.test("semantic search is off when HECATE_URL is not set", async () => {
  const sql = await vocabSql();
  let fetched = false;
  const out = await retrieveCandidates(
    { queries: ["Keyhole removal of test organ"] },
    { sql, env: env({}), fetchFn: (() => { fetched = true; throw new Error(); }) as typeof fetch, sleep: noSleep },
  );
  assertEquals(fetched, false);
  assertEquals(out.semantic_error, "semantic search disabled");
});
