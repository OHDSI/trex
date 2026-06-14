// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/type_mapping.rs #[cfg(test)] mod tests

import { assertEquals, assert } from "std/assert/mod.ts";
import {
  fhirToDuckdbType,
  isPrimitiveType,
  isComplexType,
} from "../functions/schema/type_mapping.ts";

// ---------------------------------------------------------------------------
// Rust test: test_primitive_mappings
// ---------------------------------------------------------------------------
Deno.test("test_primitive_mappings", () => {
  assertEquals(fhirToDuckdbType("boolean"), "BOOLEAN");
  assertEquals(fhirToDuckdbType("integer"), "INTEGER");
  assertEquals(fhirToDuckdbType("positiveInt"), "UINTEGER");
  assertEquals(fhirToDuckdbType("decimal"), "DOUBLE");
  assertEquals(fhirToDuckdbType("string"), "VARCHAR");
  assertEquals(fhirToDuckdbType("code"), "VARCHAR");
  assertEquals(fhirToDuckdbType("dateTime"), "VARCHAR");
  assertEquals(fhirToDuckdbType("instant"), "TIMESTAMP");
  assertEquals(fhirToDuckdbType("time"), "TIME");
});

// ---------------------------------------------------------------------------
// Rust test: test_is_primitive
// ---------------------------------------------------------------------------
Deno.test("test_is_primitive", () => {
  assert(isPrimitiveType("boolean"));
  assert(isPrimitiveType("string"));
  assert(!isPrimitiveType("HumanName"));
  assert(!isPrimitiveType("CodeableConcept"));
});

// ---------------------------------------------------------------------------
// Additional coverage for completeness
// ---------------------------------------------------------------------------
Deno.test("fhirToDuckdbType - unsignedInt and url", () => {
  assertEquals(fhirToDuckdbType("unsignedInt"), "UINTEGER");
  assertEquals(fhirToDuckdbType("url"), "VARCHAR");
  assertEquals(fhirToDuckdbType("canonical"), "VARCHAR");
  assertEquals(fhirToDuckdbType("base64Binary"), "VARCHAR");
  assertEquals(fhirToDuckdbType("xhtml"), "VARCHAR");
  assertEquals(fhirToDuckdbType("UnknownType"), "VARCHAR");
});

Deno.test("isComplexType excludes primitives, Resource, Element", () => {
  assert(!isComplexType("boolean"));
  assert(!isComplexType("string"));
  assert(!isComplexType("Resource"));
  assert(!isComplexType("Element"));
  assert(isComplexType("HumanName"));
  assert(isComplexType("CodeableConcept"));
  assert(isComplexType("Reference"));
});
