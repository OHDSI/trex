// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { ifrToElm, valueExprFor } from "../functions-mri/ifr/to_elm.ts";
import { generateConfig } from "../functions-mri/config/generate.ts";

const { mapping } = generateConfig("ds1", ["Patient", "Condition"]);

Deno.test("valueExprFor: gender → json_extract_string on patient alias", () => {
  assertEquals(valueExprFor(mapping["patient.attributes.Gender"], "p"), `json_extract_string(p._raw, '$.gender')`);
});

Deno.test("valueExprFor: Age → date_diff derivation", () => {
  assertEquals(
    valueExprFor(mapping["patient.attributes.Age"], "p"),
    `date_diff('year', CAST(json_extract_string(p._raw, '$.birthDate') AS DATE), current_date)`,
  );
});

Deno.test("ifrToElm: gender filter → patientWhere Compare; age axis added", () => {
  const ifr = {
    filter: {
      configMetadata: { id: "fhir-ds1", version: "1" },
      cards: {
        type: "BooleanContainer", op: "AND",
        content: [{
          type: "FilterCard", configPath: "patient",
          attributes: {
            type: "BooleanContainer", op: "AND",
            content: [{
              type: "Attribute", configPath: "patient.attributes.Gender",
              constraints: { type: "BooleanContainer", op: "OR", content: [{ type: "Expression", operator: "=", value: "male" }] },
            }],
          },
        }],
      },
    },
    axisSelection: [{ categoryId: "x1", attributeId: "patient.attributes.Age", binsize: "10" }],
  };

  const elm = ifrToElm(ifr, mapping);
  assertEquals(elm.filters.length, 0);
  assertEquals(elm.axes.length, 1);
  assertEquals(elm.axes[0].binSize, 10);
  assertEquals(elm.patientWhere.type, "And");
});
