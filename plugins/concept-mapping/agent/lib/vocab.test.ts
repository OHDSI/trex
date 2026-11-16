import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { checkMappable, conceptDetails, verbatimMatch, vocabQuery, vocabSchema } from "./vocab.ts";
import { vocabSql } from "./testing.ts";

const envOf = (vars: Record<string, string>) => (k: string) => vars[k];

Deno.test("vocabSchema accepts plain identifiers and defaults to vocab", () => {
  assertEquals(vocabSchema(envOf({})), "vocab");
  assertEquals(vocabSchema(envOf({ CONCEPT_MAPPING_VOCAB_SCHEMA: "cdm_5_4" })), "cdm_5_4");
});

Deno.test("vocabSchema refuses injection attempts", () => {
  for (const bad of ["vocab; drop table x", '"vocab"', "a.b", "1abc"]) {
    assertThrows(() => vocabSchema(envOf({ CONCEPT_MAPPING_VOCAB_SCHEMA: bad })), Error, "invalid CONCEPT_MAPPING_VOCAB_SCHEMA");
  }
});

Deno.test("vocabQuery falls back to the worker database when no URL is set", () => {
  const fallback = () => Promise.resolve({ rows: [] });
  assertEquals(vocabQuery(envOf({}), fallback), fallback);
});

Deno.test("verbatimMatch matches names case-insensitively", async () => {
  const sql = await vocabSql();
  const hits = await verbatimMatch(sql, "vocab", ["KEYHOLE REMOVAL OF TEST ORGAN"], 10);
  assertEquals(hits.map((h) => [h.conceptId, h.matchedVia]), [[9000101, "name"]]);
});

Deno.test("verbatimMatch matches synonyms", async () => {
  const sql = await vocabSql();
  const hits = await verbatimMatch(sql, "vocab", ["talk therapy, solo"], 10);
  assertEquals(hits.map((h) => [h.conceptId, h.matchedVia]), [[9000201, "synonym"]]);
});

Deno.test("verbatimMatch projects non-standard hits through Maps to", async () => {
  const sql = await vocabSql();
  const hits = await verbatimMatch(sql, "vocab", ["keyhole removal of test organ nos"], 10);
  assertEquals(hits.map((h) => [h.conceptId, h.matchedVia]), [[9000101, "maps_to"]]);
});

Deno.test("verbatimMatch drops invalid, non-standard and disallowed-vocabulary concepts", async () => {
  const sql = await vocabSql();
  const hits = await verbatimMatch(sql, "vocab", ["Old procedure", "Classification procedure", "Veterinary removal of test organ"], 10);
  assertEquals(hits, []);
});

Deno.test("verbatimMatch passes terms only as bound parameters", async () => {
  const seen: string[] = [];
  const spy = (q: string, _p?: unknown[]) => {
    seen.push(q);
    return Promise.resolve({ rows: [] });
  };
  await verbatimMatch(spy, "vocab", ["x'); drop table concept; --"], 10);
  assert(!seen.join("\n").includes("drop table"));
});

Deno.test("conceptDetails returns synonyms, parents and children", async () => {
  const sql = await vocabSql();
  const [chole] = await conceptDetails(sql, "vocab", [9000102]);
  assertEquals(chole.children, ["Keyhole removal of test organ"]);
  const [lap] = await conceptDetails(sql, "vocab", [9000101]);
  assertEquals(lap.parents, ["Removal of test organ"]);
  const [psy] = await conceptDetails(sql, "vocab", [9000201]);
  assertEquals(psy.synonyms, ["Talk therapy, solo"]);
});

Deno.test("checkMappable explains each rejection", async () => {
  const sql = await vocabSql();
  assertEquals(await checkMappable(sql, "vocab", 999, "x"), { ok: false, reason: "not found" });
  assertEquals(await checkMappable(sql, "vocab", 2000001, "Keyhole removal of test organ NOS"), { ok: false, reason: "not standard" });
  assertEquals(await checkMappable(sql, "vocab", 3000001, "Old procedure"), { ok: false, reason: "invalid (D)" });
  assertEquals(
    await checkMappable(sql, "vocab", 9000101, "Removal of test organ"),
    { ok: false, reason: 'name mismatch: vocabulary has "Keyhole removal of test organ"' },
  );
});

Deno.test("checkMappable ignores case and surrounding spaces in the name", async () => {
  const sql = await vocabSql();
  const r = await checkMappable(sql, "vocab", 9000101, "  keyhole REMOVAL OF TEST ORGAN ");
  assertEquals(r.ok, true);
});
