import { assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import { retrievalConfidence, rrf } from "./rrf.ts";
import type { Concept } from "./vocab.ts";

const c = (conceptId: number, vocabularyId = "SNOMED"): Concept => ({
  conceptId, conceptName: `c${conceptId}`, vocabularyId, domainId: "Procedure", conceptClassId: "Procedure",
  standardConcept: "S", invalidReason: null,
});

Deno.test("rrf ranks concepts found by several lists first", () => {
  const fused = rrf([{ source: "verbatim", concepts: [c(1), c(2)] }, { source: "semantic:q", concepts: [c(2), c(3)] }]);
  assertEquals(fused.map((f) => f.conceptId), [2, 1, 3]);
  assertAlmostEquals(fused[0].score, 1 / 61 + 1 / 62);
  assertEquals(fused[0].sources, ["semantic:q", "verbatim"]);
});

Deno.test("rrf breaks score ties by vocabulary preference, then concept id", () => {
  const fused = rrf([{ source: "a", concepts: [c(9, "LOINC")] }, { source: "b", concepts: [c(5, "SNOMED")] }]);
  assertEquals(fused.map((f) => f.conceptId), [5, 9]);
});

Deno.test("confidence is high when the top hit is verbatim or found by two lists", () => {
  assertEquals(retrievalConfidence(rrf([{ source: "verbatim", concepts: [c(1)] }])), "high");
  assertEquals(retrievalConfidence(rrf([{ source: "semantic:a", concepts: [c(1)] }, { source: "semantic:b", concepts: [c(1)] }])), "high");
});

Deno.test("confidence is low with no candidates or a single semantic hit", () => {
  assertEquals(retrievalConfidence([]), "low");
  assertEquals(retrievalConfidence(rrf([{ source: "semantic:a", concepts: [c(1), c(2)] }])), "low");
});
