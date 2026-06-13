import { assertEquals, assert } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { handleStructureDefinitionList, handleStructureDefinitionRead } from "../functions/handlers/structure_definition.ts";

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

Deno.test("handler: list returns resourceTypes JSON", async () => {
  const defReg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const reg = ResourceRegistry.withDefinitions(defReg);
  const res = handleStructureDefinitionList({ registry: reg } as any);
  assertEquals(res.headers.get("content-type"), "application/fhir+json");
  const body = await res.json();
  assert(body.resourceTypes.includes("Patient"));
});
Deno.test("handler: read returns the parsed definition", async () => {
  const defReg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const reg = ResourceRegistry.withDefinitions(defReg);
  const res = handleStructureDefinitionRead({ registry: reg } as any, "Patient");
  const body = await res.json();
  assertEquals(body.resourceType, "Patient");
});
Deno.test("handler: read unknown type → 404", async () => {
  const defReg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const reg = ResourceRegistry.withDefinitions(defReg);
  try {
    const res = handleStructureDefinitionRead({ registry: reg } as any, "Nope");
    assertEquals(res.status, 404);
  } catch (e) {
    // FhirError.notFound may throw rather than return a Response; assert it's a 404-style error
    assert(String(e).includes("not found") || (e as any).status === 404);
  }
});
