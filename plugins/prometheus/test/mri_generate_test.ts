// @ts-nocheck
import { assertEquals, assert } from "std/assert/mod.ts";
import { generateConfig } from "../functions-mri/config/generate.ts";

Deno.test("generateConfig builds patient attributes + interactions", () => {
  const { mriConfig, mapping } = generateConfig("ds1", ["Patient", "Condition"]);

  assertEquals(mriConfig.meta.configId, "fhir-ds1");
  assert(typeof mriConfig.meta.configVersion === "string");

  const attrs = mriConfig.config.patient.attributes;
  assert("Age" in attrs);
  assertEquals(attrs.Age.type, "num");
  assertEquals(attrs.Gender.type, "text");

  const inter = mriConfig.config.patient.interactions;
  assert("Diagnosis" in inter);
  assert("Code" in inter.Diagnosis.attributes);

  assertEquals(mapping["patient.attributes.Gender"].jsonPath, "$.gender");
  assertEquals(mapping["patient.interactions.Diagnosis.attributes.Code"].resourceType, "Condition");
});

Deno.test("generateConfig ignores Patient in interactions and unknown types fall back empty", () => {
  const { mriConfig } = generateConfig("ds1", ["Patient"]);
  assertEquals(Object.keys(mriConfig.config.patient.interactions).length, 0);
});

Deno.test("generateConfig includes the pcount measure attribute", () => {
  const { mriConfig } = generateConfig("ds1", ["Patient"]);
  const attrs = mriConfig.config.patient.attributes;
  assert("pcount" in attrs);
  assertEquals(attrs.pcount.measure, true);
});
