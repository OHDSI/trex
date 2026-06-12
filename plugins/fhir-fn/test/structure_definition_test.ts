import { assertEquals, assert, assertThrows } from "std/assert/mod.ts";
import {
  DefinitionRegistry,
  type ElementInfo,
  type ParsedStructureDefinition,
} from "../functions/fhir/structure_definition.ts";

// ---------------------------------------------------------------------------
// Test helpers (mirrors the Rust test helpers)
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
// Rust test: test_empty_bundles
// ---------------------------------------------------------------------------
Deno.test("test_empty_bundles", () => {
  const empty = JSON.stringify({ resourceType: "Bundle", type: "collection", entry: [] });
  const registry = DefinitionRegistry.loadFromJson(empty, empty);
  assertEquals(registry.resourceTypeNames().length, 0);
  assertEquals(registry.getResource("Anything"), undefined);
  assertEquals(registry.getType("Anything"), undefined);
});

// ---------------------------------------------------------------------------
// Rust test: test_parse_simple_resource
// ---------------------------------------------------------------------------
Deno.test("test_parse_simple_resource", () => {
  const sd = makeSd(
    "TestResource",
    "resource",
    false,
    "specialization",
    [
      makeElement("TestResource", [], 0, "*"),    // root – skipped
      makeElement("TestResource.id", ["id"], 0, "1"),
      makeElement("TestResource.name", ["string"], 0, "1"),
      makeElement("TestResource.tag", ["Coding"], 0, "*"),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  assertEquals(registry.resourceTypeNames(), ["TestResource"]);

  const parsed = registry.getResource("TestResource")!;
  assert(parsed !== undefined);
  assertEquals(parsed.resourceType, "TestResource");
  assertEquals(parsed.kind, "resource");
  assertEquals(parsed.isAbstract, false);
  assertEquals(parsed.elements.length, 3);

  const idElem = parsed.elements[0];
  assertEquals(idElem.name, "id");
  assertEquals(idElem.typeCodes, ["id"]);
  assertEquals(idElem.isArray, false);

  const tagElem = parsed.elements[2];
  assertEquals(tagElem.name, "tag");
  assertEquals(tagElem.isArray, true);
});

// ---------------------------------------------------------------------------
// Rust test: test_parse_complex_type
// ---------------------------------------------------------------------------
Deno.test("test_parse_complex_type", () => {
  const sd = makeSd(
    "HumanName",
    "complex-type",
    false,
    "specialization",
    [
      makeElement("HumanName", [], 0, "*"),
      makeElement("HumanName.use", ["code"], 0, "1"),
      makeElement("HumanName.text", ["string"], 0, "1"),
      makeElement("HumanName.family", ["string"], 0, "1"),
      makeElement("HumanName.given", ["string"], 0, "*"),
      makeElement("HumanName.prefix", ["string"], 0, "*"),
      makeElement("HumanName.suffix", ["string"], 0, "*"),
    ],
  );

  const typesBundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(emptyBundle(), typesBundle);

  assertEquals(registry.resourceTypeNames().length, 0);

  const hn = registry.getType("HumanName")!;
  assert(hn !== undefined);
  assertEquals(hn.kind, "complex-type");
  assertEquals(hn.elements.length, 6);

  const given = hn.elements.find((e) => e.name === "given")!;
  assert(given !== undefined);
  assertEquals(given.isArray, true);
  assertEquals(given.typeCodes, ["string"]);
});

// ---------------------------------------------------------------------------
// Rust test: test_choice_type
// ---------------------------------------------------------------------------
Deno.test("test_choice_type", () => {
  const sd = makeSd(
    "Observation",
    "resource",
    false,
    "specialization",
    [
      makeElement("Observation", [], 0, "*"),
      makeElement(
        "Observation.value[x]",
        ["Quantity", "CodeableConcept", "string", "boolean", "integer", "dateTime"],
        0,
        "1",
      ),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const obs = registry.getResource("Observation")!;
  assert(obs !== undefined);
  const value = obs.elements[0];
  assertEquals(value.isChoice, true);
  assertEquals(value.name, "value[x]");
  assertEquals(value.typeCodes, [
    "Quantity",
    "CodeableConcept",
    "string",
    "boolean",
    "integer",
    "dateTime",
  ]);
});

// ---------------------------------------------------------------------------
// Rust test: test_content_reference
// ---------------------------------------------------------------------------
Deno.test("test_content_reference", () => {
  const sd = makeSd(
    "Questionnaire",
    "resource",
    false,
    "specialization",
    [
      makeElement("Questionnaire", [], 0, "*"),
      makeElement("Questionnaire.status", ["code"], 1, "1"),
      makeElement("Questionnaire.item", ["BackboneElement"], 0, "*"),
      makeElement("Questionnaire.item.text", ["string"], 0, "1"),
      makeElementWithContentRef("Questionnaire.item.item", 0, "*", "#Questionnaire.item"),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const q = registry.getResource("Questionnaire")!;
  assert(q !== undefined);
  assertEquals(q.elements.length, 2); // status, item (top-level)

  const item = q.elements[1];
  assertEquals(item.name, "item");
  assertEquals(item.isArray, true);
  assertEquals(item.children.length, 2); // text, item (nested)

  const nestedItem = item.children[1];
  assertEquals(nestedItem.name, "item");
  assertEquals(nestedItem.contentReference, "Questionnaire.item");
});

// ---------------------------------------------------------------------------
// Rust test: test_nested_backbone_elements
// ---------------------------------------------------------------------------
Deno.test("test_nested_backbone_elements", () => {
  const sd = makeSd(
    "Account",
    "resource",
    false,
    "specialization",
    [
      makeElement("Account", [], 0, "*"),
      makeElement("Account.status", ["code"], 1, "1"),
      makeElement("Account.coverage", ["BackboneElement"], 0, "*"),
      makeElement("Account.coverage.coverage", ["Reference"], 1, "1"),
      makeElement("Account.coverage.priority", ["positiveInt"], 0, "1"),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const acct = registry.getResource("Account")!;
  assert(acct !== undefined);
  assertEquals(acct.elements.length, 2); // status, coverage

  const coverage = acct.elements[1];
  assertEquals(coverage.name, "coverage");
  assertEquals(coverage.isArray, true);
  assertEquals(coverage.children.length, 2);
  assertEquals(coverage.children[0].name, "coverage");
  assertEquals(coverage.children[1].name, "priority");
});

// ---------------------------------------------------------------------------
// Rust test: test_abstract_types_excluded_from_resources
// ---------------------------------------------------------------------------
Deno.test("test_abstract_types_excluded_from_resources", () => {
  const abstractSd = makeSd(
    "DomainResource",
    "resource",
    true,
    "specialization",
    [makeElement("DomainResource", [], 0, "*")],
  );
  const concreteSd = makeSd(
    "Patient",
    "resource",
    false,
    "specialization",
    [
      makeElement("Patient", [], 0, "*"),
      makeElement("Patient.active", ["boolean"], 0, "1"),
    ],
  );

  const bundle = makeBundle([bundleEntry(abstractSd), bundleEntry(concreteSd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  assertEquals(registry.getResource("DomainResource"), undefined);
  assert(registry.getResource("Patient") !== undefined);
});

// ---------------------------------------------------------------------------
// Rust test: test_non_structure_definitions_skipped
// ---------------------------------------------------------------------------
Deno.test("test_non_structure_definitions_skipped", () => {
  const capStmt = {
    resource: {
      resourceType: "CapabilityStatement",
      id: "base",
    },
  };
  const sd = makeSd(
    "Account",
    "resource",
    false,
    "specialization",
    [
      makeElement("Account", [], 0, "*"),
      makeElement("Account.status", ["code"], 1, "1"),
    ],
  );

  const bundle = makeBundle([capStmt, bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  assertEquals(registry.resourceTypeNames(), ["Account"]);
});

// ---------------------------------------------------------------------------
// Rust test: test_constraint_profiles_skipped
// ---------------------------------------------------------------------------
Deno.test("test_constraint_profiles_skipped", () => {
  // Profiles have derivation == "constraint" and should be excluded.
  const profileSd = makeSd(
    "USCorePatient",
    "resource",
    false,
    "constraint",
    [
      makeElement("Patient", [], 0, "*"),
      makeElement("Patient.active", ["boolean"], 0, "1"),
    ],
  );

  const bundle = makeBundle([bundleEntry(profileSd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  assertEquals(registry.resourceTypeNames().length, 0);
});

// ---------------------------------------------------------------------------
// Rust test: test_fhirpath_system_string_normalised
// ---------------------------------------------------------------------------
Deno.test("test_fhirpath_system_string_normalised", () => {
  const sd = makeSd(
    "TestRes",
    "resource",
    false,
    "specialization",
    [
      makeElement("TestRes", [], 0, "*"),
      {
        // Element with the special fhirpath URI type code.
        path: "TestRes.id",
        min: 0,
        max: "1",
        type: [
          {
            extension: [
              {
                url: "http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type",
                valueUrl: "string",
              },
            ],
            code: "http://hl7.org/fhirpath/System.String",
          },
        ],
      },
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const res = registry.getResource("TestRes")!;
  assert(res !== undefined);
  assertEquals(res.elements[0].typeCodes, ["string"]);
});

// ---------------------------------------------------------------------------
// Rust test: test_resource_type_names_sorted
// ---------------------------------------------------------------------------
Deno.test("test_resource_type_names_sorted", () => {
  const sdZ = makeSd("Zebra", "resource", false, "specialization", [
    makeElement("Zebra", [], 0, "*"),
  ]);
  const sdA = makeSd("Account", "resource", false, "specialization", [
    makeElement("Account", [], 0, "*"),
  ]);
  const sdM = makeSd("MedicationRequest", "resource", false, "specialization", [
    makeElement("MedicationRequest", [], 0, "*"),
  ]);

  const bundle = makeBundle([bundleEntry(sdZ), bundleEntry(sdA), bundleEntry(sdM)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  assertEquals(registry.resourceTypeNames(), ["Account", "MedicationRequest", "Zebra"]);
});

// ---------------------------------------------------------------------------
// Rust test: test_deeply_nested_elements
// ---------------------------------------------------------------------------
Deno.test("test_deeply_nested_elements", () => {
  // Three-level nesting: Resource.a.b.c
  const sd = makeSd(
    "Deep",
    "resource",
    false,
    "specialization",
    [
      makeElement("Deep", [], 0, "*"),
      makeElement("Deep.level1", ["BackboneElement"], 0, "*"),
      makeElement("Deep.level1.level2", ["BackboneElement"], 0, "1"),
      makeElement("Deep.level1.level2.level3", ["string"], 0, "1"),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const deep = registry.getResource("Deep")!;
  assert(deep !== undefined);
  assertEquals(deep.elements.length, 1);
  assertEquals(deep.elements[0].name, "level1");
  assertEquals(deep.elements[0].children.length, 1);
  assertEquals(deep.elements[0].children[0].name, "level2");
  assertEquals(deep.elements[0].children[0].children.length, 1);
  assertEquals(deep.elements[0].children[0].children[0].name, "level3");
  assertEquals(deep.elements[0].children[0].children[0].typeCodes, ["string"]);
});

// ---------------------------------------------------------------------------
// Rust test: test_element_without_type_or_children
// ---------------------------------------------------------------------------
Deno.test("test_element_without_type_or_children", () => {
  // An element with no type codes and no children (e.g. an extension
  // element) should still be included.
  const sd = makeSd(
    "Ext",
    "resource",
    false,
    "specialization",
    [
      makeElement("Ext", [], 0, "*"),
      makeElement("Ext.extension", [], 0, "*"),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const ext = registry.getResource("Ext")!;
  assert(ext !== undefined);
  assertEquals(ext.elements.length, 1);
  assertEquals(ext.elements[0].name, "extension");
  assertEquals(ext.elements[0].typeCodes.length, 0);
});

// ---------------------------------------------------------------------------
// Rust test: test_min_cardinality
// ---------------------------------------------------------------------------
Deno.test("test_min_cardinality", () => {
  const sd = makeSd(
    "Required",
    "resource",
    false,
    "specialization",
    [
      makeElement("Required", [], 0, "*"),
      makeElement("Required.status", ["code"], 1, "1"),
      makeElement("Required.optional", ["string"], 0, "1"),
    ],
  );

  const bundle = makeBundle([bundleEntry(sd)]);
  const registry = DefinitionRegistry.loadFromJson(bundle, emptyBundle());

  const req = registry.getResource("Required")!;
  assert(req !== undefined);
  assertEquals(req.elements[0].min, 1);
  assertEquals(req.elements[1].min, 0);
});

// ---------------------------------------------------------------------------
// Integration test: load real FHIR definitions from data files
// ---------------------------------------------------------------------------
Deno.test("loadDefault parses real FHIR definitions", async () => {
  const reg = await DefinitionRegistry.loadDefault();
  assert(reg.getResource("Patient") !== undefined);
  assert(reg.resourceTypeNames().includes("Observation"));
  assert(reg.getResource("Nonsense") === undefined);
});
