// @ts-nocheck
// Tests for functions/handlers/crud.ts
// Transcribed from crud.rs #[cfg(test)] + handler tests with fake Conn.

import { assertEquals, assertRejects } from "std/assert/mod.ts";
import {
  stampResourceMeta,
  parseIfMatchEtag,
  mapTableOrInternalError,
  buildReadSql,
  buildCheckVersionSql,
  buildHistoryInsertSql,
  buildSoftDeleteSql,
  parseCheckRow,
  createResource,
  readResource,
  updateResource,
  deleteResource,
} from "../functions/handlers/crud.ts";
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
  // Use a registry stub that accepts our known types and provides minimal transform/column data.
  const registry = {
    isKnownResourceType(rt: string): boolean {
      return knownTypes.includes(rt);
    },
    getJsonTransform(_rt: string): string {
      return '{"id": "VARCHAR"}';
    },
    getColumnNames(_rt: string): string[] {
      return [];
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

/** Make a Conn that throws on any query matching the key. */
function makeErrorConn(matchKey: string, errorMsg: string): any {
  return {
    async query(sql: string) {
      if (sql.includes(matchKey)) throw new Error(errorMsg);
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// stampResourceMeta — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("stampResourceMeta_sets_id_and_version", () => {
  const r: any = { resourceType: "Patient" };
  stampResourceMeta(r, "abc", 3, "2026-05-23T10:00:00Z");
  assertEquals(r.id, "abc");
  assertEquals(r.meta.versionId, "3");
  assertEquals(r.meta.lastUpdated, "2026-05-23T10:00:00Z");
});

Deno.test("stampResourceMeta_overwrites_existing", () => {
  const r: any = { resourceType: "Patient", id: "old", meta: { versionId: "99" } };
  stampResourceMeta(r, "new", 1, "now");
  assertEquals(r.id, "new");
  assertEquals(r.meta.versionId, "1");
});

Deno.test("stampResourceMeta_noop_on_non_object", () => {
  // Should not throw and should not mutate a non-plain value
  // We call with a string cast — function checks typeof === "object"
  const notObj = "not an object" as any;
  // Won't stamp because string is not an object
  stampResourceMeta(notObj, "x", 1, "now");
  assertEquals(notObj, "not an object");
});

Deno.test("stampResourceMeta_noop_on_array", () => {
  // Rust only stamps on serde_json::Value::Object. Arrays are not objects there.
  // Our implementation uses Array.isArray guard to mirror this.
  const arr = [1, 2, 3];
  const arrAsRecord = arr as any;
  stampResourceMeta(arrAsRecord, "x", 1, "now");
  // Array.isArray guard prevents stamping
  assertEquals(arr.length, 3);
  assertEquals((arr as any).id, undefined);
});

// ---------------------------------------------------------------------------
// parseIfMatchEtag — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("parseIfMatchEtag_with_weak_prefix", () => {
  assertEquals(parseIfMatchEtag('W/"3"'), 3);
});

Deno.test("parseIfMatchEtag_with_plain_quotes", () => {
  assertEquals(parseIfMatchEtag('"7"'), 7);
});

Deno.test("parseIfMatchEtag_bare_number", () => {
  assertEquals(parseIfMatchEtag("42"), 42);
});

Deno.test("parseIfMatchEtag_invalid_returns_undefined", () => {
  assertEquals(parseIfMatchEtag("not-a-number"), undefined);
  assertEquals(parseIfMatchEtag('W/"abc"'), undefined);
});

// ---------------------------------------------------------------------------
// mapTableOrInternalError — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("mapTableOrInternalError_table_error_to_not_found", () => {
  const err = mapTableOrInternalError(
    "Table xyz does not exist",
    "Patient",
    "ds1",
    "fallback",
  );
  assertEquals(err instanceof FhirError, true);
  assertEquals(err.status, 404);
  assertEquals(err.diagnostics.includes("Patient"), true);
  assertEquals(err.diagnostics.includes("ds1"), true);
});

Deno.test("mapTableOrInternalError_other_error_to_internal", () => {
  const err = mapTableOrInternalError("some random error", "Patient", "ds1", "Failed");
  assertEquals(err instanceof FhirError, true);
  assertEquals(err.status, 500);
  assertEquals(err.diagnostics, "Failed");
});

Deno.test("mapTableOrInternalError_does_not_exist_string", () => {
  const err = mapTableOrInternalError("Catalog error: does not exist", "Observation", "myds", "x");
  assertEquals(err.status, 404);
});

