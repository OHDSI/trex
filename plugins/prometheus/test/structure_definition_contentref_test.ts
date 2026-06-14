import { assertEquals, assert } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";

// ---------------------------------------------------------------------------
// Fixtures — a "Questionnaire"-like resource with a recursive contentReference
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

// X resource:
//   X.item          (BackboneElement, max *)  — has nested children in snapshot
//   X.item.linkId   (string)
//   X.item.text     (string)
//   X.item.item     (contentReference: "#X.item", max *)  — the recursive reference
//
// The snapshot must list elements flat (as FHIR snapshots do); _buildElementTree
// nests them.
const X_SD = {
  resourceType: "StructureDefinition",
  kind: "resource",
  abstract: false,
  type: "X",
  snapshot: {
    element: [
      { path: "X", min: 0, max: "*" },
      { path: "X.item", min: 0, max: "*", type: [{ code: "BackboneElement" }] },
      { path: "X.item.linkId", min: 1, max: "1", type: [{ code: "string" }] },
      { path: "X.item.text", min: 0, max: "1", type: [{ code: "string" }] },
      { path: "X.item.item", min: 0, max: "*", contentReference: "#X.item" },
    ],
  },
};

const RES_JSON = makeBundle([bundleEntry(X_SD)]);
const TYPES_JSON = makeBundle([]); // no external complex types needed

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("contentReference: top-level item has linkId, text, item children", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const sd = reg.getResourceDefinition("X");
  assert(sd !== undefined, "X should be resolvable");

  const itemEl = sd.elements.find((e) => e.name === "item");
  assert(itemEl !== undefined, "top-level item element should be present");
  assert(itemEl.children.length > 0, "item should have resolved children");

  const childNames = itemEl.children.map((c) => c.name);
  assert(childNames.includes("linkId"), `expected 'linkId' in item children, got: ${JSON.stringify(childNames)}`);
  assert(childNames.includes("text"), `expected 'text' in item children, got: ${JSON.stringify(childNames)}`);
  assert(childNames.includes("item"), `expected nested 'item' (contentReference) in item children, got: ${JSON.stringify(childNames)}`);
});

Deno.test("contentReference: nested item.item also has linkId and text (one recursion level)", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const sd = reg.getResourceDefinition("X");
  assert(sd !== undefined);

  const itemEl = sd.elements.find((e) => e.name === "item");
  assert(itemEl !== undefined);

  const nestedItemEl = itemEl.children.find((c) => c.name === "item");
  assert(nestedItemEl !== undefined, "nested item.item should be present after contentReference resolution");
  assert(nestedItemEl.children.length > 0, "nested item.item should have resolved children (first recursion level)");

  const nestedChildNames = nestedItemEl.children.map((c) => c.name);
  assert(nestedChildNames.includes("linkId"), `expected 'linkId' in nested item children, got: ${JSON.stringify(nestedChildNames)}`);
  assert(nestedChildNames.includes("text"), `expected 'text' in nested item children, got: ${JSON.stringify(nestedChildNames)}`);
});

Deno.test("contentReference: recursion is bounded (terminates; budget stops at crDepth=2)", () => {
  // crDepth < 2 means hops at crDepth=0 and crDepth=1 are both resolved; the
  // hop that would be crDepth=2 is NOT expanded (budget exhausted).
  // Concretely: X.item.item (crDepth=0 hop) is resolved, and its own item child
  // (crDepth=1 hop) is resolved, but the item at crDepth=1 level's own `item`
  // child (would be crDepth=2) has empty children — the recursion stops there.
  //
  // This test completing at all proves no infinite loop.
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  const sd = reg.getResourceDefinition("X");
  assert(sd !== undefined);

  // level0: X.item (has children from raw tree nesting, crDepth not incremented)
  const level0 = sd.elements.find((e) => e.name === "item");
  assert(level0 !== undefined);

  // level1: X.item.item resolved via contentReference at crDepth=0 → expands, crDepth becomes 1
  const level1 = level0.children.find((c) => c.name === "item");
  assert(level1 !== undefined, "first contentReference hop (crDepth=0) should be resolved");
  assert(level1.children.length > 0, "first hop's children should be expanded");

  // level2: the nested item.item resolved at crDepth=1 → still expands (1 < 2)
  const level2 = level1.children.find((c) => c.name === "item");
  assert(level2 !== undefined, "second contentReference hop (crDepth=1) should be resolved");
  assert(level2.children.length > 0, "second hop's children should be expanded");

  // level3: the item at crDepth=2 — budget exhausted (2 < 2 is false), should have empty children
  const level3 = level2.children.find((c) => c.name === "item");
  assert(level3 !== undefined, "third-level item should exist in the cloned tree");
  assertEquals(level3.children.length, 0, "third-level item.item should have no resolved children (crDepth=2 budget exhausted)");
});

Deno.test("contentReference: raw base tree (getResource) is not mutated by resolution", () => {
  const reg = DefinitionRegistry.loadFromJson(RES_JSON, TYPES_JSON);
  // Trigger resolution
  reg.getResourceDefinition("X");

  // Raw tree should still have item.item with no resolved children
  const raw = reg.getResource("X");
  assert(raw !== undefined);
  const rawItem = raw.elements.find((e) => e.name === "item");
  assert(rawItem !== undefined);
  const rawNestedItem = rawItem.children.find((c) => c.name === "item");
  assert(rawNestedItem !== undefined, "raw item.item should exist in the nested raw tree");
  // The raw nested item's children remain unmodified (empty, since it's a contentReference leaf)
  assertEquals(rawNestedItem.children.length, 0, "raw item.item.item children should remain unmodified");
});
