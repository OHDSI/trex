// @ts-nocheck
// Port of dataset.rs #[cfg(test)] — all 27 pure-helper tests + handler tests.

import { assertEquals, assertRejects } from "std/assert/mod.ts";
import {
  validateCreateDatasetId,
  buildHistoryDdl,
  buildValuesetExpansionDdl,
  buildResourceTypesSqlList,
  buildInsertDatasetSql,
  buildCreateDatasetResponse,
  rowToDatasetObject,
  checkDatasetDeletable,
  isDuplicateDatasetError,
  buildSelectDatasetSql,
  buildSelectDatasetStatusSql,
  buildMarkDeletingSql,
  buildDropSchemaSql,
  buildDeleteDatasetRowSql,
  buildUpdateDatasetTypesSql,
  buildUpdateDatasetResponse,
  initFhirMeta,
  parseCustomDefinitions,
  createDataset,
  listDatasets,
  getDataset,
  updateDataset,
  deleteDataset,
} from "../functions/handlers/dataset.ts";
import { FhirError } from "../functions/error.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(registry?: ResourceRegistry) {
  const reg = registry ?? ResourceRegistry.empty();
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );
  return { registry: reg, searchParams, dbName: "memory" };
}

/** Fake Conn whose query() inspects the SQL and returns rows accordingly. */
function makeFakeConn(handler: (sql: string, params?: unknown[]) => unknown[]) {
  return {
    async query(sql: string, params?: unknown[]) {
      return handler(sql, params);
    },
  };
}

// ---------------------------------------------------------------------------
// 1. validateCreateDatasetId (5 tests from dataset.rs)
// ---------------------------------------------------------------------------

Deno.test("validate_create_dataset_id_accepts_valid", () => {
  // Does not throw
  validateCreateDatasetId("ds");
  validateCreateDatasetId("ds-1");
  validateCreateDatasetId("Abc123");
});

Deno.test("validate_create_dataset_id_rejects_empty", () => {
  let thrown = false;
  try { validateCreateDatasetId(""); } catch (e) {
    thrown = true;
    assertEquals(e instanceof FhirError, true);
  }
  assertEquals(thrown, true);
});

Deno.test("validate_create_dataset_id_rejects_space", () => {
  let thrown = false;
  try { validateCreateDatasetId("a b"); } catch { thrown = true; }
  assertEquals(thrown, true);
});

Deno.test("validate_create_dataset_id_rejects_apostrophe", () => {
  let thrown = false;
  try { validateCreateDatasetId("a'b"); } catch { thrown = true; }
  assertEquals(thrown, true);
});

Deno.test("validate_create_dataset_id_rejects_underscore", () => {
  let thrown = false;
  try { validateCreateDatasetId("a_b"); } catch { thrown = true; }
  assertEquals(thrown, true);
});

Deno.test("validate_create_dataset_id_rejects_dot", () => {
  let thrown = false;
  try { validateCreateDatasetId("a.b"); } catch { thrown = true; }
  assertEquals(thrown, true);
});

// ---------------------------------------------------------------------------
// 2. buildHistoryDdl (1 test)
// ---------------------------------------------------------------------------

Deno.test("history_ddl_contains_required_columns", () => {
  const sql = buildHistoryDdl('"db"."ds"');
  assertEquals(sql.includes('CREATE TABLE IF NOT EXISTS "db"."ds"._history'), true);
  for (const col of ["_id", "_resource_type", "_version_id", "_last_updated", "_raw", "_is_deleted"]) {
    assertEquals(sql.includes(col), true, `missing column: ${col}`);
  }
  assertEquals(sql.includes("PRIMARY KEY"), true);
});

// ---------------------------------------------------------------------------
// 3. buildValuesetExpansionDdl (1 test)
// ---------------------------------------------------------------------------

Deno.test("valueset_expansion_ddl_contains_required_columns", () => {
  const sql = buildValuesetExpansionDdl('"db"."ds"');
  assertEquals(sql.includes("_valueset_expansion"), true);
  for (const col of ["valueset_url", "valueset_version", "code", "system", "display"]) {
    assertEquals(sql.includes(col), true, `missing column: ${col}`);
  }
});

// ---------------------------------------------------------------------------
// 4. buildResourceTypesSqlList (2 tests)
// ---------------------------------------------------------------------------