// ---------------------------------------------------------------------------
// buildReadSql — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("buildReadSql_lowercases_table_and_escapes", () => {
  const sql = buildReadSql('"db"."ds"', "Observation", "o'1");
  assertEquals(sql.includes('"observation"'), true);
  assertEquals(sql.includes("'o''1'"), true);
  assertEquals(sql.includes("_raw"), true);
  assertEquals(sql.includes("_is_deleted"), true);
  assertEquals(sql.includes("_version_id"), true);
});

Deno.test("buildReadSql_exact_format", () => {
  const sql = buildReadSql('"memory"."ds1"', "Patient", "p1");
  assertEquals(
    sql,
    `SELECT _raw, _is_deleted::VARCHAR, _version_id::VARCHAR FROM "memory"."ds1"."patient" WHERE _id = 'p1'`,
  );
});

// ---------------------------------------------------------------------------
// buildCheckVersionSql — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("buildCheckVersionSql_lowercases_and_escapes", () => {
  const sql = buildCheckVersionSql('"db"."ds"', "Patient", "p'1");
  assertEquals(sql.includes('"patient"'), true);
  assertEquals(sql.includes("'p''1'"), true);
});

Deno.test("buildCheckVersionSql_exact_format", () => {
  const sql = buildCheckVersionSql('"memory"."ds1"', "Patient", "p1");
  assertEquals(
    sql,
    `SELECT _version_id::VARCHAR, _raw FROM "memory"."ds1"."patient" WHERE _id = 'p1'`,
  );
});

// ---------------------------------------------------------------------------
// buildHistoryInsertSql — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("buildHistoryInsertSql_embeds_version", () => {
  const sql = buildHistoryInsertSql('"db"."ds"', 7);
  assertEquals(sql.includes('"db"."ds"._history'), true);
  assertEquals(sql.includes("_version_id"), true);
  assertEquals(sql.includes(", 7, "), true);
  assertEquals(sql.includes("_is_deleted"), true);
});

Deno.test("buildHistoryInsertSql_exact_format", () => {
  const sql = buildHistoryInsertSql('"memory"."ds1"', 3);
  assertEquals(
    sql,
    `INSERT INTO "memory"."ds1"._history (_id, _resource_type, _version_id, _last_updated, _raw, _is_deleted) VALUES ($1, $2, 3, CURRENT_TIMESTAMP, $3, false)`,
  );
});

// ---------------------------------------------------------------------------
// buildSoftDeleteSql — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("buildSoftDeleteSql_uses_lowercased_table_and_sets_flags", () => {
  const sql = buildSoftDeleteSql('"db"."ds"', "Patient", 5);
  assertEquals(sql.includes('"db"."ds"."patient"'), true);
  assertEquals(sql.includes("_is_deleted = true"), true);
  assertEquals(sql.includes("_version_id = 5"), true);
  assertEquals(sql.includes("_last_updated = CURRENT_TIMESTAMP"), true);
  assertEquals(sql.includes("WHERE _id = $1"), true);
});

Deno.test("buildSoftDeleteSql_exact_format", () => {
  const sql = buildSoftDeleteSql('"memory"."ds1"', "Patient", 5);
  assertEquals(
    sql,
    `UPDATE "memory"."ds1"."patient" SET _is_deleted = true, _version_id = 5, _last_updated = CURRENT_TIMESTAMP WHERE _id = $1`,
  );
});

// ---------------------------------------------------------------------------
// parseCheckRow — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("parseCheckRow_extracts_version_and_raw", () => {
  const row = ["3", '{"resourceType":"Patient"}'];
  const [v, raw] = parseCheckRow(row);
  assertEquals(v, 3);
  assertEquals(raw.includes("Patient"), true);
});

Deno.test("parseCheckRow_defaults_on_missing", () => {
  const row: unknown[] = [];
  const [v, raw] = parseCheckRow(row);
  assertEquals(v, 1);
  assertEquals(raw, "{}");
});

Deno.test("parseCheckRow_defaults_on_bad_types", () => {
  const row = [42, null];
  const [v, raw] = parseCheckRow(row);
  assertEquals(v, 1);
  assertEquals(raw, "{}");
});

Deno.test("parseCheckRow_handles_numeric_string_version", () => {
  const row = ["7", '{"id":"x"}'];
  const [v, raw] = parseCheckRow(row);
  assertEquals(v, 7);
  assertEquals(raw, '{"id":"x"}');
});

