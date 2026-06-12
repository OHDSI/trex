// @ts-nocheck
// Tests for functions/handlers/import.ts
// Transcribed from plugins/fhir/src/handlers/import.rs #[cfg(test)]

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import {
  classifyImportLine,
  importNdjson,
  LineOutcome,
} from "../functions/handlers/import.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers — fake registry and conn
// ---------------------------------------------------------------------------

/** Registry with no known types (mirrors empty_registry() in Rust). */
function emptyRegistry() {
  return {
    isKnownResourceType(_rt: string): boolean {
      return false;
    },
    getJsonTransform(_rt: string): string {
      return '{"id": "VARCHAR"}';
    },
    getColumnNames(_rt: string): string[] {
      return [];
    },
  };
}

/** Registry that knows Patient (and optionally others). Mirrors real_registry(). */
function realRegistry(knownTypes: string[] = ["Patient", "Observation"]) {
  return {
    isKnownResourceType(rt: string): boolean {
      return knownTypes.includes(rt);
    },
    getJsonTransform(_rt: string): string {
      return '{"id": "VARCHAR"}';
    },
    getColumnNames(_rt: string): string[] {
      return [];
    },
  };
}

function makeState(knownTypes: string[] = ["Patient", "Observation"]) {
  const registry = realRegistry(knownTypes);
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );
  return { registry, searchParams, dbName: "memory" };
}

function makeFakeConn(responses: Map<string | RegExp, any[] | Error> = new Map()): {
  conn: any;
  calls: { sql: string; params: unknown[] }[];
} {
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      for (const [key, result] of responses.entries()) {
        const matches =
          typeof key === "string" ? sql.includes(key) : key.test(sql);
        if (matches) {
          if (result instanceof Error) throw result;
          return result;
        }
      }
      return [];
    },
  };
  return { conn, calls };
}

// ---------------------------------------------------------------------------
// classifyImportLine — pure helper tests (transcribed from import.rs #[cfg(test)])
// ---------------------------------------------------------------------------

Deno.test("empty_line_is_empty", () => {
  const r = emptyRegistry();
  assertEquals(classifyImportLine("", r).kind, "empty");
  assertEquals(classifyImportLine("   ", r).kind, "empty");
  assertEquals(classifyImportLine("\n", r).kind, "empty");
});

Deno.test("invalid_json_is_rejected", () => {
  const r = emptyRegistry();
  const outcome = classifyImportLine("{not json", r);
  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.resourceType, null);
    assertStringIncludes(outcome.error, "Invalid JSON");
  }
});

Deno.test("missing_resource_type_is_rejected", () => {
  const r = emptyRegistry();
  const outcome = classifyImportLine('{"name": "x"}', r);
  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.resourceType, null);
    assertStringIncludes(outcome.error, "Missing resourceType");
  }
});

Deno.test("unknown_resource_type_is_rejected", () => {
  const r = emptyRegistry();
  const outcome = classifyImportLine('{"resourceType": "Patient"}', r);
  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.resourceType, "Patient");
    assertStringIncludes(outcome.error, "Unknown resource type");
  }
});

Deno.test("invalid_id_is_rejected", () => {
  const r = realRegistry();
  const outcome = classifyImportLine('{"resourceType": "Patient", "id": "bad id!"}', r);
  assertEquals(outcome.kind, "rejected");
  if (outcome.kind === "rejected") {
    assertEquals(outcome.resourceType, "Patient");
    assertStringIncludes(outcome.error, "Invalid resource id");
  }
});

Deno.test("accepted_with_client_id", () => {
  const r = realRegistry();
  const outcome = classifyImportLine('{"resourceType": "Patient", "id": "abc-123"}', r);
  assertEquals(outcome.kind, "accepted");
  if (outcome.kind === "accepted") {
    assertEquals(outcome.resourceType, "Patient");
    assertEquals(outcome.id, "abc-123");
  }
});

Deno.test("accepted_without_id_gets_generated_uuid", () => {
  const r = realRegistry();
  const outcome = classifyImportLine('{"resourceType": "Patient"}', r);
  assertEquals(outcome.kind, "accepted");
  if (outcome.kind === "accepted") {
    // UUID v4 strings are 36 characters with hyphens at known offsets
    assertEquals(outcome.id.length, 36);
    // Basic UUID format check: 8-4-4-4-12
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    assertEquals(uuidPattern.test(outcome.id), true);
  }
});

// ---------------------------------------------------------------------------
// importNdjson handler tests (fake Conn)
// ---------------------------------------------------------------------------

Deno.test("import_3_ndjson_patients_returns_3_success", async () => {
  const { conn, calls } = makeFakeConn();
  const state = makeState();

  const ndjson = [
    '{"resourceType": "Patient", "id": "p1"}',
    '{"resourceType": "Patient", "id": "p2"}',
    '{"resourceType": "Patient", "id": "p3"}',
  ].join("\n");

  const res = await importNdjson("ds1", ndjson, conn, state);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.outcome, "complete");
  assertEquals(body.total.success, 3);
  assertEquals(body.total.errors, 0);
  assertEquals(body.success["Patient"], 3);
  // No errorDetails key when there are no errors
  assertEquals(body.errorDetails, undefined);
});

