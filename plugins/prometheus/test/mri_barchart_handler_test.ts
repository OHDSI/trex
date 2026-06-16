// @ts-nocheck
import { assert, assertEquals } from "std/assert/mod.ts";
import { axisLabels } from "../functions-mri/handlers/barchart.ts";
import { generateConfig } from "../functions-mri/config/generate.ts";

Deno.test("axisLabels resolves display names from the config mapping", () => {
  const { mapping } = generateConfig("ds1", ["Patient"]);
  const labels = axisLabels(
    [{ categoryId: "x1", attributeId: "patient.attributes.Age", binsize: "10" }],
    mapping,
  );
  assertEquals(labels.length, 1);
  assertEquals(labels[0].name, "Age");
});
