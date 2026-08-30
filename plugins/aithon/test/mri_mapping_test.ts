// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { CURATED_ATTRS } from "../functions-mri/config/mapping.ts";

Deno.test("curated Patient attributes include Age and Gender", () => {
  const patient = CURATED_ATTRS["Patient"];
  assertEquals(patient.Age.derive, "ageYears");
  assertEquals(patient.Age.kind, "num");
  assertEquals(patient.Age.binnable, true);
  assertEquals(patient.Gender.kind, "text");
  assertEquals(patient.Gender.jsonPath, "$.gender");
});

Deno.test("curated Condition attribute maps to code", () => {
  assertEquals(CURATED_ATTRS["Condition"].Code.jsonPath, "$.code.coding[0].code");
});
