import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { fakeEmbed, vocabSql } from "./testing.ts";
import {
  buildIndex,
  normalizedMatch,
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

Deno.test("lexical search breaks rank ties in favour of the shorter, more general name", async () => {
  const sql = await built();
  await sql(`INSERT INTO vocab.concept VALUES (9000099, 'Removal of test organ with additional extended qualifiers', 'Procedure', 'SNOMED', 'Procedure', 'S', 'T-7', NULL)`);
  await sql(`INSERT INTO ${IDX}.terms (concept_id, term, kind) VALUES (9000099, 'Removal of test organ with additional extended qualifiers', 'name')`);
  const hits = await lexicalSearch(sql, "vocab", IDX, "removal test organ", 10);
  const general = hits.findIndex((h) => h.conceptId === 9000102);
  const specific = hits.findIndex((h) => h.conceptId === 9000099);
  assertEquals(general < specific, true);
});

Deno.test("normalized matching tolerates punctuation, case and billing suffixes", async () => {
  const sql = await built();
  for (const q of ["KEYHOLE-REMOVAL of test organ", "keyhole removal of test organ (per session)", "  Keyhole removal, of test organ "]) {
    const hits = await normalizedMatch(sql, "vocab", IDX, [q], 10);
    assertEquals(hits.map((h) => h.conceptId), [9000101], q);
  }
});

Deno.test("normalized matching reports synonyms and mapped source names like exact matching", async () => {
  const sql = await built();
  assertEquals((await normalizedMatch(sql, "vocab", IDX, ["talk-therapy, solo"], 10)).map((h) => [h.conceptId, h.matchedVia]), [[9000201, "synonym"]]);
  assertEquals((await normalizedMatch(sql, "vocab", IDX, ["keyhole removal of test organ nos"], 10)).map((h) => [h.conceptId, h.matchedVia]), [[9000101, "maps_to"]]);
});

Deno.test("a query that normalizes to nothing matches nothing", async () => {
  const sql = await built();
  assertEquals(await normalizedMatch(sql, "vocab", IDX, ["ΔΟΚΙΜΗ", "(per session)"], 10), []);
});

Deno.test("an index from before normalization reports it and gains it on rebuild without losing embeddings", async () => {
  const sql = await built(true);
  await sql(`DROP INDEX ${IDX}.terms_norm_idx`);
  await sql(`DROP FUNCTION ${IDX}.norm(text)`);
  assertEquals((await indexStatus(sql, IDX)).normalized, false);
  await buildIndex(sql, { vocabSchema: "vocab", indexSchema: IDX, dims: 4, model: "test/fake" });
  const s = await indexStatus(sql, IDX);
  assertEquals([s.terms, s.embedded, s.normalized], [5, 5, true]);
  assertEquals((await normalizedMatch(sql, "vocab", IDX, ["Keyhole-removal of test organ"], 10)).length, 1);
});

Deno.test("normalization is an expression index, not a stored column", async () => {
  const sql = await built();
  const { rows } = await sql(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'terms' ORDER BY column_name`,
    [IDX],
  );
  assertEquals(rows.map((r) => (r as { column_name: string }).column_name), ["concept_id", "embedding", "id", "kind", "term", "tsv"]);
});
Deno.test("search hits report which term matched and, for mapped source names, its vocabulary", async () => {
  const sql = await built();
  const [hit] = await lexicalSearch(sql, "vocab", IDX, "keyhole removal test organ nos", 1);
  assertEquals(hit.conceptId, 9000101);
  assertEquals(hit.matched, { term: "Keyhole removal of test organ NOS", kind: "source", vocabulary: "ICD9Proc" });
  const [syn] = await normalizedMatch(sql, "vocab", IDX, ["talk therapy solo"], 1);
  assertEquals(syn.matched, { term: "Talk therapy, solo", kind: "synonym" });
});
