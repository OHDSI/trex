// @ts-nocheck
// Tests for functions/handlers/export.ts
// Transcribed from plugins/fhir/src/handlers/export.rs #[cfg(test)]

import { assertEquals, assertStringIncludes, assert } from "std/assert/mod.ts";
import {
  parseExportTypes,
  buildStatusResponse,
  systemExport,
  typeExport,
  exportStatus,
} from "../functions/handlers/export.ts";
import { FhirError } from "../functions/error.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers — fake registry, fake conn, fake state
// ---------------------------------------------------------------------------

function makeRegistry(knownTypes: string[] = ["Patient", "Observation", "Condition"]) {
  return {
    isKnownResourceType(rt: string): boolean {
      return knownTypes.includes(rt);
    },
    resourceTypeNames(): string[] {
      return [...knownTypes];
    },
  };
}

function makeState(knownTypes: string[] = ["Patient", "Observation", "Condition"]) {
  const registry = makeRegistry(knownTypes);
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );
  return { registry, searchParams, dbName: "memory" };
}

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
// parseExportTypes — mirrors Rust parse_export_types_* tests
// ---------------------------------------------------------------------------

// Mirrors Rust: parse_export_types_returns_all_when_absent
Deno.test("parse_export_types_returns_all_when_absent", () => {
  const registry = makeRegistry(["Patient", "Observation"]);
  const params = {};
  const types = parseExportTypes(params, registry);
  assert(types.includes("Patient"), "should include Patient");
  assert(types.includes("Observation"), "should include Observation");
  assertEquals(types.length, 2);
});

// Mirrors Rust: parse_export_types_parses_comma_separated
Deno.test("parse_export_types_parses_comma_separated", () => {
  const registry = makeRegistry(["Patient", "Observation"]);
  const params = { _type: "Patient, Observation" };
  const types = parseExportTypes(params, registry);
  assertEquals(types, ["Patient", "Observation"]);
});

// Mirrors Rust: parse_export_types_rejects_unknown
Deno.test("parse_export_types_rejects_unknown", () => {
  const registry = makeRegistry(["Patient"]);
  const params = { _type: "Patient,Nonsense" };
  let threw = false;
  try {
    parseExportTypes(params, registry);
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError, "should throw FhirError");
    assertEquals(e.code, "invalid");
  }
  assert(threw, "should have thrown");
});

Deno.test("parse_export_types_single_type_in_list", () => {
  const registry = makeRegistry(["Patient", "Observation"]);
  const params = { _type: "Patient" };
  const types = parseExportTypes(params, registry);
  assertEquals(types, ["Patient"]);
});

// ---------------------------------------------------------------------------
// buildStatusResponse — mirrors Rust status_response_* tests
// ---------------------------------------------------------------------------

// Mirrors Rust: status_response_accepted
Deno.test("status_response_accepted", () => {
  const job = { status: "accepted" };
  const [code, body] = buildStatusResponse(job, "ds", "abc");
  assertEquals(code, 202);
  assertEquals(body["status"], "accepted");
  assertEquals(body["jobId"], "abc");
});

// Mirrors Rust: status_response_in_progress
Deno.test("status_response_in_progress", () => {
  const job = { status: "in-progress" };
  const [code, body] = buildStatusResponse(job, "ds", "abc");
  assertEquals(code, 202);
  assertEquals(body["status"], "in-progress");
  assertEquals(body["jobId"], "abc");
});

// Mirrors Rust: status_response_complete_includes_output
Deno.test("status_response_complete_includes_output", () => {
  const job = {
    status: "complete",
    completed_at: "2026-05-23T00:00:00Z",
    output_files: '[{"type":"Patient","url":"/foo.ndjson","count":3}]',
  };
  const [code, body] = buildStatusResponse(job, "ds", "abc");
  assertEquals(code, 200);
  assertEquals(body["transactionTime"], "2026-05-23T00:00:00Z");
  assertEquals(body["requiresAccessToken"], false);
  assertEquals(body["request"], "/ds/$export");
  assertEquals((body["output"] as any[])[0]["type"], "Patient");
});

// Mirrors Rust: status_response_complete_empty_output
Deno.test("status_response_complete_empty_output", () => {
  const job = { status: "complete" };
  const [_code, body] = buildStatusResponse(job, "ds", "abc");
  assert(Array.isArray(body["output"]), "output should be array");
  assertEquals((body["output"] as any[]).length, 0);
});

