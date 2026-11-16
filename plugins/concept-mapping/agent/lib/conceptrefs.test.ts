import { assertEquals } from "jsr:@std/assert";
import { conceptRefIds, renderConceptRefs } from "./conceptrefs.ts";

const names = new Map([[9000201, "Solo talk therapy"]]);

Deno.test("finds every referenced concept id", () => {
  assertEquals(conceptRefIds("a {{concept:9000201}} b {{name:7}} c {{concept:9000201}}"), [9000201, 7]);
});

Deno.test("renders names from the vocabulary, with the id for {{concept:}}", () => {
  assertEquals(
    renderConceptRefs('x {{concept:9000201}} "{{name:9000201}}"', names),
    'x Solo talk therapy (9000201) "Solo talk therapy"',
  );
});

Deno.test("an id missing from the vocabulary renders as a neutral placeholder", () => {
  assertEquals(renderConceptRefs("{{concept:7}} / {{name:7}}", names), "concept 7 (7) / concept 7");
});