Deno.test("resource_types_sql_list_escapes_quotes", () => {
  const list = buildResourceTypesSqlList(["Patient", "Observ'tion"]);
  assertEquals(list, "'Patient', 'Observ''tion'");
});

Deno.test("resource_types_sql_list_empty", () => {
  assertEquals(buildResourceTypesSqlList([]), "");
});

// ---------------------------------------------------------------------------
// 5. buildInsertDatasetSql (1 test)
// ---------------------------------------------------------------------------

Deno.test("insert_dataset_sql_uses_placeholders", () => {
  const sql = buildInsertDatasetSql('"db"."_fhir_meta"', "'Patient', 'Observation'");
  assertEquals(sql.includes('INSERT INTO "db"."_fhir_meta"._datasets'), true);
  assertEquals(sql.includes("$1"), true);
  assertEquals(sql.includes("$2"), true);
  assertEquals(sql.includes("['Patient', 'Observation']"), true);
  assertEquals(sql.includes("'active'"), true);
});

// ---------------------------------------------------------------------------
// 6. buildCreateDatasetResponse (2 tests)
// ---------------------------------------------------------------------------

Deno.test("create_response_includes_basic_fields", () => {
  const resp = buildCreateDatasetResponse("ds", "My DS", ["Patient"], []);
  assertEquals(resp.id, "ds");
  assertEquals(resp.name, "My DS");
  assertEquals(resp.status, "active");
  assertEquals(resp.resource_count, 1);
  assertEquals(resp.warnings, undefined);
});

Deno.test("create_response_includes_warnings_when_present", () => {
  const errors = ["Foo: oops"];
  const resp = buildCreateDatasetResponse("ds", "My DS", ["Patient"], errors);
  assertEquals(Array.isArray(resp.warnings), true);
  assertEquals((resp.warnings as string[])[0], "Foo: oops");
});

// ---------------------------------------------------------------------------
// 7. rowToDatasetObject (2 tests)
// ---------------------------------------------------------------------------

Deno.test("row_to_dataset_object_zips_columns_and_row", () => {
  const cols = ["id", "name"];
  const row = ["d1", "Demo"];
  const obj = rowToDatasetObject(cols, row);
  assertEquals(obj.id, "d1");
  assertEquals(obj.name, "Demo");
});

Deno.test("row_to_dataset_object_handles_shorter_row", () => {
  const cols = ["a", "b", "c"];
  const row = [1]; // missing b, c
  const obj = rowToDatasetObject(cols, row);
  assertEquals(obj.a, 1);
  assertEquals(obj.b, undefined);
});

// ---------------------------------------------------------------------------
// 8. checkDatasetDeletable (2 tests)
// ---------------------------------------------------------------------------

Deno.test("check_dataset_deletable_blocks_busy_states", () => {
  let thrown = false;
  try { checkDatasetDeletable("deleting", "ds"); } catch { thrown = true; }
  assertEquals(thrown, true);

  thrown = false;
  try { checkDatasetDeletable("exporting", "ds"); } catch { thrown = true; }
  assertEquals(thrown, true);
});

Deno.test("check_dataset_deletable_allows_other_states", () => {
  checkDatasetDeletable("active", "ds");
  checkDatasetDeletable("paused", "ds");
  checkDatasetDeletable("", "ds");
});

// ---------------------------------------------------------------------------
// 9. isDuplicateDatasetError (1 test)
// ---------------------------------------------------------------------------

Deno.test("is_duplicate_dataset_error_matches_common_variants", () => {
  assertEquals(isDuplicateDatasetError("Duplicate key value"), true);
  assertEquals(isDuplicateDatasetError("violates UNIQUE constraint"), true);
  assertEquals(isDuplicateDatasetError("duplicate row"), true);
  assertEquals(isDuplicateDatasetError("some other error"), false);
});

// ---------------------------------------------------------------------------
// 10. buildSelectDatasetSql (2 tests)
// ---------------------------------------------------------------------------

Deno.test("select_dataset_sql_contains_columns_and_filter", () => {
  const sql = buildSelectDatasetSql('"db"."m"', "ds1");
  assertEquals(sql.includes("id, name, status, created_at, resource_types"), true);
  assertEquals(sql.includes('"db"."m"._datasets'), true);
  assertEquals(sql.includes("WHERE id = 'ds1'"), true);
});