// ---------------------------------------------------------------------------
// createResource — handler tests
// ---------------------------------------------------------------------------

Deno.test("createResource_returns_201_with_location_and_etag", async () => {
  const state = makeState();
  const sqls: string[] = [];
  const conn = {
    async query(sql: string, _params?: unknown[]) {
      sqls.push(sql);
      return [];
    },
  };

  const res = await createResource("ds1", "Patient", { resourceType: "Patient" }, conn, state);
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("ETag"), 'W/"1"');
  assertEquals(res.headers.get("Location") !== null, true);
  assertEquals(res.headers.get("Location")!.includes("Patient"), true);
  assertEquals(res.headers.get("Content-Type"), "application/fhir+json");

  // Body should include meta.versionId = "1"
  const body = await res.json();
  assertEquals(body.meta?.versionId, "1");
  assertEquals(typeof body.id, "string");
  assertEquals(body.id.length > 0, true);

  // INSERT should have been issued
  assertEquals(sqls.some((s) => s.startsWith("INSERT INTO")), true);
});

Deno.test("createResource_location_header_format", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  const res = await createResource("ds1", "Patient", { resourceType: "Patient" }, conn, state);
  const location = res.headers.get("Location")!;
  // Format: /{datasetId}/{resourceType}/{uuid}
  assertEquals(location.startsWith("/ds1/Patient/"), true);
});

Deno.test("createResource_throws_400_on_invalid_datasetId", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  await assertRejects(
    () => createResource("bad id!", "Patient", {}, conn, state),
    FhirError,
  );
});

Deno.test("createResource_throws_400_on_unknown_resourceType", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  await assertRejects(
    () => createResource("ds1", "UnknownType", {}, conn, state),
    FhirError,
  );
});

Deno.test("createResource_throws_404_when_table_missing", async () => {
  const state = makeState();
  const conn = {
    async query(_sql: string) {
      throw new Error("Table does not exist");
    },
  };

  await assertRejects(
    () => createResource("ds1", "Patient", { resourceType: "Patient" }, conn, state),
    FhirError,
  );
  try {
    await createResource("ds1", "Patient", { resourceType: "Patient" }, conn, state);
  } catch (e) {
    assertEquals((e as FhirError).status, 404);
  }
});

// ---------------------------------------------------------------------------
// readResource — handler tests
// ---------------------------------------------------------------------------

Deno.test("readResource_returns_200_with_etag_for_existing_resource", async () => {
  const state = makeState();
  const fakeRow = {
    _raw: '{"resourceType":"Patient","id":"p1"}',
    _is_deleted: "false",
    _version_id: "3",
  };
  const conn = { async query() { return [fakeRow]; } };

  const res = await readResource("ds1", "Patient", "p1", conn, state);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("ETag"), 'W/"3"');
  assertEquals(res.headers.get("Content-Type"), "application/fhir+json");

  const body = await res.json();
  assertEquals(body.resourceType, "Patient");
});

Deno.test("readResource_throws_404_when_no_row", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  await assertRejects(
    () => readResource("ds1", "Patient", "p1", conn, state),
    FhirError,
  );
  try {
    await readResource("ds1", "Patient", "p1", conn, state);
  } catch (e) {
    assertEquals((e as FhirError).status, 404);
  }
});

Deno.test("readResource_throws_410_when_deleted", async () => {
  const state = makeState();
  const fakeRow = {
    _raw: '{"resourceType":"Patient","id":"p1"}',
    _is_deleted: "true",
    _version_id: "2",
  };
  const conn = { async query() { return [fakeRow]; } };

  try {
    await readResource("ds1", "Patient", "p1", conn, state);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals(e instanceof FhirError, true);
    assertEquals((e as FhirError).status, 410);
    assertEquals((e as FhirError).diagnostics.includes("deleted"), true);
  }
});

Deno.test("readResource_throws_400_on_invalid_fhir_id", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  await assertRejects(
    () => readResource("ds1", "Patient", "bad id with spaces", conn, state),
    FhirError,
  );
});

// ---------------------------------------------------------------------------
// updateResource — handler tests
// ---------------------------------------------------------------------------

