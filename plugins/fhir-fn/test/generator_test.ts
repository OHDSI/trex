// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/generator.rs #[cfg(test)] mod tests

import { assertEquals, assert } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";
import {
  generateDdl,
  generateAllDdl,
} from "../functions/schema/generator.ts";

// ---------------------------------------------------------------------------
// Test helpers
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
// Rust test: test_patient_ddl_no_bracket_x (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_patient_ddl_no_bracket_x", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const ddl = generateDdl(defs, "Patient", '"memory"."test_schema"');
  assert(
    !ddl.includes("[x]"),
    `DDL contains [x]:\n${ddl.slice(0, 2000)}`,
  );
});

// ---------------------------------------------------------------------------
// Unit tests with inline bundles
// ---------------------------------------------------------------------------

Deno.test("generateDdl - basic structure with system columns", () => {
  const sd = makeSd(
    "Simple",
    "resource",
    false,
    "specialization",
    [
      makeElement("Simple", [], 0, "*"),
      makeElement("Simple.status", ["code"], 1, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Simple", "myschema");

  assert(ddl.startsWith('CREATE TABLE IF NOT EXISTS myschema."simple"'), `wrong prefix: ${ddl}`);
  assert(ddl.includes("_id VARCHAR NOT NULL"), "missing _id");
  assert(ddl.includes("_version_id INTEGER NOT NULL DEFAULT 1"), "missing _version_id");
  assert(ddl.includes("_last_updated TIMESTAMP NOT NULL DEFAULT now()"), "missing _last_updated");
  assert(ddl.includes("_is_deleted BOOLEAN NOT NULL DEFAULT false"), "missing _is_deleted");
  assert(ddl.includes("_raw JSON NOT NULL"), "missing _raw");
  assert(ddl.includes("PRIMARY KEY (_id)"), "missing primary key");
  assert(ddl.includes('"status" VARCHAR'), "missing status column");
});

Deno.test("generateDdl - table name is lowercased", () => {
  const sd = makeSd(
    "MedicationRequest",
    "resource",
    false,
    "specialization",
    [makeElement("MedicationRequest", [], 0, "*")],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "MedicationRequest", "s");
  assert(ddl.includes('"medicationrequest"'), "table name should be lowercased");
});

Deno.test("generateDdl - resourceType field is excluded", () => {
  const sd = makeSd(
    "Foo",
    "resource",
    false,
    "specialization",
    [
      makeElement("Foo", [], 0, "*"),
      makeElement("Foo.resourceType", ["string"], 0, "1"),
      makeElement("Foo.status", ["code"], 1, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Foo", "s");
  assert(!ddl.includes('"resourceType"'), "should not include resourceType column");
  assert(ddl.includes('"status"'), "should include status column");
});

Deno.test("generateDdl - array field gets [] suffix", () => {
  const sd = makeSd(
    "Patient",
    "resource",
    false,
    "specialization",
    [
      makeElement("Patient", [], 0, "*"),
      makeElement("Patient.name", ["string"], 0, "*"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Patient", "s");
  assert(ddl.includes("VARCHAR[]"), "array string field should be VARCHAR[]");
});

Deno.test("generateDdl - primitive type mapping", () => {
  const sd = makeSd(
    "Prim",
    "resource",
    false,
    "specialization",
    [
      makeElement("Prim", [], 0, "*"),
      makeElement("Prim.active", ["boolean"], 0, "1"),
      makeElement("Prim.count", ["integer"], 0, "1"),
      makeElement("Prim.score", ["decimal"], 0, "1"),
      makeElement("Prim.updated", ["instant"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Prim", "s");
  assert(ddl.includes('"active" BOOLEAN'), "boolean mapping");
  assert(ddl.includes('"count" INTEGER'), "integer mapping");
  assert(ddl.includes('"score" DOUBLE'), "decimal mapping");
  assert(ddl.includes('"updated" TIMESTAMP'), "instant mapping");
});

Deno.test("generateDdl - Reference type uses STRUCT", () => {
  const sd = makeSd(
    "Ref",
    "resource",
    false,
    "specialization",
    [
      makeElement("Ref", [], 0, "*"),
      makeElement("Ref.subject", ["Reference"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Ref", "s");
  assert(
    ddl.includes('"subject" STRUCT(reference VARCHAR, type VARCHAR, display VARCHAR)'),
    `missing Reference STRUCT in: ${ddl}`,
  );
});

Deno.test("generateDdl - Narrative type uses STRUCT", () => {
  const sd = makeSd(
    "Nar",
    "resource",
    false,
    "specialization",
    [
      makeElement("Nar", [], 0, "*"),
      makeElement("Nar.text", ["Narrative"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Nar", "s");
  assert(
    ddl.includes('"text" STRUCT(status VARCHAR, div VARCHAR)'),
    `missing Narrative STRUCT in: ${ddl}`,
  );
});

Deno.test("generateDdl - choice type produces UNION with capitalized variants", () => {
  const sd = makeSd(
    "Obs",
    "resource",
    false,
    "specialization",
    [
      makeElement("Obs", [], 0, "*"),
      makeElement("Obs.value[x]", ["string", "boolean", "integer"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Obs", "s");
  // [x] should NOT appear in output
  assert(!ddl.includes("[x]"), "DDL should not contain [x]");
  // UNION should appear
  assert(ddl.includes("UNION("), "should contain UNION");
  // Variant names should be capitalized
  assert(ddl.includes('"valueString"'), "should have valueString variant");
  assert(ddl.includes('"valueBoolean"'), "should have valueBoolean variant");
  assert(ddl.includes('"valueInteger"'), "should have valueInteger variant");
});

Deno.test("generateDdl - nested BackboneElement produces STRUCT", () => {
  const sd = makeSd(
    "Acct",
    "resource",
    false,
    "specialization",
    [
      makeElement("Acct", [], 0, "*"),
      makeElement("Acct.coverage", ["BackboneElement"], 0, "*"),
      makeElement("Acct.coverage.priority", ["positiveInt"], 0, "1"),
    ],
  );
  const bundle = makeBundle([bundleEntry(sd)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const ddl = generateDdl(reg, "Acct", "s");
  assert(ddl.includes("STRUCT("), "should contain STRUCT for nested element");
  assert(ddl.includes('"priority" UINTEGER'), "should have priority field in struct");
});

Deno.test("generateDdl - unknown resource type throws", () => {
  const bundle = emptyBundle();
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  let threw = false;
  try {
    generateDdl(reg, "FakeResource", "s");
  } catch (_e) {
    threw = true;
  }
  assert(threw, "should throw for unknown resource type");
});

Deno.test("generateDdl - complex type from registry produces STRUCT", () => {
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
  const ddl = generateDdl(reg, "Patient", "s");
  // HumanName should expand to a STRUCT
  assert(ddl.includes("STRUCT("), "should contain STRUCT for HumanName");
  assert(ddl.includes('"family" VARCHAR'), "should have family in struct");
  assert(ddl.includes('"given" VARCHAR[]'), "should have given array in struct");
});

Deno.test("generateDdl - contentReference at depth limit produces VARCHAR", () => {
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
  // Should not throw — recursion guard prevents infinite loop
  const ddl = generateDdl(reg, "SelfRef", "s");
  assert(ddl.length > 0, "DDL should be non-empty");
});

// ---------------------------------------------------------------------------
// generateAllDdl tests
// ---------------------------------------------------------------------------

Deno.test("generateAllDdl - returns one entry per resource type", () => {
  const sd1 = makeSd("ResA", "resource", false, "specialization", [
    makeElement("ResA", [], 0, "*"),
    makeElement("ResA.x", ["string"], 0, "1"),
  ]);
  const sd2 = makeSd("ResB", "resource", false, "specialization", [
    makeElement("ResB", [], 0, "*"),
    makeElement("ResB.y", ["boolean"], 0, "1"),
  ]);
  const bundle = makeBundle([bundleEntry(sd1), bundleEntry(sd2)]);
  const reg = DefinitionRegistry.loadFromJson(bundle, emptyBundle());
  const results = generateAllDdl(reg, "myschema");
  assertEquals(results.length, 2);
  const resA = results.find((r) => r.resourceType === "ResA")!;
  assert(resA !== undefined, "should have ResA");
  assert(resA.ddl !== null, "ResA should have DDL");
  assert(resA.error === null, "ResA should have no error");
  assert(resA.ddl!.includes('"resa"'), "ResA table name should be lowercase");
});

Deno.test("generateAllDdl - real registry produces DDL for all resource types", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const results = generateAllDdl(defs, '"memory"."fhir"');
  assert(results.length > 0, "should have results");
  const patientResult = results.find((r) => r.resourceType === "Patient")!;
  assert(patientResult !== undefined, "should have Patient");
  assert(patientResult.ddl !== null, `Patient DDL should not be null; error: ${patientResult.error}`);
  assert(!patientResult.ddl!.includes("[x]"), "Patient DDL should not contain [x]");
  // All results should have either ddl or error set (not both null)
  for (const r of results) {
    assert(r.ddl !== null || r.error !== null, `result for ${r.resourceType} has both null`);
  }
});
