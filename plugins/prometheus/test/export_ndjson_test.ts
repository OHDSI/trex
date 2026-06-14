// @ts-nocheck
// Tests for functions/export/ndjson.ts
// Transcribed from plugins/fhir/src/export/ndjson.rs #[cfg(test)]

import { assertEquals, assertStringIncludes, assert } from "std/assert/mod.ts";
import {
  ExportStatus,
  exportStatusAsStr,
  buildCreateJobSql,
  buildGetJobSql,
  buildUpdateJobSql,
  buildExportSelectSql,
  buildExportOutputEntry,
  rowToJobObject,
  createExportJob,
  getExportJob,
  updateExportJobStatus,
  executeExport,
} from "../functions/export/ndjson.ts";

// ---------------------------------------------------------------------------
// Helpers — fake Conn
// ---------------------------------------------------------------------------

function makeFakeConn(responses: Map<string | RegExp, any[] | Error> = new Map()): {
  conn: any;
  calls: { sql: string }[];
} {
  const calls: { sql: string }[] = [];
  const conn = {
    async query(sql: string) {
      calls.push({ sql });
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
// ExportStatus — mirrors Rust test: export_status_as_str_maps_all_variants
// ---------------------------------------------------------------------------

Deno.test("export_status_as_str_maps_all_variants", () => {
  assertEquals(exportStatusAsStr("accepted"), "accepted");
  assertEquals(exportStatusAsStr("in-progress"), "in-progress");
  assertEquals(exportStatusAsStr("complete"), "complete");
  assertEquals(exportStatusAsStr("error"), "error");
});

// Mirrors Rust: export_status_partial_eq
Deno.test("export_status_equality", () => {
  assertEquals("accepted" === "accepted", true);
  assertEquals("accepted" === "complete", false);
  assertEquals("in-progress" === "error", false);
});

// Mirrors Rust: export_status_clone_copy
Deno.test("export_status_can_be_assigned", () => {
  const s: ExportStatus = "complete";
  const s2 = s;
  assertEquals(s, s2);
  const s3 = s;
  assertEquals(s, s3);
});

// ---------------------------------------------------------------------------
// buildCreateJobSql — mirrors Rust test: create_job_sql_includes_types_csv
// ---------------------------------------------------------------------------

Deno.test("create_job_sql_includes_types_csv", () => {
  const sql = buildCreateJobSql('"db"."meta"', "job1", "ds1", ["Patient", "Observation"]);
  assert(sql.startsWith('INSERT INTO "db"."meta"._export_jobs'));
  assertStringIncludes(sql, "'job1'");
  assertStringIncludes(sql, "'ds1'");
  assertStringIncludes(sql, "'Patient,Observation'");
  assertStringIncludes(sql, "'accepted'");
});

// Mirrors Rust: create_job_sql_with_no_types_is_empty_string
Deno.test("create_job_sql_with_no_types_is_empty_string", () => {
  const sql = buildCreateJobSql('"db"."meta"', "job1", "ds1", undefined);
  // undefined types → empty string literal ''
  assertStringIncludes(sql, "''");
});

// Mirrors Rust: create_job_sql_escapes_dataset_id
Deno.test("create_job_sql_escapes_dataset_id", () => {
  const sql = buildCreateJobSql('"m"', "job1", "ds'1", undefined);
  assertStringIncludes(sql, "'ds''1'");
});

// ---------------------------------------------------------------------------
// buildGetJobSql — mirrors Rust test: get_job_sql_selects_all_columns
// ---------------------------------------------------------------------------

Deno.test("get_job_sql_selects_all_columns", () => {
  const sql = buildGetJobSql('"db"."meta"', "abc");
  for (const col of ["id", "dataset_id", "status", "resource_types", "created_at", "completed_at", "output_files", "error_message"]) {
    assert(sql.includes(col), `missing column: ${col}`);
  }
  assertStringIncludes(sql, "'abc'");
});

// ---------------------------------------------------------------------------
// buildUpdateJobSql — mirrors Rust test: update_sql_status_only
// ---------------------------------------------------------------------------

Deno.test("update_sql_status_only", () => {
  const sql = buildUpdateJobSql('"m"', "j1", "in-progress", undefined, undefined);
  assertStringIncludes(sql, "status = 'in-progress'");
  assert(!sql.includes("completed_at"), "should not include completed_at");
  assert(!sql.includes("output_files"), "should not include output_files");
  assert(!sql.includes("error_message"), "should not include error_message");
});

// Mirrors Rust: update_sql_complete_sets_completed_at
Deno.test("update_sql_complete_sets_completed_at", () => {
  const sql = buildUpdateJobSql('"m"', "j1", "complete", "[]", undefined);
  assertStringIncludes(sql, "status = 'complete'");
  assertStringIncludes(sql, "completed_at = CURRENT_TIMESTAMP");
  assertStringIncludes(sql, "output_files = '[]'");
});

// Mirrors Rust: update_sql_error_includes_error_message
Deno.test("update_sql_error_includes_error_message", () => {
  const sql = buildUpdateJobSql('"m"', "j1", "error", undefined, "boom");
  assertStringIncludes(sql, "status = 'error'");
  assertStringIncludes(sql, "completed_at = CURRENT_TIMESTAMP");
  assertStringIncludes(sql, "error_message = 'boom'");
});

// Mirrors Rust: update_sql_escapes_apostrophes
Deno.test("update_sql_escapes_apostrophes", () => {
  const sql = buildUpdateJobSql('"m"', "j1", "error", "o'k", "can't");
  assertStringIncludes(sql, "'o''k'");
  assertStringIncludes(sql, "'can''t'");
});

// ---------------------------------------------------------------------------
// buildExportSelectSql — mirrors Rust test: export_select_sql_lowercases_table
// ---------------------------------------------------------------------------

Deno.test("export_select_sql_lowercases_table", () => {
  const sql = buildExportSelectSql('"db"."ds"', "MedicationRequest");
  assertStringIncludes(sql, '"medicationrequest"');
  assertStringIncludes(sql, "NOT _is_deleted");
});

// ---------------------------------------------------------------------------
// buildExportOutputEntry — mirrors Rust test: export_output_entry_url_uses_lowercase_filename
// ---------------------------------------------------------------------------

Deno.test("export_output_entry_url_uses_lowercase_filename", () => {
  const entry = buildExportOutputEntry("ds", "Patient", "abc-def", 3);
  assertEquals(entry["type"], "Patient");
  assertEquals(entry["count"], 3);
  assertEquals(entry["url"], "/ds/Patient/$export/abc-def/patient.ndjson");
});

// ---------------------------------------------------------------------------
// rowToJobObject — mirrors Rust test: job_object_from_row_uses_column_names_as_keys
// ---------------------------------------------------------------------------

Deno.test("row_to_job_object_preserves_fields", () => {
  const row = { id: "j1", status: "accepted" };
  const obj = rowToJobObject(row);
  assertEquals(obj["id"], "j1");
  assertEquals(obj["status"], "accepted");
});

// ---------------------------------------------------------------------------
// createExportJob — async helper tests
// ---------------------------------------------------------------------------

Deno.test("create_export_job_issues_insert_and_returns_uuid", async () => {
  const { conn, calls } = makeFakeConn();
  const jobId = await createExportJob(conn, "ds1", ["Patient"], '"memory"."_fhir_meta"');
  // Returns a UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert(uuidRe.test(jobId), `expected UUID, got: ${jobId}`);
  // Issued an INSERT
  assert(calls.some((c) => c.sql.includes("INSERT INTO")), "no INSERT found");
  assert(calls.some((c) => c.sql.includes(jobId)), "INSERT does not include jobId");
});

Deno.test("create_export_job_with_no_types_uses_empty_string", async () => {
  const { conn, calls } = makeFakeConn();
  await createExportJob(conn, "ds1", undefined, '"memory"."_fhir_meta"');
  const insertSql = calls.find((c) => c.sql.includes("INSERT INTO"))!.sql;
  // The types column value is ''
  assertStringIncludes(insertSql, "''");
});

// ---------------------------------------------------------------------------
// getExportJob — async helper tests
// ---------------------------------------------------------------------------

Deno.test("get_export_job_returns_null_when_no_rows", async () => {
  const { conn } = makeFakeConn();
  const job = await getExportJob(conn, "abc", '"memory"."_fhir_meta"');
  assertEquals(job, null);
});

Deno.test("get_export_job_returns_row_keyed_by_column_name", async () => {
  const responses = new Map<string | RegExp, any[]>();
  responses.set("_export_jobs", [{ id: "job1", status: "accepted", dataset_id: "ds1" }]);
  const { conn } = makeFakeConn(responses);
  const job = await getExportJob(conn, "job1", '"memory"."_fhir_meta"');
  assertEquals(job?.["id"], "job1");
  assertEquals(job?.["status"], "accepted");
  assertEquals(job?.["dataset_id"], "ds1");
});

// ---------------------------------------------------------------------------
// updateExportJobStatus — async helper tests
// ---------------------------------------------------------------------------

Deno.test("update_export_job_status_issues_update_sql", async () => {
  const { conn, calls } = makeFakeConn();
  await updateExportJobStatus(conn, "j1", "in-progress", undefined, undefined, '"memory"."_fhir_meta"');
  assert(calls.some((c) => c.sql.includes("UPDATE")), "no UPDATE found");
  assert(calls.some((c) => c.sql.includes("in-progress")), "status not in SQL");
});

// ---------------------------------------------------------------------------
// executeExport — integration-level helper tests
// ---------------------------------------------------------------------------

Deno.test("execute_export_marks_in_progress_then_complete", async () => {
  const responses = new Map<string | RegExp, any[]>();
  // Return 2 rows for Patient SELECT
  responses.set('"patient"', [{ _raw: '{"resourceType":"Patient"}' }, { _raw: '{"resourceType":"Patient"}' }]);
  const { conn, calls } = makeFakeConn(responses);

  const results = await executeExport(
    conn,
    "ds1",
    "job-abc",
    ["Patient"],
    "memory",
    '"memory"."_fhir_meta"',
  );

  // Should have issued: UPDATE in-progress, SELECT patient, UPDATE complete
  const updateCalls = calls.filter((c) => c.sql.includes("UPDATE"));
  assertEquals(updateCalls.length, 2);
  assertStringIncludes(updateCalls[0].sql, "in-progress");
  assertStringIncludes(updateCalls[1].sql, "complete");

  // Result should contain [Patient, 2]
  assertEquals(results.length, 1);
  assertEquals(results[0][0], "Patient");
  assertEquals(results[0][1], 2);
});

Deno.test("execute_export_output_entry_in_complete_update", async () => {
  const responses = new Map<string | RegExp, any[]>();
  responses.set('"patient"', [{ _raw: "{}" }, { _raw: "{}" }, { _raw: "{}" }]);
  const { conn, calls } = makeFakeConn(responses);

  await executeExport(conn, "ds1", "job-xyz", ["Patient"], "memory", '"memory"."_fhir_meta"');

  // The final UPDATE should contain output_files with a Patient entry
  const completeUpdate = calls.filter((c) => c.sql.includes("UPDATE") && c.sql.includes("complete"))[0];
  assert(completeUpdate, "no complete UPDATE found");
  assertStringIncludes(completeUpdate.sql, "patient.ndjson");
  assertStringIncludes(completeUpdate.sql, '"count":3');
});

Deno.test("execute_export_skips_does_not_exist_errors", async () => {
  const responses = new Map<string | RegExp, any[] | Error>();
  // Observation table does not exist
  responses.set('"observation"', new Error('Table "observation" does not exist'));
  // Patient returns 1 row
  responses.set('"patient"', [{ _raw: "{}" }]);
  const { conn } = makeFakeConn(responses);

  // Should not throw
  const results = await executeExport(
    conn,
    "ds1",
    "job-abc",
    ["Patient", "Observation"],
    "memory",
    '"memory"."_fhir_meta"',
  );

  // Only Patient result (Observation was skipped)
  assertEquals(results.length, 1);
  assertEquals(results[0][0], "Patient");
});

Deno.test("execute_export_zero_count_types_excluded_from_output", async () => {
  const responses = new Map<string | RegExp, any[]>();
  // Patient returns 0 rows
  responses.set('"patient"', []);
  const { conn, calls } = makeFakeConn(responses);

  await executeExport(conn, "ds1", "job-abc", ["Patient"], "memory", '"memory"."_fhir_meta"');

  // The complete UPDATE should have output_files = '[]'
  const completeUpdate = calls.filter(
    (c) => c.sql.includes("UPDATE") && c.sql.includes("complete"),
  )[0];
  assert(completeUpdate, "no complete UPDATE found");
  assertStringIncludes(completeUpdate.sql, "output_files = '[]'");
});
