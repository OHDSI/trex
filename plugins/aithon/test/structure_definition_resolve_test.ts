import { assertEquals, assert } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBundle(entries: unknown[]): string {
  return JSON.stringify({
    resourceType: "Bundle",
    type: "collection",
    entry: entries,
  });
}

function bundleEntry(sd: unknown): unknown {
  return { resource: sd };
}

function makeElement(path: string, typeCodes: string[], min: number, max: string): unknown {
  return { path, min, max, type: typeCodes.map((tc) => ({ code: tc })) };
}

// Patient resource SD:
//   Patient.extension  (should be dropped by boilerplate filter)
//   Patient.name       (HumanName, complex-type)
//   Patient.value[x]   (choice: Quantity & string)
const PATIENT_SD = {
  resourceType: "StructureDefinition",
  kind: "resource",
  abstract: false,
  type: "Patient",
  snapshot: {
    element: [
      makeElement("Patient", [], 0, "*"),
      makeElement("Patient.extension", ["Extension"], 0, "*"),
      makeElement("Patient.name", ["HumanName"], 0, "*"),
      { path: "Patient.value[x]", min: 0, max: "1", type: [{ code: "Quantity" }, { code: "string" }] },
    ],
  },
};

// HumanName complex-type SD
const HUMAN_NAME_SD = {
  resourceType: "StructureDefinition",
  kind: "complex-type",
  abstract: false,
  type: "HumanName",
  snapshot: {
    element: [
      makeElement("HumanName", [], 0, "*"),
      makeElement("HumanName.family", ["string"], 0, "1"),
      makeElement("HumanName.given", ["string"], 0, "*"),
    ],
  },
};

// Quantity complex-type SD
const QUANTITY_SD = {
  resourceType: "StructureDefinition",
  kind: "complex-type",
  abstract: false,
  type: "Quantity",
  snapshot: {
    element: [
      makeElement("Quantity", [], 0, "*"),
      makeElement("Quantity.value", ["decimal"], 0, "1"),
      makeElement("Quantity.unit", ["string"], 0, "1"),
    ],
  },
};

const RES_JSON = makeBundle([bundleEntry(PATIENT_SD)]);
const TYPES_JSON = makeBundle([bundleEntry(HUMAN_NAME_SD), bundleEntry(QUANTITY_SD)]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("getResourceDefinition resolves HumanName children (family, given)", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const sd = reg.getResourceDefinition("Patient");
  assert(sd !== undefined);

  const nameEl = sd.elements.find((e) => e.name === "name");
  assert(nameEl !== undefined, "name element should be present");
  assert(nameEl.children.length > 0, "name element should have resolved children");
  const childNames = nameEl.children.map((c) => c.name);
  assert(childNames.includes("family"), `expected 'family' in children, got: ${JSON.stringify(childNames)}`);
  assert(childNames.includes("given"), `expected 'given' in children, got: ${JSON.stringify(childNames)}`);
});

Deno.test("getResourceDefinition populates childrenByType for choice value[x]", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const sd = reg.getResourceDefinition("Patient");
  assert(sd !== undefined);

  // The `[x]` suffix is stripped in the resolved copy (UI binds to value<Type>).
  const valueEl = sd.elements.find((e) => e.name === "value" && e.isChoice);
  assert(valueEl !== undefined, "choice value element should be present (name stripped of [x])");
  assert(valueEl.isChoice, "value should be a choice element");
  assert(valueEl.childrenByType !== undefined, "childrenByType should be populated");

  const quantityChildren = valueEl.childrenByType!["Quantity"];
  assert(quantityChildren !== undefined, "childrenByType.Quantity should exist");
  const qChildNames = quantityChildren.map((c) => c.name);
  assert(qChildNames.includes("value"), `expected 'value' in Quantity children, got: ${JSON.stringify(qChildNames)}`);
  assert(qChildNames.includes("unit"), `expected 'unit' in Quantity children, got: ${JSON.stringify(qChildNames)}`);
});

Deno.test("getResourceDefinition drops extension (boilerplate) from root", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const sd = reg.getResourceDefinition("Patient");
  assert(sd !== undefined);

  const extEl = sd.elements.find((e) => e.name === "extension");
  assertEquals(extEl, undefined, "extension should be filtered out");
});

Deno.test("getResource (raw) still returns name with empty children — unmodified", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const raw = reg.getResource("Patient");
  assert(raw !== undefined);

  const nameEl = raw.elements.find((e) => e.name === "name");
  assert(nameEl !== undefined, "name element should exist in raw");
  assertEquals(nameEl.children.length, 0, "raw name element should have no resolved children");
  assertEquals(nameEl.childrenByType, undefined, "raw name element should have no childrenByType");
});

Deno.test("getResourceDefinition returns cached resolved copy on second call", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const first = reg.getResourceDefinition("Patient");
  const second = reg.getResourceDefinition("Patient");
  assert(first === second, "should return the same cached object");
});

Deno.test("getResourceDefinition returns undefined for unknown type", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  assertEquals(reg.getResourceDefinition("Nope"), undefined);
});