Deno.test("import_malformed_line_is_error_counted_rest_succeeds", async () => {
  const { conn, calls } = makeFakeConn();
  const state = makeState();

  const ndjson = [
    '{"resourceType": "Patient", "id": "p1"}',
    "{not valid json}",
    '{"resourceType": "Patient", "id": "p3"}',
  ].join("\n");

  const res = await importNdjson("ds1", ndjson, conn, state);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.outcome, "complete");
  assertEquals(body.total.success, 2);
  assertEquals(body.total.errors, 1);
  assertEquals(body.success["Patient"], 2);
  assertEquals(body.errors["_parse"], 1);
  // errorDetails should be present
  assertEquals(Array.isArray(body.errorDetails), true);
  assertEquals(body.errorDetails.length, 1);
  assertEquals(body.errorDetails[0].line, 2);
  assertStringIncludes(body.errorDetails[0].error, "Invalid JSON");
});

Deno.test("import_blank_lines_are_skipped", async () => {
  const { conn } = makeFakeConn();
  const state = makeState();

  const ndjson = [
    '{"resourceType": "Patient", "id": "p1"}',
    "",
    "   ",
    '{"resourceType": "Patient", "id": "p2"}',
  ].join("\n");

  const res = await importNdjson("ds1", ndjson, conn, state);
  const body = await res.json();
  assertEquals(body.total.success, 2);
  assertEquals(body.total.errors, 0);
});

Deno.test("import_unknown_resource_type_counted_under_type_key", async () => {
  const { conn } = makeFakeConn();
  const state = makeState();

  const ndjson = '{"resourceType": "UnknownThing", "id": "x1"}';

  const res = await importNdjson("ds1", ndjson, conn, state);
  const body = await res.json();
  assertEquals(body.total.success, 0);
  assertEquals(body.total.errors, 1);
  assertEquals(body.errors["UnknownThing"], 1);
  assertEquals(body.errorDetails[0].resourceType, "UnknownThing");
  assertStringIncludes(body.errorDetails[0].error, "Unknown resource type");
});

Deno.test("import_missing_resource_type_counted_under_parse_key", async () => {
  const { conn } = makeFakeConn();
  const state = makeState();

  const ndjson = '{"id": "x1"}';

  const res = await importNdjson("ds1", ndjson, conn, state);
  const body = await res.json();
  assertEquals(body.total.errors, 1);
  assertEquals(body.errors["_parse"], 1);
  // errorDetails entry should have no resourceType key
  assertEquals(body.errorDetails[0].resourceType, undefined);
});

Deno.test("import_mixed_types_success_counts_per_type", async () => {
  const { conn } = makeFakeConn();
  const state = makeState(["Patient", "Observation"]);

  const ndjson = [
    '{"resourceType": "Patient", "id": "p1"}',
    '{"resourceType": "Observation", "id": "o1"}',
    '{"resourceType": "Patient", "id": "p2"}',
  ].join("\n");

  const res = await importNdjson("ds1", ndjson, conn, state);
  const body = await res.json();
  assertEquals(body.total.success, 3);
  assertEquals(body.success["Patient"], 2);
  assertEquals(body.success["Observation"], 1);
});

Deno.test("import_issues_correct_sqls_for_each_resource", async () => {
  const { conn, calls } = makeFakeConn();
  const state = makeState();

  const ndjson = '{"resourceType": "Patient", "id": "p1"}';

  await importNdjson("ds1", ndjson, conn, state);

  // Should have at least: SELECT (version check), INSERT (upsert)
  const hasSqlSelect = calls.some((c) => c.sql.includes("SELECT"));
  const hasSqlInsert = calls.some((c) => c.sql.includes("INSERT"));
  assertEquals(hasSqlSelect, true);
  assertEquals(hasSqlInsert, true);
});

Deno.test("import_db_table_not_found_throws_fhir_not_found", async () => {
  // Simulate a DB error containing "does not exist"
  const responses = new Map<string | RegExp, any[] | Error>();
  responses.set("SELECT", new Error('relation "memory"."ds_gone"."patient" does not exist'));
  const { conn } = makeFakeConn(responses);
  const state = makeState();

  const ndjson = '{"resourceType": "Patient", "id": "p1"}';

  let threw = false;
  try {
    await importNdjson("ds-gone", ndjson, conn, state);
  } catch (e: any) {
    threw = true;
    assertEquals(e.code, "not-found");
    assertStringIncludes(e.diagnostics, "ds-gone");
  }
  assertEquals(threw, true);
});

Deno.test("import_empty_body_returns_zero_counts", async () => {
  const { conn } = makeFakeConn();
  const state = makeState();

  const res = await importNdjson("ds1", "", conn, state);
  const body = await res.json();
  assertEquals(body.outcome, "complete");
  assertEquals(body.total.success, 0);
  assertEquals(body.total.errors, 0);
});

Deno.test("import_error_detail_line_numbers_are_1_based", async () => {
  const { conn } = makeFakeConn();
  const state = makeState();

  const ndjson = [
    "{bad json line 1}",
    "{bad json line 2}",
  ].join("\n");

  const res = await importNdjson("ds1", ndjson, conn, state);
  const body = await res.json();
  assertEquals(body.errorDetails[0].line, 1);
  assertEquals(body.errorDetails[1].line, 2);
});
