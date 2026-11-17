import { assertAlmostEquals, assertEquals, assertThrows } from "jsr:@std/assert";
import { ancestorHitRate, overlappingCodes, parseGoldCsv, recallAtK, recallWithExtra } from "./retrievaleval.ts";
import { vocabSql } from "./testing.ts";

Deno.test("recallAtK counts a row when any accepted id is within the top k, per predicate", () => {
  const rows = [
    { candidates: [5, 1, 2], accepted: [5], predicate: "exactMatch" },
    { candidates: [1, 2, 3, 4, 5, 6, 7], accepted: [9, 7], predicate: "broadMatch" },
    { candidates: [1, 2], accepted: [8], predicate: "exactMatch" },
  ];
  const r = recallAtK(rows, [1, 10]);
  assertAlmostEquals(r.all[1], 1 / 3);
  assertAlmostEquals(r.all[10], 2 / 3);
  assertEquals(r.exactMatch[10], 0.5);
  assertEquals(r.broadMatch[1], 0);
  assertEquals(r.broadMatch[10], 1);
});

Deno.test("ancestorHitRate finds gold concepts that are ancestors of a retrieved candidate", async () => {
  const sql = await vocabSql();
  const r = await ancestorHitRate(sql, "vocab", [
    { candidates: [9000101], accepted: [9000102], predicate: "broadMatch" },
    { candidates: [9000201], accepted: [9000102], predicate: "broadMatch" },
  ], 2);
  assertEquals(r.broadMatch, 0.5);
});

Deno.test("parseGoldCsv reads the submission columns and the source_term/target_concept_id_b variant", () => {
  const a = parseGoldCsv(
    "source_data_identifier,source_code,original_source_term,source_term,target_concept_id,target_concept_name,target_concept_id_b,target_concept_name_b,predicate,predicate_b\n" +
      "1,C1,orig,name,11,n,12,m,broadMatch,\n",
  );
  assertEquals(a[0], { source_data_identifier: "1", source_code: "C1", original_source_name: "orig", source_name: "name", accepted: [11, 12], predicate: "broadMatch" });
  const b = parseGoldCsv(
    "source_data_identifier,source_code,original_source_name,source_name,target_concept_id,alternative_target_concept_id,predicate\n1,C2,o,n,21,,exactMatch\n",
  );
  assertEquals(b[0].accepted, [21]);
});

Deno.test("refuses gold rows that are also calibration examples", () => {
  assertEquals(overlappingCodes([{ source_data_identifier: "1", source_code: "C1" }], [{ source_data_identifier: "1", source_code: "C1" }]), ["1|C1"]);
  assertThrows(() => parseGoldCsv("a,b\n1,2\n"), Error, "missing column");
});

Deno.test("recallWithExtra counts a hit in the retrieved list or the appended extras, separately from Recall@k", () => {
  const rows = [
    { candidates: [1, 2], extra: [9], accepted: [9], predicate: "broadMatch" },
    { candidates: [3], extra: [], accepted: [3], predicate: "exactMatch" },
    { candidates: [4], extra: [5], accepted: [6], predicate: "broadMatch" },
  ];
  assertEquals(recallWithExtra(rows), { all: 2 / 3, exactMatch: 1, broadMatch: 0.5 });
});