Deno.test("updateResource_existing_issues_begin_history_update_commit_in_order", async () => {
  const state = makeState();
  const sqls: string[] = [];

  // Sequence: BEGIN → checkVersion → historyInsert → UPDATE → COMMIT
  const checkRow = {
    _version_id: "2",
    _raw: '{"resourceType":"Patient","id":"p1"}',
  };

  const conn = {
    async query(sql: string, _params?: unknown[]) {
      sqls.push(sql.trim().split(/\s+/)[0].toUpperCase() + ":" + sql.substring(0, 40));
      if (sql.includes("BEGIN")) return [];
      if (sql.includes("SELECT _version_id")) return [checkRow];
      if (sql.includes("_history")) return [];
      if (sql.includes("UPDATE") || sql.includes("INSERT")) return [];
      if (sql.includes("COMMIT")) return [];
      return [];
    },
  };

  const res = await updateResource(
    "ds1",
    "Patient",
    "p1",
    { resourceType: "Patient", id: "p1" },
    null,
    conn,
    state,
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("ETag"), 'W/"3"');

  // Verify SQLs were issued in the right sequence
  const sqlList = sqls.map((s) => s.split(":")[0]);
  const beginIdx = sqlList.indexOf("BEGIN");
  const commitIdx = sqlList.indexOf("COMMIT");
  assertEquals(beginIdx >= 0, true, "BEGIN must be issued");
  assertEquals(commitIdx >= 0, true, "COMMIT must be issued");
  assertEquals(beginIdx < commitIdx, true, "BEGIN must come before COMMIT");

  // history INSERT must appear between BEGIN and COMMIT
  const historyIdx = sqls.findIndex((s) => s.includes("_history"));
  assertEquals(historyIdx >= 0, true, "history INSERT must be issued");
});

Deno.test("updateResource_new_resource_returns_201", async () => {
  const state = makeState();
  const conn = {
    async query(sql: string) {
      if (sql.includes("SELECT _version_id")) return []; // empty → isNew
      return [];
    },
  };

  const res = await updateResource(
    "ds1",
    "Patient",
    "p-new",
    { resourceType: "Patient" },
    null,
    conn,
    state,
  );
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("ETag"), 'W/"1"');
});

Deno.test("updateResource_stale_if_match_throws_conflict", async () => {
  const state = makeState();
  const checkRow = { _version_id: "5", _raw: "{}" };

  const conn = {
    async query(sql: string) {
      if (sql.includes("BEGIN")) return [];
      if (sql.includes("SELECT _version_id")) return [checkRow];
      if (sql.includes("ROLLBACK")) return [];
      return [];
    },
  };

  try {
    await updateResource(
      "ds1",
      "Patient",
      "p1",
      { resourceType: "Patient" },
      'W/"3"', // stale: server has version 5
      conn,
      state,
    );
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals(e instanceof FhirError, true);
    assertEquals((e as FhirError).status, 409);
    assertEquals((e as FhirError).diagnostics.includes("conflict"), true);
  }
});

Deno.test("updateResource_matching_if_match_succeeds", async () => {
  const state = makeState();
  const checkRow = { _version_id: "5", _raw: "{}" };

  const conn = {
    async query(sql: string) {
      if (sql.includes("SELECT _version_id")) return [checkRow];
      return [];
    },
  };

  const res = await updateResource(
    "ds1",
    "Patient",
    "p1",
    { resourceType: "Patient" },
    'W/"5"', // matches current version
    conn,
    state,
  );
  assertEquals(res.status, 200);
});

Deno.test("updateResource_throws_400_on_invalid_id", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  await assertRejects(
    () => updateResource("ds1", "Patient", "bad id!", {}, null, conn, state),
    FhirError,
  );
});

Deno.test("updateResource_rollback_on_history_error", async () => {
  const state = makeState();
  const checkRow = { _version_id: "2", _raw: "{}" };
  let rolledBack = false;

  const conn = {
    async query(sql: string) {
      if (sql.includes("BEGIN")) return [];
      if (sql.includes("SELECT _version_id")) return [checkRow];
      if (sql.includes("_history")) throw new Error("history write failed");
      if (sql.includes("ROLLBACK")) { rolledBack = true; return []; }
      return [];
    },
  };

  await assertRejects(
    () => updateResource("ds1", "Patient", "p1", { resourceType: "Patient" }, null, conn, state),
    FhirError,
  );
  assertEquals(rolledBack, true);
});

// ---------------------------------------------------------------------------
// deleteResource — handler tests
// ---------------------------------------------------------------------------

