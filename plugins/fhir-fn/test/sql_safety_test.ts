// @ts-nocheck - Deno edge function
import { assertEquals, assertThrows } from "std/assert/mod.ts";
import {
  validateDatasetId,
  validateFhirId,
  validateVersionId,
  validateUuid,
  validateResourceType,
  escapeIdentifier,
  escapeString,
  toSchemaName,
  toQualifiedSchema,
  toQualifiedMetaSchema,
} from "../functions/sql_safety.ts";

// --- validateDatasetId ---

Deno.test("validateDatasetId: accepts valid ids", () => {
  validateDatasetId("my-dataset");
  validateDatasetId("abc123");
});

Deno.test("validateDatasetId: rejects empty string", () => {
  assertThrows(() => validateDatasetId(""));
});

Deno.test("validateDatasetId: rejects id longer than 128 chars", () => {
  assertThrows(() => validateDatasetId("a".repeat(129)));
});

Deno.test("validateDatasetId: rejects semicolon", () => {
  assertThrows(() => validateDatasetId("bad;input"));
});

Deno.test("validateDatasetId: rejects single quote", () => {
  assertThrows(() => validateDatasetId("bad'input"));
});

Deno.test("validateDatasetId: rejects double quote", () => {
  assertThrows(() => validateDatasetId('bad"input'));
});

// --- validateFhirId ---

Deno.test("validateFhirId: accepts valid ids", () => {
  validateFhirId("abc-123");
  validateFhirId("test.id_1");
});

Deno.test("validateFhirId: rejects empty string", () => {
  assertThrows(() => validateFhirId(""));
});

Deno.test("validateFhirId: rejects id longer than 64 chars", () => {
  assertThrows(() => validateFhirId("a".repeat(65)));
});

Deno.test("validateFhirId: rejects semicolon", () => {
  assertThrows(() => validateFhirId("bad;id"));
});

Deno.test("validateFhirId: rejects single quote", () => {
  assertThrows(() => validateFhirId("bad'id"));
});

// --- validateVersionId ---

Deno.test("validateVersionId: accepts positive integers", () => {
  validateVersionId("1");
  validateVersionId("42");
});

Deno.test("validateVersionId: rejects zero", () => {
  assertThrows(() => validateVersionId("0"));
});

Deno.test("validateVersionId: rejects negative", () => {
  assertThrows(() => validateVersionId("-1"));
});

Deno.test("validateVersionId: rejects non-numeric", () => {
  assertThrows(() => validateVersionId("abc"));
});

// --- validateUuid ---

Deno.test("validateUuid: accepts valid UUID", () => {
  validateUuid("550e8400-e29b-41d4-a716-446655440000");
});

Deno.test("validateUuid: rejects non-uuid string", () => {
  assertThrows(() => validateUuid("not-a-uuid"));
});

Deno.test("validateUuid: rejects empty string", () => {
  assertThrows(() => validateUuid(""));
});

Deno.test("validateUuid: rejects truncated UUID", () => {
  assertThrows(() => validateUuid("550e8400-e29b-41d4-a716"));
});

// --- validateResourceType ---

Deno.test("validateResourceType: accepts known type", () => {
  const reg = { isKnownResourceType: (rt: string) => rt === "Patient" };
  validateResourceType("Patient", reg);
});

Deno.test("validateResourceType: rejects empty string", () => {
  const reg = { isKnownResourceType: (_rt: string) => true };
  assertThrows(() => validateResourceType("", reg));
});

Deno.test("validateResourceType: rejects type longer than 64 chars", () => {
  const reg = { isKnownResourceType: (_rt: string) => true };
  assertThrows(() => validateResourceType("A".repeat(65), reg));
});

Deno.test("validateResourceType: rejects hyphenated type", () => {
  const reg = { isKnownResourceType: (_rt: string) => false };
  assertThrows(() => validateResourceType("Patient-1", reg));
});

Deno.test("validateResourceType: rejects type with single quote", () => {
  const reg = { isKnownResourceType: (_rt: string) => false };
  assertThrows(() => validateResourceType("Patient'", reg));
});

Deno.test("validateResourceType: rejects type with space", () => {
  const reg = { isKnownResourceType: (_rt: string) => false };
  assertThrows(() => validateResourceType("Pati ent", reg));
});

Deno.test("validateResourceType: rejects unknown type (message contains 'Unknown resource type')", () => {
  const reg = { isKnownResourceType: (_rt: string) => false };
  let caught: Error | undefined;
  try {
    validateResourceType("Patient", reg);
  } catch (e) {
    caught = e as Error;
  }
  if (!caught) throw new Error("Expected an error to be thrown");
  if (!caught.message.includes("Unknown resource type")) {
    throw new Error(`Expected message to contain 'Unknown resource type', got: ${caught.message}`);
  }
});

// --- escapeIdentifier ---

Deno.test("escapeIdentifier: wraps plain name in double quotes", () => {
  assertEquals(escapeIdentifier("foo"), '"foo"');
});

Deno.test("escapeIdentifier: doubles internal double quotes", () => {
  assertEquals(escapeIdentifier('foo"bar'), '"foo""bar"');
});

// --- escapeString ---

Deno.test("escapeString: leaves string without quotes unchanged", () => {
  assertEquals(escapeString("hello"), "hello");
});

Deno.test("escapeString: doubles single quotes", () => {
  assertEquals(escapeString("it's"), "it''s");
});

// --- toSchemaName ---

Deno.test("toSchemaName: replaces hyphens with underscores and quotes", () => {
  assertEquals(toSchemaName("my-dataset"), '"my_dataset"');
});

Deno.test("toSchemaName: quotes plain name unchanged", () => {
  assertEquals(toSchemaName("plain"), '"plain"');
});

// --- toQualifiedSchema ---

Deno.test("toQualifiedSchema: qualifies with db name and hyphen replacement", () => {
  assertEquals(toQualifiedSchema("memory", "my-dataset"), '"memory"."my_dataset"');
});

Deno.test("toQualifiedSchema: qualifies with plain names", () => {
  assertEquals(toQualifiedSchema("mydb", "plain"), '"mydb"."plain"');
});

// --- toQualifiedMetaSchema ---

Deno.test("toQualifiedMetaSchema: produces meta schema for memory", () => {
  assertEquals(toQualifiedMetaSchema("memory"), '"memory"."_fhir_meta"');
});

Deno.test("toQualifiedMetaSchema: produces meta schema for arbitrary db", () => {
  assertEquals(toQualifiedMetaSchema("mydb"), '"mydb"."_fhir_meta"');
});
