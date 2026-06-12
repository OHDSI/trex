// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/json_transform.rs #[cfg(test)] mod tests

import { assertEquals, assert, assertThrows } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";
import {
  generateColumnNames,
  generateJsonTransform,
} from "../functions/schema/json_transform.ts";

// ---------------------------------------------------------------------------
// Test helpers (mirrors the Rust test helpers in structure_definition_test.ts)
// ---------------------------------------------------------------------------

function makeBundle(entries: unknown[]): string {
  return JSON.stringify({
    resourceType: "Bundle",
    type: "collection",
    entry: entries,
  });
}

function emptyBundle(): string {
  return makeBundle([]);
}

function bundleEntry(sd: unknown): unknown {
  return { resource: sd };
}

function makeSd(
  name: string,
  kind: string,
  isAbstract: boolean,
  derivation: string | null,
  elements: unknown[],
): unknown {
  const sd: Record<string, unknown> = {
    resourceType: "StructureDefinition",
    name,
    type: name,
    kind,
    abstract: isAbstract,
    snapshot: { element: elements },
  };
  if (derivation !== null) {
    sd["derivation"] = derivation;
  }
  return sd;
}

function makeElement(path: string, typeCodes: string[], min: number, max: string): unknown {
  const types = typeCodes.map((tc) => ({ code: tc }));
  return { path, min, max, type: types };
}

function makeElementWithContentRef(
  path: string,
  min: number,
  max: string,
  contentRef: string,
): unknown {
  return { path, min, max, contentReference: contentRef };
}

// ---------------------------------------------------------------------------
// Rust test: test_column_names_patient (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_column_names_patient", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const cols = generateColumnNames(defs, "Patient");
  assert(cols.length > 0, "Patient should have columns");
  assert(cols.includes("id"), "should contain id");
  assert(cols.includes("gender"), "should contain gender");
  assert(cols.includes("birthDate"), "should contain birthDate");
  assert(cols.includes("name"), "should contain name");
  assert(!cols.includes("resourceType"), "should not contain resourceType");
});

// ---------------------------------------------------------------------------
// Rust test: test_column_names_excludes_choice_types (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_column_names_excludes_choice_types", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const cols = generateColumnNames(defs, "Observation");
  // value[x] is a choice type and should be excluded
  assert(!cols.some((c) => c.includes("[x]")), "should not contain [x] columns");
  // but non-choice columns should be present
  assert(cols.includes("status"), "should contain status");
  assert(cols.includes("code"), "should contain code");
});