Deno.test("select_dataset_sql_escapes_quotes", () => {
  const sql = buildSelectDatasetSql('"m"', "d's");
  assertEquals(sql.includes("'d''s'"), true);
});

// ---------------------------------------------------------------------------
// 11. buildSelectDatasetStatusSql (1 test)
// ---------------------------------------------------------------------------

Deno.test("select_dataset_status_sql", () => {
  const sql = buildSelectDatasetStatusSql('"m"', "ds1");
  assertEquals(sql.startsWith('SELECT status FROM "m"._datasets'), true);
  assertEquals(sql.includes("'ds1'"), true);
});

// ---------------------------------------------------------------------------
// 12. buildMarkDeletingSql (1 test)
// ---------------------------------------------------------------------------

Deno.test("mark_deleting_sql", () => {
  const sql = buildMarkDeletingSql('"m"', "ds1");
  assertEquals(sql.includes('UPDATE "m"._datasets'), true);
  assertEquals(sql.includes("status = 'deleting'"), true);
  assertEquals(sql.includes("WHERE id = 'ds1'"), true);
});

// ---------------------------------------------------------------------------
// 13. buildDropSchemaSql (1 test)
// ---------------------------------------------------------------------------

Deno.test("drop_schema_sql_has_cascade", () => {
  const sql = buildDropSchemaSql('"db"."ds"');
  assertEquals(sql, 'DROP SCHEMA IF EXISTS "db"."ds" CASCADE');
});

// ---------------------------------------------------------------------------
// 14. buildDeleteDatasetRowSql (1 test)
// ---------------------------------------------------------------------------

Deno.test("delete_dataset_row_sql", () => {
  const sql = buildDeleteDatasetRowSql('"m"', "ds1");
  assertEquals(sql.startsWith('DELETE FROM "m"._datasets'), true);
  assertEquals(sql.includes("WHERE id = 'ds1'"), true);
});

// ---------------------------------------------------------------------------
// 15. buildUpdateDatasetTypesSql (1 test)
// ---------------------------------------------------------------------------

Deno.test("update_dataset_types_sql_uses_list_concat", () => {
  const sql = buildUpdateDatasetTypesSql('"m"', "ds1", "'Patient', 'Observation'");
  assertEquals(sql.includes('UPDATE "m"._datasets'), true);
  assertEquals(sql.includes("list_concat(resource_types, ['Patient', 'Observation'])"), true);
  assertEquals(sql.includes("WHERE id = 'ds1'"), true);
});

// ---------------------------------------------------------------------------
// 16. buildUpdateDatasetResponse (2 tests)
// ---------------------------------------------------------------------------

Deno.test("update_dataset_response_includes_skipped_count", () => {
  const resp = buildUpdateDatasetResponse("ds1", ["Patient", "Observation"], 5);
  assertEquals(resp.id, "ds1");
  assertEquals((resp.added_types as string[])[0], "Patient");
  assertEquals(resp.skipped, 3);
});

Deno.test("update_dataset_response_zero_skipped", () => {
  const resp = buildUpdateDatasetResponse("ds1", ["Patient"], 1);
  assertEquals(resp.skipped, 0);
});

// ---------------------------------------------------------------------------
// Handler tests with mock Conn
// ---------------------------------------------------------------------------

// --- createDataset happy path ---

