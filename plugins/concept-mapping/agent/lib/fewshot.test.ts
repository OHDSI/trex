import { assertEquals, assertMatch } from "jsr:@std/assert";
import { examplesFor, parseExamplesCsv } from "./fewshot.ts";

const CSV = [
  "source_data_identifier,source_code,original_source_name,source_name,target_concept_id,predicate",
  "hosp-a,A1,x,Test scope of joint,9000301,exactMatch",
  "hosp-a,A2,y,Test sampling of tissue,9000302,exactMatch",
  "hosp-b,B1,z,Test scan of head,9000303,broadMatch",
].join("\n");

Deno.test("parses deployment-supplied examples (ids and predicates only)", () => {
  const { examples, errors } = parseExamplesCsv(CSV);
  assertEquals(errors, []);
  assertEquals(examples[0], {
    source_data_identifier: "hosp-a", source_code: "A1", original_source_name: "x", source_name: "Test scope of joint",
    target_concept_id: 9000301, predicate: "exactMatch",
  });
});

Deno.test("rejects rows without a numeric concept id or a valid predicate", () => {
  const { examples, errors } = parseExamplesCsv(CSV + "\nhosp-a,A3,q,Q,abc,exactMatch\nhosp-a,A4,q,Q,5,relatedMatch\n");
  assertEquals(examples.length, 3);
  assertEquals(errors.length, 2);
  assertMatch(errors[0], /row 4/);
});

Deno.test("filters to the institution, falling back to all examples", () => {
  const { examples } = parseExamplesCsv(CSV);
  assertEquals(examplesFor(examples, "hosp-b").examples.map((e) => e.source_code), ["B1"]);
  assertEquals(examplesFor(examples, "hosp-b").matchedInstitution, true);
  assertEquals(examplesFor(examples, "other").examples.length, 3);
  assertEquals(examplesFor(examples, "other").matchedInstitution, false);
});