// Mirrors Rust: status_response_error_returns_internal
Deno.test("status_response_error_throws_fhir_internal", () => {
  const job = { status: "error", error_message: "boom" };
  let threw = false;
  try {
    buildStatusResponse(job, "ds", "abc");
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError, "should throw FhirError");
    assertEquals(e.code, "exception");
  }
  assert(threw, "should have thrown");
});

// Mirrors Rust: status_response_unknown_returns_internal
Deno.test("status_response_unknown_throws_fhir_internal", () => {
  const job = { status: "wat" };
  let threw = false;
  try {
    buildStatusResponse(job, "ds", "abc");
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError, "should throw FhirError");
    assertEquals(e.code, "exception");
  }
  assert(threw, "should have thrown");
});

// ---------------------------------------------------------------------------
// systemExport handler — integration tests with fake Conn
// ---------------------------------------------------------------------------

Deno.test("system_export_returns_202_with_content_location", async () => {
  const { conn, calls } = makeFakeConn();
  const state = makeState(["Patient"]);

  const res = await systemExport("ds1", {}, conn, state);

  assertEquals(res.status, 202);
  const location = res.headers.get("Content-Location");
  assert(location !== null, "Content-Location header should be set");
  assert(location.startsWith("/ds1/$export/status/"), `unexpected location: ${location}`);
});

Deno.test("system_export_body_has_status_accepted_and_jobId", async () => {
  const { conn } = makeFakeConn();
  const state = makeState(["Patient"]);

  const res = await systemExport("ds1", {}, conn, state);
  const body = await res.json();
  assertEquals(body.status, "accepted");
  assert(typeof body.jobId === "string", "jobId should be a string");
  assertEquals(body.jobId.length, 36); // UUID
});

Deno.test("system_export_creates_job_then_executes_inline", async () => {
  const responses = new Map<string | RegExp, any[]>();
  // Return 2 Patient rows
  responses.set('"patient"', [{ _raw: "{}" }, { _raw: "{}" }]);
  const { conn, calls } = makeFakeConn(responses);
  const state = makeState(["Patient"]);

  await systemExport("ds1", {}, conn, state);

  // Should have: INSERT (create job), UPDATE in-progress, SELECT patient, UPDATE complete
  assert(calls.some((c) => c.sql.includes("INSERT INTO")), "should INSERT job");
  const updates = calls.filter((c) => c.sql.includes("UPDATE"));
  assertEquals(updates.length, 2, "should have 2 UPDATEs: in-progress + complete");
  assertStringIncludes(updates[0].sql, "in-progress");
  assertStringIncludes(updates[1].sql, "complete");
});

Deno.test("system_export_with_type_filter_only_exports_filtered_types", async () => {
  const responses = new Map<string | RegExp, any[]>();
  responses.set('"patient"', [{ _raw: "{}" }]);
  const { conn, calls } = makeFakeConn(responses);
  const state = makeState(["Patient", "Observation"]);

  await systemExport("ds1", { _type: "Patient" }, conn, state);

  // Should only SELECT patient, not observation
  assert(calls.some((c) => c.sql.includes('"patient"')), "should SELECT patient");
  assert(!calls.some((c) => c.sql.includes('"observation"')), "should not SELECT observation");
});

Deno.test("system_export_invalid_dataset_id_throws_bad_request", async () => {
  const { conn } = makeFakeConn();
  const state = makeState();

  let threw = false;
  try {
    await systemExport("bad id!", {}, conn, state);
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError);
    assertEquals(e.code, "invalid");
  }
  assert(threw);
});

// ---------------------------------------------------------------------------
// typeExport handler — integration tests with fake Conn
// ---------------------------------------------------------------------------

Deno.test("type_export_returns_202_with_content_location", async () => {
  const responses = new Map<string | RegExp, any[]>();
  responses.set('"patient"', [{ _raw: "{}" }]);
  const { conn } = makeFakeConn(responses);
  const state = makeState(["Patient"]);

  const res = await typeExport("ds1", "Patient", conn, state);
  assertEquals(res.status, 202);
  const location = res.headers.get("Content-Location");
  assert(location?.startsWith("/ds1/$export/status/"), `unexpected location: ${location}`);
});