Deno.test("createDataset happy path returns 201 with id and resource_types", async () => {
  // Build a registry with at least one type (use a stub generateAllDdl)
  const state = makeState();
  // Stub registry so it has one known type
  const stubRegistry = {
    resourceTypeNames() { return ["Patient"]; },
    generateAllDdl(_schema: string) {
      return [{ resourceType: "Patient", ddl: "CREATE TABLE IF NOT EXISTS x.patient (_id VARCHAR)", error: null }];
    },
    isKnownResourceType() { return true; },
  } as any;
  const stateWithRegistry = { ...state, registry: stubRegistry };

  const sqlLog: string[] = [];
  const conn = makeFakeConn((sql, params) => {
    sqlLog.push(sql);
    return [];
  });

  const res = await createDataset({ id: "test-ds", name: "Test Dataset" }, conn, stateWithRegistry);
  assertEquals(res.status, 201);

  const body = await res.json();
  assertEquals(body.id, "test-ds");
  assertEquals(Array.isArray(body.resource_types), true);
  assertEquals(body.resource_types.includes("Patient"), true);
  assertEquals(body.status, "active");

  // Verify CREATE SCHEMA was issued
  const hasCreateSchema = sqlLog.some((s) => s.includes("CREATE SCHEMA") && s.includes("test_ds"));
  assertEquals(hasCreateSchema, true, `Expected CREATE SCHEMA for test_ds in: ${sqlLog.join(", ")}`);

  // Verify INSERT into _datasets was issued
  const hasInsert = sqlLog.some((s) => s.includes("INSERT INTO") && s.includes("_datasets"));
  assertEquals(hasInsert, true, `Expected INSERT INTO _datasets in: ${sqlLog.join(", ")}`);
});

// --- createDataset duplicate → 400 (matches native server) ---

Deno.test("createDataset duplicate id returns 400 badRequest", async () => {
  const stubRegistry = {
    resourceTypeNames() { return ["Patient"]; },
    generateAllDdl() {
      return [{ resourceType: "Patient", ddl: "CREATE TABLE IF NOT EXISTS x.patient (_id VARCHAR)", error: null }];
    },
    isKnownResourceType() { return true; },
  } as any;
  const state = { ...makeState(), registry: stubRegistry };

  let insertSeen = false;
  const conn = makeFakeConn((sql, params) => {
    if (sql.includes("INSERT INTO") && sql.includes("_datasets")) {
      insertSeen = true;
      // Simulate duplicate key error
      throw new Error("Duplicate key value violates unique constraint");
    }
    return [];
  });

  await assertRejects(
    () => createDataset({ id: "dup-ds", name: "Dup" }, conn, state),
    FhirError,
    "already exists",
  );
  assertEquals(insertSeen, true);

  // Verify the thrown FhirError has status 400 (matches native server)
  try {
    await createDataset({ id: "dup-ds2", name: "Dup" }, conn, state);
  } catch (e) {
    assertEquals(e instanceof FhirError, true);
    assertEquals((e as FhirError).status, 400);
  }
});

// --- createDataset invalid ID → 400 ---

Deno.test("createDataset rejects invalid dataset ID", async () => {
  const state = makeState();
  const conn = makeFakeConn(() => []);

  await assertRejects(
    () => createDataset({ id: "bad id!", name: "Bad" }, conn, state),
    FhirError,
  );
});

// --- getDataset missing → 404 ---

Deno.test("getDataset missing dataset returns 404", async () => {
  const state = makeState();
  const conn = makeFakeConn(() => []);

  await assertRejects(
    () => getDataset("not-there", conn, state),
    FhirError,
    "not found",
  );
});

// --- getDataset present → 200 ---

Deno.test("getDataset present dataset returns 200 with row", async () => {
  const state = makeState();
  const conn = makeFakeConn((sql) => {
    if (sql.includes("_datasets")) {
      return [{ id: "my-ds", name: "My DS", status: "active" }];
    }
    return [];
  });

  const res = await getDataset("my-ds", conn, state);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, "my-ds");
  assertEquals(body.status, "active");
});

// --- listDatasets → 200 with array ---

Deno.test("listDatasets returns 200 with array of datasets", async () => {
  const state = makeState();
  const conn = makeFakeConn(() => [
    { id: "ds1", name: "DS One", status: "active" },
    { id: "ds2", name: "DS Two", status: "active" },
  ]);

  const res = await listDatasets(conn, state);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body), true);
  assertEquals(body.length, 2);
  assertEquals(body[0].id, "ds1");
});

// --- deleteDataset non-deletable status → 409 ---

Deno.test("deleteDataset of deleting-status dataset throws conflict", async () => {
  const state = makeState();
  const conn = makeFakeConn((sql) => {
    if (sql.includes("SELECT status")) {
      return [{ status: "deleting" }];
    }
    return [];
  });

  await assertRejects(
    () => deleteDataset("busy-ds", conn, state),
    FhirError,
    "active operations",
  );

  // Verify status 409
  try {
    await deleteDataset("busy-ds", conn, state);
  } catch (e) {
    assertEquals(e instanceof FhirError, true);
    assertEquals((e as FhirError).status, 409);
  }
});

