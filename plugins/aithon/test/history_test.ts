// @ts-nocheck
// Tests for functions/handlers/history.ts
// Transcribed from history.rs #[cfg(test)] + handler tests with fake Conn.

import { assertEquals, assertRejects } from "std/assert/mod.ts";
import {
  buildHistorySql,
  buildCurrentVersionSql,
  buildHistoryEntry,
  buildHistoryBundle,
  buildHistoryVersionSql,
  buildCurrentVersionByIdSql,
  resourceHistory,
  readResourceVersion,
} from "../functions/handlers/history.ts";
import { FhirError } from "../functions/error.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers: minimal AppState + fake Conn
// ---------------------------------------------------------------------------

function makeState(knownTypes: string[] = ["Patient", "Observation"]): {
  registry: ResourceRegistry;
  searchParams: SearchParamRegistry;
  dbName: string;
} {
  const registry = {
    isKnownResourceType(rt: string): boolean {
      return knownTypes.includes(rt);
    },
    tableName(rt: string): string {
      return rt.toLowerCase();
    },
  } as any;
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );
  return { registry, searchParams, dbName: "memory" };
}

/** A fake Conn that records SQL calls and returns configurable row sequences. */
function makeFakeConn(responses: Map<string | RegExp, any[]>): {
  conn: any;
  calls: { sql: string; params: unknown[] }[];
} {
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      for (const [key, rows] of responses.entries()) {
        if (typeof key === "string") {
          if (sql.includes(key)) return rows;
        } else {
          if (key.test(sql)) return rows;
        }
      }
      return [];
    },
  };
  return { conn, calls };
}

// ---------------------------------------------------------------------------
// buildHistorySql — port of Rust build_history_sql tests
// ---------------------------------------------------------------------------

Deno.test("buildHistorySql_escapes_quotes", () => {
  const sql = buildHistorySql('"db"."ds"', "Patient", "abc'def");
  // must reference the _history table under the schema
  assertEquals(sql.includes('"db"."ds"._history'), true);
  // must escape single-quotes in resource id
  assertEquals(sql.includes("'abc''def'"), true);
  // must order newest-first
  assertEquals(sql.includes("ORDER BY _version_id DESC"), true);
});

// ---------------------------------------------------------------------------
// buildCurrentVersionSql — port of Rust build_current_version_sql tests
// ---------------------------------------------------------------------------

Deno.test("buildCurrentVersionSql_uses_lowercase_table", () => {
  const sql = buildCurrentVersionSql('"db"."ds"', "MedicationRequest", "x1");
  assertEquals(sql.includes('"medicationrequest"'), true);
  assertEquals(sql.includes("'x1'"), true);
});

// ---------------------------------------------------------------------------
// buildHistoryEntry — port of Rust build_history_entry tests
// ---------------------------------------------------------------------------

Deno.test("buildHistoryEntry_with_valid_resource", () => {
  const entry = buildHistoryEntry(
    "ds",
    "Patient",
    "p1",
    "3",
    '{"resourceType":"Patient","id":"p1"}',
    false,
  );
  assertEquals(entry !== undefined, true);
  assertEquals((entry!.request as any).method, "PUT");
  assertEquals((entry!.request as any).url, "Patient/p1");
  assertEquals(entry!.fullUrl, "/ds/Patient/p1");
  assertEquals((entry!.response as any).etag, 'W/"3"');
  assertEquals((entry!.resource as any).id, "p1");
});

Deno.test("buildHistoryEntry_marks_delete_when_deleted", () => {
  const entry = buildHistoryEntry(
    "ds",
    "Patient",
    "p1",
    "4",
    '{"resourceType":"Patient","id":"p1"}',
    true,
  );
  assertEquals(entry !== undefined, true);
  assertEquals((entry!.request as any).method, "DELETE");
});

Deno.test("buildHistoryEntry_returns_undefined_for_invalid_json", () => {
  const entry = buildHistoryEntry("ds", "Patient", "p1", "1", "not-json", false);
  assertEquals(entry, undefined);
});

// ---------------------------------------------------------------------------
// buildHistoryBundle — port of Rust build_history_bundle tests
// ---------------------------------------------------------------------------

