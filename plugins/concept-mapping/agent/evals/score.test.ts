import { assertEquals } from "jsr:@std/assert";
import { score } from "./score.ts";

const HEADER =
  "source_data_identifier,source_code,original_source_name,source_name,target_concept_id,target_concept_name,alternative_target_concept_id,alternative_target_concept_name,predicate";

Deno.test("counts a hit on any accepted id, via target or alternative, and missing rows as wrong", () => {
  const pred = [HEADER, "1,A,a,a,5,x,1,y,exactMatch", "2,B,b,b,9,x,,,broadMatch"].join("\n");
  const gold = [
    { source_data_identifier: "1", source_code: "A", accepted: [1, 2] },
    { source_data_identifier: "2", source_code: "B", accepted: [3] },
    { source_data_identifier: "2", source_code: "C", accepted: [4] },
  ];
  assertEquals(score(pred, gold), {
    n: 3,
    correct: 1,
    accuracy: 1 / 3,
    byInstitution: { "1": { n: 1, correct: 1 }, "2": { n: 2, correct: 0 } },
  });
});

Deno.test("finds the CSV inside a longer reply", () => {
  const reply = `Here is the export:\n\n\`\`\`csv\n${HEADER}\n1,A,a,a,1,x,,,exactMatch\n\`\`\`\nDone.`;
  assertEquals(score(reply, [{ source_data_identifier: "1", source_code: "A", accepted: [1] }]).correct, 1);
});