// --- deleteDataset exporting → 409 ---

Deno.test("deleteDataset of exporting-status dataset throws conflict", async () => {
  const state = makeState();
  const conn = makeFakeConn((sql) => {
    if (sql.includes("SELECT status")) {
      return [{ status: "exporting" }];
    }
    return [];
  });

  await assertRejects(
    () => deleteDataset("exporting-ds", conn, state),
    FhirError,
  );
});

// --- deleteDataset missing → 404 ---

Deno.test("deleteDataset missing dataset returns 404", async () => {
  const state = makeState();
  const conn = makeFakeConn(() => []);

  await assertRejects(
    () => deleteDataset("ghost-ds", conn, state),
    FhirError,
    "not found",
  );
});

// --- deleteDataset happy path → 204 ---

Deno.test("deleteDataset happy path returns 204", async () => {
  const state = makeState();
  const sqlLog: string[] = [];
  const conn = makeFakeConn((sql) => {
    sqlLog.push(sql);
    if (sql.includes("SELECT status")) {
      return [{ status: "active" }];
    }
    return [];
  });

  const res = await deleteDataset("good-ds", conn, state);
  assertEquals(res.status, 204);

  // Should have issued DROP SCHEMA
  const hasDropSchema = sqlLog.some((s) => s.includes("DROP SCHEMA IF EXISTS") && s.includes("CASCADE"));
  assertEquals(hasDropSchema, true);

  // Should have issued DELETE FROM _datasets
  const hasDelete = sqlLog.some((s) => s.includes("DELETE FROM") && s.includes("_datasets"));
  assertEquals(hasDelete, true);
});

// --- initFhirMeta issues correct DDL ---

Deno.test("initFhirMeta creates schema and two tables", async () => {
  const sqlLog: string[] = [];
  const conn = makeFakeConn((sql) => {
    sqlLog.push(sql);
    return [];
  });

  await initFhirMeta(conn, "memory");

  const hasSchema = sqlLog.some((s) => s.includes("CREATE SCHEMA IF NOT EXISTS"));
  assertEquals(hasSchema, true);

  const hasDatasets = sqlLog.some((s) => s.includes("_datasets") && s.includes("CREATE TABLE IF NOT EXISTS"));
  assertEquals(hasDatasets, true);

  const hasExportJobs = sqlLog.some((s) => s.includes("_export_jobs") && s.includes("CREATE TABLE IF NOT EXISTS"));
  assertEquals(hasExportJobs, true);
});

// ---------------------------------------------------------------------------
// parseCustomDefinitions tests
// ---------------------------------------------------------------------------

/** Minimal valid SD Bundle for a custom resource type. */
function makeCustomSdBundle(resourceName: string) {
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "StructureDefinition",
          name: resourceName,
          type: resourceName,
          kind: "resource",
          abstract: false,
          derivation: "specialization",
          snapshot: {
            element: [
              // root element (skipped by parser)
              { path: resourceName, min: 0, max: "*", type: [] },
              // one simple field
              { path: `${resourceName}.id`, min: 0, max: "1", type: [{ code: "string" }] },
            ],
          },
        },
      },
    ],
  };
}

Deno.test("parseCustomDefinitions: non-Bundle resource type throws badRequest", () => {
  let thrown: FhirError | undefined;
  try {
    parseCustomDefinitions({ resourceType: "Patient" });
  } catch (e) {
    thrown = e as FhirError;
  }
  assertEquals(thrown instanceof FhirError, true);
  assertEquals(thrown!.status, 400);
  assertEquals(thrown!.diagnostics.includes("must be a FHIR Bundle"), true);
});

Deno.test("parseCustomDefinitions: Bundle missing entry array throws badRequest", () => {
  let thrown: FhirError | undefined;
  try {
    parseCustomDefinitions({ resourceType: "Bundle" });
  } catch (e) {
    thrown = e as FhirError;
  }
  assertEquals(thrown instanceof FhirError, true);
  assertEquals(thrown!.status, 400);
  assertEquals(thrown!.diagnostics.includes("missing 'entry' array"), true);
});