Deno.test("buildHistoryBundle_wraps_entries", () => {
  const entries = [{ fullUrl: "/a" } as any, { fullUrl: "/b" } as any];
  const bundle = buildHistoryBundle(entries);
  assertEquals(bundle.resourceType, "Bundle");
  assertEquals(bundle.type, "history");
  assertEquals(bundle.total, 2);
  assertEquals((bundle.entry as any[]).length, 2);
});

Deno.test("buildHistoryBundle_empty", () => {
  const bundle = buildHistoryBundle([]);
  assertEquals(bundle.total, 0);
  assertEquals((bundle.entry as any[]).length, 0);
});

// ---------------------------------------------------------------------------
// buildHistoryVersionSql — port of Rust build_history_version_sql tests
// ---------------------------------------------------------------------------

Deno.test("buildHistoryVersionSql_includes_filters", () => {
  const sql = buildHistoryVersionSql('"db"."ds"', "Patient", "abc", "5");
  assertEquals(sql.includes('"db"."ds"._history'), true);
  assertEquals(sql.includes("_id = 'abc'"), true);
  assertEquals(sql.includes("_resource_type = 'Patient'"), true);
  assertEquals(sql.includes("_version_id = 5"), true);
});

Deno.test("buildHistoryVersionSql_escapes_quotes", () => {
  const sql = buildHistoryVersionSql('"db"."ds"', "Patient", "a'b", "1");
  assertEquals(sql.includes("'a''b'"), true);
});

// ---------------------------------------------------------------------------
// buildCurrentVersionByIdSql — port of Rust build_current_version_by_id_sql tests
// ---------------------------------------------------------------------------

Deno.test("buildCurrentVersionByIdSql_lowercases_table", () => {
  const sql = buildCurrentVersionByIdSql('"db"."ds"', "MedicationRequest", "m1", "7");
  assertEquals(sql.includes('"medicationrequest"'), true);
  assertEquals(sql.includes("_id = 'm1'"), true);
  assertEquals(sql.includes("_version_id = 7"), true);
});

// ---------------------------------------------------------------------------
// resourceHistory handler tests
// ---------------------------------------------------------------------------

Deno.test("resourceHistory_returns_bundle_with_current_and_history_entries", async () => {
  const state = makeState();

  const currentRow = {
    _version_id: "2",
    _last_updated: "2026-06-01T10:00:00Z",
    _raw: '{"resourceType":"Patient","id":"p1","meta":{"versionId":"2"}}',
    _is_deleted: "false",
  };

  const historyRow = {
    _version_id: "1",
    _last_updated: "2026-05-01T10:00:00Z",
    _raw: '{"resourceType":"Patient","id":"p1","meta":{"versionId":"1"}}',
    _is_deleted: "false",
  };

  // Current table query matches table name "patient", history query matches "_history"
  const responses = new Map<string | RegExp, any[]>([
    [/"patient"/, [currentRow]],
    ["_history", [historyRow]],
  ]);
  const { conn } = makeFakeConn(responses);

  const res = await resourceHistory("ds1", "Patient", "p1", conn, state);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.resourceType, "Bundle");
  assertEquals(body.type, "history");
  assertEquals(body.total, 2);
  assertEquals(body.entry.length, 2);

  // Current version (v2) comes first (fetched first before history rows)
  assertEquals(body.entry[0].response.etag, 'W/"2"');
  assertEquals(body.entry[0].request.method, "PUT");
  assertEquals(body.entry[0].fullUrl, "/ds1/Patient/p1");

  // Historical version (v1) comes second
  assertEquals(body.entry[1].response.etag, 'W/"1"');
  assertEquals(body.entry[1].request.method, "PUT");
});

Deno.test("resourceHistory_empty_bundle_when_no_rows", async () => {
  const state = makeState();
  const responses = new Map<string | RegExp, any[]>();
  const { conn } = makeFakeConn(responses);

  const res = await resourceHistory("ds1", "Patient", "p1", conn, state);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.total, 0);
  assertEquals(body.entry.length, 0);
});

