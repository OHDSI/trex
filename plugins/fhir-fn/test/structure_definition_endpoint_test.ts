import { assertEquals, assert } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";

const RES = JSON.stringify({
  resourceType: "Bundle",
  entry: [{ resource: {
    resourceType: "StructureDefinition", kind: "resource", abstract: false,
    type: "Patient",
    snapshot: { element: [
      { path: "Patient" },
      { path: "Patient.gender", type: [{ code: "code" }], min: 0, max: "1" },
      { path: "Patient.name", type: [{ code: "HumanName" }], min: 0, max: "*" },
    ] },
  } }],
});
const TYPES = JSON.stringify({ resourceType: "Bundle", entry: [] });

Deno.test("registry lists resource types", () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  assert(reg.listResourceTypes().includes("Patient"));
});
Deno.test("registry returns a parsed definition by type", () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const sd = reg.getResourceDefinition("Patient");
  assertEquals(sd?.resourceType, "Patient");
  assert(sd!.elements.some((e) => e.name === "gender"));
});
Deno.test("registry returns undefined for unknown type", () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  assertEquals(reg.getResourceDefinition("Nope"), undefined);
});
