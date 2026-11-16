import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { fakeEmbed, vocabSql } from "./testing.ts";
import {
  buildIndex,
  denseSearch,
  embedPending,
  indexSchema,
  indexStatus,
  lexicalSearch,
} from "./searchindex.ts";

const IDX = "concept_mapping_search";

async function built(withEmbeddings = false) {
  const sql = await vocabSql();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: IDX, dims: 4, model: "test/fake" });
  if (withEmbeddings) await embedPending(sql, IDX, fakeEmbed, 2);
  return sql;
}

Deno.test("indexSchema validates the identifier and defaults", () => {
  assertEquals(indexSchema(() => undefined), IDX);
  assertThrows(() => indexSchema(() => "x; drop"), Error, "invalid CONCEPT_MAPPING_INDEX_SCHEMA");
});

Deno.test("the index holds standard names, English synonyms and mapped source names only", async () => {
  const sql = await built();
  const { rows } = await sql(`SELECT concept_id, term, kind FROM ${IDX}.terms ORDER BY concept_id, kind, term`);
  assertEquals(rows, [
    { concept_id: 9000101, term: "Keyhole removal of test organ", kind: "name" },
    { concept_id: 9000101, term: "Keyhole removal of test organ NOS", kind: "source" },
    { concept_id: 9000102, term: "Removal of test organ", kind: "name" },
    { concept_id: 9000201, term: "Solo talk therapy", kind: "name" },
    { concept_id: 9000201, term: "Talk therapy, solo", kind: "synonym" },
  ]);
});

Deno.test("building twice does not duplicate terms", async () => {
  const sql = await built();
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: IDX, dims: 4, model: "test/fake" });
  assertEquals((await indexStatus(sql, IDX)).terms, 5);
});

Deno.test("lexical search matches any query word and ranks better matches first", async () => {
  const sql = await built();
  const hits = await lexicalSearch(sql, "vocab", IDX, "keyhole organ removal", 10);
  assertEquals(hits.map((h) => h.conceptId), [9000101, 9000102]);
});

Deno.test("lexical search ignores stop words and empty queries", async () => {
  const sql = await built();
  assertEquals(await lexicalSearch(sql, "vocab", IDX, "of the", 10), []);
});

Deno.test("embedPending fills every term in batches and records progress", async () => {
  const sql = await built(true);
  const s = await indexStatus(sql, IDX);
  assertEquals({ exists: s.exists, terms: s.terms, embedded: s.embedded, dims: s.dims, model: s.model }, {
    exists: true, terms: 5, embedded: 5, dims: 4, model: "test/fake",
  });
});

Deno.test("dense search returns the concept whose term embedding is closest", async () => {
  const sql = await built(true);
  const [vec] = await fakeEmbed(["Talk therapy, solo"]);
  const hits = await denseSearch(sql, "vocab", IDX, vec, 2);
  assertEquals(hits[0].conceptId, 9000201);
  assert(hits.length <= 2);
});

Deno.test("status of a missing index reports exists: false", async () => {
  const sql = await vocabSql();
  assertEquals((await indexStatus(sql, IDX)).exists, false);
});