Deno.test("resourceHistory_marks_deleted_entry", async () => {
  const state = makeState();

  const currentRow = {
    _version_id: "3",
    _last_updated: "2026-06-01T12:00:00Z",
    _raw: '{"resourceType":"Patient","id":"p1"}',
    _is_deleted: "true",
  };

  const responses = new Map<string | RegExp, any[]>([
    [/"patient"/, [currentRow]],
    ["_history", []],
  ]);
  const { conn } = makeFakeConn(responses);

  const res = await resourceHistory("ds1", "Patient", "p1", conn, state);
  const body = await res.json();
  assertEquals(body.entry[0].request.method, "DELETE");
});

Deno.test("resourceHistory_rejects_unknown_resource_type", async () => {
  const state = makeState(["Patient"]);
  const { conn } = makeFakeConn(new Map());
  await assertRejects(
    () => resourceHistory("ds1", "UnknownType", "p1", conn, state),
    FhirError,
  );
});

Deno.test("resourceHistory_rejects_invalid_dataset_id", async () => {
  const state = makeState();
  const { conn } = makeFakeConn(new Map());
  await assertRejects(
    () => resourceHistory("bad id!", "Patient", "p1", conn, state),
    FhirError,
  );
});

Deno.test("resourceHistory_rejects_invalid_fhir_id", async () => {
  const state = makeState();
  const { conn } = makeFakeConn(new Map());
  await assertRejects(
    () => resourceHistory("ds1", "Patient", "bad id!", conn, state),
    FhirError,
  );
});

// ---------------------------------------------------------------------------
// readResourceVersion handler tests
// ---------------------------------------------------------------------------

Deno.test("readResourceVersion_found_in_history_table", async () => {
  const state = makeState();

  const historyRow = {
    _raw: '{"resourceType":"Patient","id":"p1","meta":{"versionId":"1"}}',
  };

  // history query hits "_history", current table query hits "patient"
  const responses = new Map<string | RegExp, any[]>([
    ["_history", [historyRow]],
  ]);
  const { conn } = makeFakeConn(responses);

  const res = await readResourceVersion("ds1", "Patient", "p1", "1", conn, state);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("etag"), 'W/"1"');

  const body = await res.json();
  assertEquals(body.resourceType, "Patient");
  assertEquals(body.id, "p1");
});

Deno.test("readResourceVersion_found_in_current_table_fallback", async () => {
  const state = makeState();

  const currentRow = {
    _raw: '{"resourceType":"Patient","id":"p1","meta":{"versionId":"2"}}',
  };

  // _history returns empty, current table returns the row
  const responses = new Map<string | RegExp, any[]>([
    ["_history", []],
    [/"patient"/, [currentRow]],
  ]);
  const { conn } = makeFakeConn(responses);

  const res = await readResourceVersion("ds1", "Patient", "p1", "2", conn, state);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("etag"), 'W/"2"');

  const body = await res.json();
  assertEquals(body.meta.versionId, "2");
});

Deno.test("readResourceVersion_not_found_returns_404", async () => {
  const state = makeState();

  // Both queries return empty
  const responses = new Map<string | RegExp, any[]>([
    ["_history", []],
    [/"patient"/, []],
  ]);
  const { conn } = makeFakeConn(responses);

  await assertRejects(
    () => readResourceVersion("ds1", "Patient", "p1", "99", conn, state),
    FhirError,
  );

  // Verify it's a 404
  try {
    await readResourceVersion("ds1", "Patient", "p1", "99", conn, state);
  } catch (e) {
    assertEquals((e as FhirError).status, 404);
  }
});

Deno.test("readResourceVersion_rejects_invalid_version_id", async () => {
  const state = makeState();
  const { conn } = makeFakeConn(new Map());
  await assertRejects(
    () => readResourceVersion("ds1", "Patient", "p1", "0", conn, state),
    FhirError,
  );
});

Deno.test("readResourceVersion_rejects_non_integer_version_id", async () => {
  const state = makeState();
  const { conn } = makeFakeConn(new Map());
  await assertRejects(
    () => readResourceVersion("ds1", "Patient", "p1", "abc", conn, state),
    FhirError,
  );
});

Deno.test("readResourceVersion_rejects_unknown_resource_type", async () => {
  const state = makeState(["Patient"]);
  const { conn } = makeFakeConn(new Map());
  await assertRejects(
    () => readResourceVersion("ds1", "UnknownType", "p1", "1", conn, state),
    FhirError,
  );
});
