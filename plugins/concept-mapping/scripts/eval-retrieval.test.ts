import { assertEquals } from "jsr:@std/assert";
import { queriesFor } from "./eval-retrieval.ts";

const row = {
  source_data_identifier: "1",
  source_code: "C",
  original_source_name: "Kniespiegelung",
  source_name: "Knee scope",
  accepted: [1],
  predicate: "exactMatch",
};

Deno.test("query modes pick the English, original or both names", () => {
  assertEquals(queriesFor(row, "english"), ["Knee scope"]);
  assertEquals(queriesFor(row, "source"), ["Kniespiegelung"]);
  assertEquals(queriesFor(row, "both"), ["Knee scope", "Kniespiegelung"]);
});