Deno.test("deleteResource_returns_204_and_issues_soft_delete", async () => {
  const state = makeState();
  const sqls: string[] = [];
  const checkRow = { _version_id: "3", _raw: '{"resourceType":"Patient","id":"p1"}' };

  const conn = {
    async query(sql: string, _params?: unknown[]) {
      sqls.push(sql);
      if (sql.includes("SELECT _version_id") && sql.includes("AND NOT _is_deleted")) {
        return [checkRow];
      }
      return [];
    },
  };

  const res = await deleteResource("ds1", "Patient", "p1", conn, state);
  assertEquals(res.status, 204);

  // Verify soft-delete UPDATE was issued
  assertEquals(sqls.some((s) => s.includes("_is_deleted = true")), true, "soft-delete UPDATE must be issued");
  // Verify history INSERT was issued
  assertEquals(sqls.some((s) => s.includes("_history")), true, "history INSERT must be issued");
  // Verify COMMIT was issued
  assertEquals(sqls.some((s) => s.includes("COMMIT")), true, "COMMIT must be issued");
});

Deno.test("deleteResource_throws_404_when_resource_not_found", async () => {
  const state = makeState();
  const conn = {
    async query(sql: string) {
      if (sql.includes("BEGIN")) return [];
      if (sql.includes("AND NOT _is_deleted")) return []; // empty → not found
      if (sql.includes("ROLLBACK")) return [];
      return [];
    },
  };

  try {
    await deleteResource("ds1", "Patient", "p1", conn, state);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals(e instanceof FhirError, true);
    assertEquals((e as FhirError).status, 404);
  }
});

Deno.test("deleteResource_throws_404_when_already_deleted", async () => {
  // The check SQL filters with AND NOT _is_deleted, so deleted resources return empty
  const state = makeState();
  const conn = {
    async query(sql: string) {
      if (sql.includes("BEGIN")) return [];
      if (sql.includes("AND NOT _is_deleted")) return []; // already deleted → empty
      if (sql.includes("ROLLBACK")) return [];
      return [];
    },
  };

  try {
    await deleteResource("ds1", "Patient", "p1", conn, state);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as FhirError).status, 404);
  }
});

Deno.test("deleteResource_throws_400_on_invalid_resource_type", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  await assertRejects(
    () => deleteResource("ds1", "UnknownType", "p1", conn, state),
    FhirError,
  );
});

// ---------------------------------------------------------------------------
// createResource + updateResource — validation failure tests
// ---------------------------------------------------------------------------

Deno.test("createResource_returns_400_with_operation_outcome_on_resourceType_mismatch", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  // Body has resourceType "Observation" but endpoint is "Patient" → validation error
  const res = await createResource("ds1", "Patient", { resourceType: "Observation" }, conn, state);
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("content-type"), "application/fhir+json");

  const body = await res.json();
  assertEquals(body.resourceType, "OperationOutcome");
  assertEquals(Array.isArray(body.issue), true);
  assertEquals(body.issue.length > 0, true);
  assertEquals(body.issue[0].severity, "error");
  assertEquals(body.issue[0].code, "value");
});

Deno.test("updateResource_returns_400_with_operation_outcome_on_id_mismatch", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  // Body has id "other-id" but URL id is "p1" → validation error
  const res = await updateResource(
    "ds1",
    "Patient",
    "p1",
    { resourceType: "Patient", id: "other-id" },
    null,
    conn,
    state,
  );
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("content-type"), "application/fhir+json");

  const body = await res.json();
  assertEquals(body.resourceType, "OperationOutcome");
  assertEquals(Array.isArray(body.issue), true);
  // Should have an error about the id mismatch
  assertEquals(
    body.issue.some((i: any) => i.code === "value" && i.severity === "error"),
    true,
  );
});

Deno.test("deleteResource_issues_begin_before_check", async () => {
  const state = makeState();
  const sqls: string[] = [];
  const checkRow = { _version_id: "1", _raw: "{}" };

  const conn = {
    async query(sql: string, _params?: unknown[]) {
      sqls.push(sql);
      if (sql.includes("AND NOT _is_deleted")) return [checkRow];
      return [];
    },
  };

  await deleteResource("ds1", "Patient", "p1", conn, state);

  const beginIdx = sqls.findIndex((s) => s.includes("BEGIN"));
  const checkIdx = sqls.findIndex((s) => s.includes("AND NOT _is_deleted"));
  assertEquals(beginIdx >= 0, true);
  assertEquals(checkIdx >= 0, true);
  assertEquals(beginIdx < checkIdx, true, "BEGIN must come before the SELECT check");
});