Deno.test("parseCustomDefinitions: empty Bundle entry array throws badRequest", () => {
  let thrown: FhirError | undefined;
  try {
    parseCustomDefinitions({ resourceType: "Bundle", entry: [] });
  } catch (e) {
    thrown = e as FhirError;
  }
  assertEquals(thrown instanceof FhirError, true);
  assertEquals(thrown!.status, 400);
  assertEquals(thrown!.diagnostics.includes("is empty"), true);
});

Deno.test("parseCustomDefinitions: valid SD Bundle returns names including the resource type", () => {
  const bundle = makeCustomSdBundle("MyCustomResource");
  const { names, customDefs } = parseCustomDefinitions(bundle);
  assertEquals(names.includes("MyCustomResource"), true);
  assertEquals(customDefs.resourceTypeNames().includes("MyCustomResource"), true);
});

// ---------------------------------------------------------------------------
// createDataset WITH custom structure_definitions
// ---------------------------------------------------------------------------

Deno.test("createDataset with custom structure_definitions returns 201 and CREATE TABLE for custom resource", async () => {
  const state = makeState(); // empty registry — custom path doesn't need it

  const sdBundle = makeCustomSdBundle("MyReport");
  const sqlLog: string[] = [];
  const conn = makeFakeConn((sql) => {
    sqlLog.push(sql);
    return [];
  });

  const res = await createDataset(
    { id: "custom-ds", name: "Custom Dataset", structure_definitions: sdBundle },
    conn,
    state,
  );
  assertEquals(res.status, 201);

  const body = await res.json();
  assertEquals(body.id, "custom-ds");
  assertEquals(body.status, "active");
  assertEquals(Array.isArray(body.resource_types), true);
  assertEquals(body.resource_types.includes("MyReport"), true);

  // The captured SQLs must include a CREATE TABLE for the custom resource (lowercased table name)
  const hasCreateTable = sqlLog.some(
    (s) => s.includes("CREATE TABLE") && s.toLowerCase().includes("myreport"),
  );
  assertEquals(
    hasCreateTable,
    true,
    `Expected CREATE TABLE for myreport in: ${sqlLog.join(" | ")}`,
  );

  // Must also include CREATE SCHEMA
  const hasCreateSchema = sqlLog.some((s) => s.includes("CREATE SCHEMA") && s.includes("custom_ds"));
  assertEquals(hasCreateSchema, true, `Expected CREATE SCHEMA for custom_ds`);
});

// ---------------------------------------------------------------------------
// updateDataset tests
// ---------------------------------------------------------------------------

Deno.test("updateDataset: missing dataset returns 404", async () => {
  const state = makeState();
  const conn = makeFakeConn(() => []); // empty rows = dataset not found

  await assertRejects(
    () => updateDataset("ghost-ds", { structure_definitions: makeCustomSdBundle("X") }, conn, state),
    FhirError,
    "not found",
  );
});

Deno.test("updateDataset: missing structure_definitions field throws 400", async () => {
  const state = makeState();
  const conn = makeFakeConn((sql) => {
    // Return a row for the exists check
    if (sql.includes("_datasets")) return [{ id: "ds1" }];
    return [];
  });

  await assertRejects(
    () => updateDataset("ds1", {}, conn, state),
    FhirError,
    "Missing 'structure_definitions'",
  );
});

Deno.test("updateDataset happy path: 200 with list_concat UPDATE", async () => {
  const state = makeState();
  const sdBundle = makeCustomSdBundle("NewType");
  const sqlLog: string[] = [];

  const conn = makeFakeConn((sql) => {
    sqlLog.push(sql);
    // dataset exists check
    if (sql.includes("_datasets") && sql.includes("SELECT")) return [{ id: "ds1" }];
    return [];
  });

  const res = await updateDataset("ds1", { structure_definitions: sdBundle }, conn, state);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.id, "ds1");
  assertEquals(Array.isArray(body.added_types), true);
  assertEquals(body.added_types.includes("NewType"), true);
  assertEquals(body.skipped, 0);

  // Should have issued the list_concat UPDATE
  const hasUpdate = sqlLog.some(
    (s) => s.includes("list_concat") && s.includes("resource_types"),
  );
  assertEquals(hasUpdate, true, `Expected list_concat UPDATE in: ${sqlLog.join(" | ")}`);
});
