import { assertEquals, assert, assertThrows } from "std/assert/mod.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";

// ---------------------------------------------------------------------------
// Rust unit test ports
// ---------------------------------------------------------------------------

Deno.test("table_name_lowercases", () => {
  assertEquals(ResourceRegistry.tableName("Patient"), "patient");
  assertEquals(ResourceRegistry.tableName("Observation"), "observation");
  assertEquals(ResourceRegistry.tableName("MedicationRequest"), "medicationrequest");
});

Deno.test("empty_registry_knows_no_types", () => {
  const r = ResourceRegistry.empty();
  assert(!r.isKnownResourceType("Patient"));
  assertEquals(r.resourceTypeNames(), []);
});

Deno.test("ddl_without_definitions_errors", () => {
  const r = ResourceRegistry.empty();
  assertThrows(() => r.getDdl("Patient", "mydb.myschema"), Error, "No definitions loaded");
});

Deno.test("json_transform_without_definitions_errors", () => {
  const r = ResourceRegistry.empty();
  assertThrows(() => r.getJsonTransform("Patient"), Error, "No definitions loaded");
});

Deno.test("column_names_without_definitions_errors", () => {
  const r = ResourceRegistry.empty();
  assertThrows(() => r.getColumnNames("Patient"), Error, "No definitions loaded");
});

Deno.test("generate_all_ddl_empty_when_no_definitions", () => {
  const r = ResourceRegistry.empty();
  assertEquals(r.generateAllDdl("mydb.myschema"), []);
});

// ---------------------------------------------------------------------------
// Integration tests with real definitions
// ---------------------------------------------------------------------------

Deno.test("loaded registry knows Patient and caches transform", async () => {
  const reg = await ResourceRegistry.loadDefault();
  assert(reg.isKnownResourceType("Patient"));
  assert(!reg.isKnownResourceType("Nonsense"));
  assert(reg.resourceTypeNames().includes("Observation"));
  const a = reg.getJsonTransform("Patient");
  const b = reg.getJsonTransform("Patient"); // cached
  assertEquals(a, b);
  assert(reg.getDdl("Patient", '"memory"."ds1"').includes("CREATE TABLE"));
  assert(reg.getColumnNames("Patient").includes("gender"));
});
