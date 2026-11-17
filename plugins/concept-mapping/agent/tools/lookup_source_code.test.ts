import { assertEquals } from "jsr:@std/assert";
import { vocabSql } from "../lib/testing.ts";
import { lookupSourceCodes } from "./lookup_source_code.ts";

Deno.test("a non-standard code resolves to its standard Maps-to targets", async () => {
  const sql = await vocabSql();
  const [r] = await lookupSourceCodes(sql, "vocab", "ICD9Proc", ["51.23"]);
  assertEquals(r.found, true);
  assertEquals(r.concept?.concept_id, 2000001);
  assertEquals(r.targets.map((t) => t.concept_id), [9000101]);
});

Deno.test("a standard code is its own target", async () => {
  const sql = await vocabSql();
  const [r] = await lookupSourceCodes(sql, "vocab", "SNOMED", ["T-3"]);
  assertEquals(r.targets.map((t) => t.concept_id), [9000201]);
});

Deno.test("unknown codes are reported, not dropped", async () => {
  const sql = await vocabSql();
  const out = await lookupSourceCodes(sql, "vocab", "ICD9Proc", ["99.99", "51.23"]);
  assertEquals(out.map((r) => [r.code, r.found]), [["99.99", false], ["51.23", true]]);
});