// ---------------------------------------------------------------------------
// Rust test: test_column_names_matches_transform_keys (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_column_names_matches_transform_keys", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const cols = generateColumnNames(defs, "Patient");
  const transform = generateJsonTransform(defs, "Patient");
  // Every column name should appear as a key in the transform spec
  for (const col of cols) {
    assert(
      transform.includes(`"${col}":`),
      `transform should contain key for column '${col}'. Transform: ${transform.slice(0, 500)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Rust test: test_column_names_unknown_type (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_column_names_unknown_type", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  let threw = false;
  try {
    generateColumnNames(defs, "FakeResource");
  } catch (_e) {
    threw = true;
  }
  assert(threw, "should throw for unknown resource type");
});

// ---------------------------------------------------------------------------
// Unit tests with inline bundles
// ---------------------------------------------------------------------------

Deno.test("generateColumnNames - simple resource with primitives", () => {
  const sd = makeSd(
    "TestResource",
    "resource",
    false,
    "specialization",
    [
      makeElement("TestResource", [], 0, "*"),
      makeElement("TestResource.id", ["id"], 0, "1"),
      makeElement("TestResource.name", ["string"], 0, "1"),
      makeElement("TestResource.tag", ["code"], 0, "*"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const cols = generateColumnNames(reg, "TestResource");
  assertEquals(cols, ["id", "name", "tag"]);
});

Deno.test("generateColumnNames - excludes resourceType field", () => {
  const sd = makeSd(
    "FooResource",
    "resource",
    false,
    "specialization",
    [
      makeElement("FooResource", [], 0, "*"),
      makeElement("FooResource.resourceType", ["string"], 0, "1"),
      makeElement("FooResource.status", ["code"], 1, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const cols = generateColumnNames(reg, "FooResource");
  assert(!cols.includes("resourceType"), "should exclude resourceType");
  assert(cols.includes("status"), "should include status");
});

Deno.test("generateColumnNames - excludes choice type fields", () => {
  const sd = makeSd(
    "Obs",
    "resource",
    false,
    "specialization",
    [
      makeElement("Obs", [], 0, "*"),
      makeElement("Obs.status", ["code"], 1, "1"),
      makeElement("Obs.value[x]", ["Quantity", "string"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const cols = generateColumnNames(reg, "Obs");
  assert(!cols.includes("value[x]"), "should exclude choice type");
  assert(cols.includes("status"), "should include status");
});

Deno.test("generateJsonTransform - primitive fields produce quoted DuckDB types", () => {
  const sd = makeSd(
    "Simple",
    "resource",
    false,
    "specialization",
    [
      makeElement("Simple", [], 0, "*"),
      makeElement("Simple.active", ["boolean"], 0, "1"),
      makeElement("Simple.birthDate", ["date"], 0, "1"),
      makeElement("Simple.count", ["integer"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const spec = generateJsonTransform(reg, "Simple");
  assertEquals(spec, '{"active": "BOOLEAN", "birthDate": "VARCHAR", "count": "INTEGER"}');
});

Deno.test("generateJsonTransform - array field gets wrapped in brackets", () => {
  const sd = makeSd(
    "Multi",
    "resource",
    false,
    "specialization",
    [
      makeElement("Multi", [], 0, "*"),
      makeElement("Multi.tags", ["code"], 0, "*"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const spec = generateJsonTransform(reg, "Multi");
  assertEquals(spec, '{"tags": ["VARCHAR"]}');
});

Deno.test("generateJsonTransform - Reference type uses hardcoded struct", () => {
  const sd = makeSd(
    "RefRes",
    "resource",
    false,
    "specialization",
    [
      makeElement("RefRes", [], 0, "*"),
      makeElement("RefRes.subject", ["Reference"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const spec = generateJsonTransform(reg, "RefRes");
  assertEquals(
    spec,
    '{"subject": {"reference": "VARCHAR", "type": "VARCHAR", "display": "VARCHAR"}}',
  );
});

Deno.test("generateJsonTransform - unknown type throws", () => {
  const bundle = emptyBundle();
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  let threw = false;
  try {
    generateJsonTransform(reg, "NonExistent");
  } catch (_e) {
    threw = true;
  }
  assert(threw, "should throw for unknown resource type");
});

Deno.test("generateJsonTransform - nested BackboneElement uses children", () => {
  const sd = makeSd(
    "WithNested",
    "resource",
    false,
    "specialization",
    [
      makeElement("WithNested", [], 0, "*"),
      makeElement("WithNested.contact", ["BackboneElement"], 0, "*"),
      makeElement("WithNested.contact.name", ["string"], 0, "1"),
      makeElement("WithNested.contact.phone", ["string"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const spec = generateJsonTransform(reg, "WithNested");
  assertEquals(spec, '{"contact": [{"name": "VARCHAR", "phone": "VARCHAR"}]}');
});

Deno.test("generateJsonTransform - contentReference at depth >= MAX-1 gets VARCHAR", () => {
  // Create a self-referential structure where contentReference will hit the depth limit.
  // We test the guard at MAX_RECURSION_DEPTH - 1 = 3.
  const sd = makeSd(
    "SelfRef",
    "resource",
    false,
    "specialization",
    [
      makeElement("SelfRef", [], 0, "*"),
      makeElement("SelfRef.item", ["BackboneElement"], 0, "*"),
      makeElement("SelfRef.item.text", ["string"], 0, "1"),
      makeElementWithContentRef("SelfRef.item.item", 0, "*", "#SelfRef.item"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  // This should not throw (recursion guard prevents infinite loop)
  const spec = generateJsonTransform(reg, "SelfRef");
  assert(spec.startsWith("{"), "spec should be an object");
  assert(spec.includes('"item"'), "spec should include item key");
});

Deno.test("generateJsonTransform - Narrative type uses hardcoded struct", () => {
  const sd = makeSd(
    "WithNarrative",
    "resource",
    false,
    "specialization",
    [
      makeElement("WithNarrative", [], 0, "*"),
      makeElement("WithNarrative.text", ["Narrative"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const spec = generateJsonTransform(reg, "WithNarrative");
  assertEquals(spec, '{"text": {"status": "VARCHAR", "div": "VARCHAR"}}');
});

Deno.test("generateJsonTransform - complex type from types registry", () => {
  const humanNameSd = makeSd(
    "HumanName",
    "complex-type",
    false,
    "specialization",
    [
      makeElement("HumanName", [], 0, "*"),
      makeElement("HumanName.family", ["string"], 0, "1"),
      makeElement("HumanName.given", ["string"], 0, "*"),
    ],
  );
  const patientSd = makeSd(
    "Patient",
    "resource",
    false,
    "specialization",
    [
      makeElement("Patient", [], 0, "*"),
      makeElement("Patient.name", ["HumanName"], 0, "*"),
    ],
  );
  const typesBundle = makeBundle([bundleEntry(humanNameSd)]);
  const resourcesBundle = makeBundle([bundleEntry(patientSd)]);
  const reg = DefinitionRegistry.loadFromJson(resourcesBundle, typesBundle);
  const spec = generateJsonTransform(reg, "Patient");
  assertEquals(spec, '{"name": [{"family": "VARCHAR", "given": ["VARCHAR"]}]}');
});

// ---------------------------------------------------------------------------
// Integration assertions using real registry
// ---------------------------------------------------------------------------
Deno.test("Patient transform spec + columns from real defs", async () => {
  const reg = await DefinitionRegistry.loadDefault();
  const cols = generateColumnNames(reg, "Patient");
  assert(cols.includes("gender"));
  assert(!cols.includes("resourceType"));
  const spec = generateJsonTransform(reg, "Patient");
  assert(spec.startsWith("{") && spec.includes('"gender"'));
});