Deno.test("type_export_only_exports_the_requested_type", async () => {
  const responses = new Map<string | RegExp, any[]>();
  responses.set('"observation"', [{ _raw: "{}" }, { _raw: "{}" }]);
  const { conn, calls } = makeFakeConn(responses);
  const state = makeState(["Patient", "Observation"]);

  await typeExport("ds1", "Observation", conn, state);

  assert(calls.some((c) => c.sql.includes('"observation"')), "should SELECT observation");
  assert(!calls.some((c) => c.sql.includes('"patient"')), "should not SELECT patient");
});

Deno.test("type_export_unknown_resource_type_throws_bad_request", async () => {
  const { conn } = makeFakeConn();
  const state = makeState(["Patient"]);

  let threw = false;
  try {
    await typeExport("ds1", "Unknown", conn, state);
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError);
    assertEquals(e.code, "invalid");
  }
  assert(threw);
});

// ---------------------------------------------------------------------------
// exportStatus handler — integration tests with fake Conn
// ---------------------------------------------------------------------------

Deno.test("export_status_returns_404_when_job_not_found", async () => {
  const { conn } = makeFakeConn(); // returns [] by default
  const state = makeState();

  let threw = false;
  try {
    await exportStatus("ds1", "00000000-0000-0000-0000-000000000001", conn, state);
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError);
    assertEquals(e.code, "not-found");
  }
  assert(threw);
});

Deno.test("export_status_complete_job_returns_200_with_output", async () => {
  const jobRow = {
    id: "job-1",
    status: "complete",
    dataset_id: "ds1",
    completed_at: "2026-05-23T00:00:00Z",
    output_files: '[{"type":"Patient","url":"/ds1/Patient/$export/job-1/patient.ndjson","count":5}]',
  };
  const responses = new Map<string | RegExp, any[]>();
  responses.set("_export_jobs", [jobRow]);
  const { conn } = makeFakeConn(responses);
  const state = makeState();

  const res = await exportStatus("ds1", "job-1", conn, state);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body["transactionTime"], "2026-05-23T00:00:00Z");
  assertEquals(body["request"], "/ds1/$export");
  assertEquals(body["requiresAccessToken"], false);
  assertEquals((body["output"] as any[])[0]["type"], "Patient");
  assertEquals((body["output"] as any[])[0]["count"], 5);
});

Deno.test("export_status_accepted_job_returns_202", async () => {
  const jobRow = { id: "job-2", status: "accepted", dataset_id: "ds1" };
  const responses = new Map<string | RegExp, any[]>();
  responses.set("_export_jobs", [jobRow]);
  const { conn } = makeFakeConn(responses);
  const state = makeState();

  const res = await exportStatus("ds1", "job-2", conn, state);
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body["status"], "accepted");
  assertEquals(body["jobId"], "job-2");
});

Deno.test("export_status_in_progress_job_returns_202", async () => {
  const jobRow = { id: "job-3", status: "in-progress", dataset_id: "ds1" };
  const responses = new Map<string | RegExp, any[]>();
  responses.set("_export_jobs", [jobRow]);
  const { conn } = makeFakeConn(responses);
  const state = makeState();

  const res = await exportStatus("ds1", "job-3", conn, state);
  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body["status"], "in-progress");
});

Deno.test("export_status_error_job_throws_fhir_internal", async () => {
  const jobRow = { id: "job-4", status: "error", error_message: "disk full" };
  const responses = new Map<string | RegExp, any[]>();
  responses.set("_export_jobs", [jobRow]);
  const { conn } = makeFakeConn(responses);
  const state = makeState();

  let threw = false;
  try {
    await exportStatus("ds1", "job-4", conn, state);
  } catch (e) {
    threw = true;
    assert(e instanceof FhirError);
    assertEquals(e.code, "exception");
  }
  assert(threw);
});

Deno.test("export_status_complete_with_no_output_returns_empty_array", async () => {
  const jobRow = { id: "job-5", status: "complete", dataset_id: "ds1", completed_at: "" };
  const responses = new Map<string | RegExp, any[]>();
  responses.set("_export_jobs", [jobRow]);
  const { conn } = makeFakeConn(responses);
  const state = makeState();

  const res = await exportStatus("ds1", "job-5", conn, state);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals((body["output"] as any[]).length, 0);
  assertEquals(body["error"], []);
});
