// @ts-nocheck
// Tests for functions/handlers/bundle.ts
// Transcribed from plugins/fhir/src/handlers/bundle.rs #[cfg(test)]
// Plus handler tests with a fake Conn capturing the SQL sequence.

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import {
  MAX_BUNDLE_ENTRIES,
  classifyBundle,
  buildPostResponseEntry,
  buildPutResponseEntry,
  buildDeleteResponseEntry,
  buildBatchErrorEntry,
  buildBundleResponse,
  buildDeleteCheckSql,
  buildBundleDeleteSql,
  stampPostResourceMeta,
  processBundle,
} from "../functions/handlers/bundle.ts";
import { FhirError } from "../functions/error.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers: minimal AppState + fake Conn
// ---------------------------------------------------------------------------

function makeState(knownTypes: string[] = ["Patient", "Observation", "Condition"]) {
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

/**
 * A fake Conn that records SQL calls and can return configurable rows OR throw errors.
 *
 * `responses`: Map of match key → rows (or Error to throw).
 * Default return: [].
 */
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
// classifyBundle — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("classify_rejects_non_bundle", () => {
  const v = { resourceType: "Patient" };
  let threw = false;
  try {
    classifyBundle(v);
  } catch (e) {
    threw = true;
    assertEquals(e instanceof FhirError, true);
    assertEquals(e.status, 400);
  }
  assertEquals(threw, true);
});

Deno.test("classify_rejects_unknown_bundle_type", () => {
  const v = { resourceType: "Bundle", type: "searchset" };
  let threw = false;
  try {
    classifyBundle(v);
  } catch (e) {
    threw = true;
    assertEquals(e instanceof FhirError, true);
    assertEquals(e.status, 400);
  }
  assertEquals(threw, true);
});

Deno.test("classify_accepts_transaction", () => {
  const v = { resourceType: "Bundle", type: "transaction" };
  assertEquals(classifyBundle(v), "transaction");
});

Deno.test("classify_accepts_batch", () => {
  const v = { resourceType: "Bundle", type: "batch" };
  assertEquals(classifyBundle(v), "batch");
});

// ---------------------------------------------------------------------------
// buildPostResponseEntry — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("post_response_entry_shape", () => {
  const e = buildPostResponseEntry("ds", "Patient", "abc");
  assertEquals(e.response.status, "201 Created");
  assertEquals(e.response.location, "/ds/Patient/abc");
  assertEquals(e.response.etag, 'W/"1"');
});

// ---------------------------------------------------------------------------
// buildPutResponseEntry — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("put_response_entry_new_is_201", () => {
  const e = buildPutResponseEntry("ds", "Patient", "abc", 1, true);
  assertEquals(e.response.status, "201 Created");
  assertEquals(e.response.etag, 'W/"1"');
});

Deno.test("put_response_entry_existing_is_200", () => {
  const e = buildPutResponseEntry("ds", "Patient", "abc", 3, false);
  assertEquals(e.response.status, "200 OK");
  assertEquals(e.response.etag, 'W/"3"');
  assertEquals(e.response.location, "/ds/Patient/abc");
});

// ---------------------------------------------------------------------------
// buildDeleteResponseEntry — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("delete_response_entry_is_204", () => {
  const e = buildDeleteResponseEntry();
  assertEquals(e.response.status, "204 No Content");
});

// ---------------------------------------------------------------------------
// buildBatchErrorEntry — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("batch_error_entry_wraps_operation_outcome", () => {
  const e = buildBatchErrorEntry("boom");
  assertEquals(e.response.status, "400 Bad Request");
  assertEquals(e.response.outcome.resourceType, "OperationOutcome");
  assertEquals(e.response.outcome.issue[0].severity, "error");
  assertEquals(e.response.outcome.issue[0].code, "processing");
  assertEquals(e.response.outcome.issue[0].diagnostics, "boom");
});

// ---------------------------------------------------------------------------
// buildBundleResponse — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("bundle_response_wraps_entries_with_type", () => {
  const entries = [{ a: 1 }, { b: 2 }];
  const bundle = buildBundleResponse(entries, "batch-response");
  assertEquals(bundle.resourceType, "Bundle");
  assertEquals(bundle.type, "batch-response");
  assertEquals(bundle.entry.length, 2);
});

Deno.test("bundle_response_empty_entries", () => {
  const bundle = buildBundleResponse([], "transaction-response");
  assertEquals(bundle.entry.length, 0);
});

// ---------------------------------------------------------------------------
// buildDeleteCheckSql — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("delete_check_sql_lowercases_table", () => {
  const sql = buildDeleteCheckSql('"db"."ds"', "MedicationRequest");
  assertStringIncludes(sql, '"medicationrequest"');
  assertStringIncludes(sql, "WHERE _id = $1");
  assertStringIncludes(sql, "NOT _is_deleted");
});

// ---------------------------------------------------------------------------
// buildBundleDeleteSql — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("bundle_delete_sql_sets_flags_and_version", () => {
  const sql = buildBundleDeleteSql('"db"."ds"', "Patient", 9);
  assertStringIncludes(sql, '"patient"');
  assertStringIncludes(sql, "_is_deleted = true");
  assertStringIncludes(sql, "_version_id = 9");
  assertStringIncludes(sql, "WHERE _id = $1");
});

// ---------------------------------------------------------------------------
// stampPostResourceMeta — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("stamp_post_resource_meta_sets_id_and_version_one", () => {
  const r: any = { resourceType: "Patient" };
  stampPostResourceMeta(r, "p1", "2026-05-23T10:00:00Z");
  assertEquals(r.id, "p1");
  assertEquals(r.meta.versionId, "1");
  assertEquals(r.meta.lastUpdated, "2026-05-23T10:00:00Z");
});

Deno.test("stamp_post_resource_meta_noop_on_non_object", () => {
  const r: any = "not-object";
  stampPostResourceMeta(r, "p1", "now");
  assertEquals(r, "not-object");
});

// ---------------------------------------------------------------------------
// MAX_BUNDLE_ENTRIES constant
// ---------------------------------------------------------------------------

Deno.test("MAX_BUNDLE_ENTRIES is 10000", () => {
  assertEquals(MAX_BUNDLE_ENTRIES, 10_000);
});

// ---------------------------------------------------------------------------
// Handler tests with fake Conn
// ---------------------------------------------------------------------------

Deno.test("transaction bundle with 2 POSTs: BEGIN … 2 INSERTs … COMMIT", async () => {
  const state = makeState(["Patient"]);

  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: { resourceType: "Patient", name: [{ family: "Smith" }] },
        request: { method: "POST", url: "Patient" },
      },
      {
        resource: { resourceType: "Patient", name: [{ family: "Jones" }] },
        request: { method: "POST", url: "Patient" },
      },
    ],
  };

  const { conn, calls } = makeFakeConn();
  const res = await processBundle("ds1", bundle, conn, state);

  // Status
  assertEquals(res.status, 200);

  // Response body is a transaction-response Bundle with 2 entries
  const body = await res.json();
  assertEquals(body.resourceType, "Bundle");
  assertEquals(body.type, "transaction-response");
  assertEquals(body.entry.length, 2);
  assertEquals(body.entry[0].response.status, "201 Created");
  assertEquals(body.entry[1].response.status, "201 Created");

  // SQL sequence: BEGIN TRANSACTION, then 2 INSERTs, then COMMIT
  const sqlList = calls.map((c) => c.sql);
  assertEquals(sqlList[0], "BEGIN TRANSACTION");
  assertEquals(sqlList[sqlList.length - 1], "COMMIT");

  // Both INSERTs happen between BEGIN and COMMIT
  const insertIndexes = sqlList
    .map((s, i) => (s.includes("INSERT INTO") ? i : -1))
    .filter((i) => i >= 0);
  assertEquals(insertIndexes.length, 2);
  assertEquals(insertIndexes[0] > 0, true);
  assertEquals(insertIndexes[1] < sqlList.length - 1, true);
});

Deno.test("transaction: error on 2nd entry → ROLLBACK, no COMMIT", async () => {
  const state = makeState(["Patient"]);

  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: { resourceType: "Patient", name: [{ family: "Smith" }] },
        request: { method: "POST", url: "Patient" },
      },
      {
        resource: { resourceType: "Patient", name: [{ family: "Jones" }] },
        request: { method: "POST", url: "Patient" },
      },
    ],
  };

  // Respond to the 2nd INSERT with an error by counting calls
  let insertCount = 0;
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO")) {
        insertCount++;
        if (insertCount === 2) {
          throw new Error("constraint violation");
        }
      }
      return [];
    },
  };

  let threw = false;
  let caughtErr: any;
  try {
    await processBundle("ds1", bundle, conn, state);
  } catch (e) {
    threw = true;
    caughtErr = e;
  }

  // Should throw a FhirError (400 bad request with transaction failure message)
  assertEquals(threw, true);
  assertEquals(caughtErr instanceof FhirError, true);
  assertEquals(caughtErr.status, 400);
  assertStringIncludes(caughtErr.diagnostics, "Transaction failed");

  // ROLLBACK must appear in the SQL sequence
  const sqlList = calls.map((c) => c.sql);
  assertEquals(sqlList.includes("ROLLBACK"), true);

  // COMMIT must NOT appear
  assertEquals(sqlList.includes("COMMIT"), false);
});

Deno.test("batch: one failing + one ok entry → batch-response; no BEGIN/COMMIT", async () => {
  const state = makeState(["Patient"]);

  const bundle = {
    resourceType: "Bundle",
    type: "batch",
    entry: [
      {
        // This entry will fail (simulated by the conn)
        resource: { resourceType: "Patient", name: [{ family: "Bad" }] },
        request: { method: "POST", url: "Patient" },
      },
      {
        // This entry will succeed
        resource: { resourceType: "Patient", name: [{ family: "Good" }] },
        request: { method: "POST", url: "Patient" },
      },
    ],
  };

  let insertCount = 0;
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO")) {
        insertCount++;
        if (insertCount === 1) {
          throw new Error("disk full");
        }
      }
      return [];
    },
  };

  const res = await processBundle("ds1", bundle, conn, state);

  // Status is still 200 for batch
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.resourceType, "Bundle");
  assertEquals(body.type, "batch-response");
  assertEquals(body.entry.length, 2);

  // First entry is a batch error (the one that failed)
  assertEquals(body.entry[0].response.status, "400 Bad Request");
  assertEquals(body.entry[0].response.outcome.resourceType, "OperationOutcome");
  assertStringIncludes(body.entry[0].response.outcome.issue[0].diagnostics, "disk full");

  // Second entry succeeded
  assertEquals(body.entry[1].response.status, "201 Created");

  // No BEGIN TRANSACTION or COMMIT/ROLLBACK in the SQL sequence
  const sqlList = calls.map((c) => c.sql);
  assertEquals(sqlList.includes("BEGIN TRANSACTION"), false);
  assertEquals(sqlList.includes("COMMIT"), false);
  assertEquals(sqlList.includes("ROLLBACK"), false);
});

Deno.test("transaction empty bundle returns 200 with empty entry array", async () => {
  const state = makeState();
  const bundle = { resourceType: "Bundle", type: "transaction", entry: [] };
  const { conn, calls } = makeFakeConn();
  const res = await processBundle("ds1", bundle, conn, state);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.type, "transaction-response");
  assertEquals(body.entry.length, 0);
  // No SQL executed for empty bundle
  assertEquals(calls.length, 0);
});

Deno.test("batch empty bundle returns 200 with empty entry array", async () => {
  const state = makeState();
  const bundle = { resourceType: "Bundle", type: "batch", entry: [] };
  const { conn, calls } = makeFakeConn();
  const res = await processBundle("ds1", bundle, conn, state);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.type, "batch-response");
  assertEquals(body.entry.length, 0);
  assertEquals(calls.length, 0);
});

Deno.test("invalid dataset id throws 400", async () => {
  const state = makeState();
  const bundle = { resourceType: "Bundle", type: "transaction", entry: [] };
  const { conn } = makeFakeConn();

  let threw = false;
  try {
    await processBundle("bad dataset!", bundle, conn, state);
  } catch (e) {
    threw = true;
    assertEquals(e instanceof FhirError, true);
    assertEquals(e.status, 400);
  }
  assertEquals(threw, true);
});

Deno.test("non-bundle body throws 400", async () => {
  const state = makeState();
  const { conn } = makeFakeConn();

  let threw = false;
  try {
    await processBundle("ds1", { resourceType: "Patient" }, conn, state);
  } catch (e) {
    threw = true;
    assertEquals(e instanceof FhirError, true);
    assertEquals(e.status, 400);
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// resourceType injection-prevention tests
// ---------------------------------------------------------------------------

Deno.test("transaction: malformed resourceType triggers ROLLBACK and error (no COMMIT)", async () => {
  const state = makeState(["Patient"]);

  // The entry has a resourceType that contains a double-quote, which would
  // allow SQL identifier injection if not validated.
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: { resourceType: 'Patient"; DROP TABLE patients; --', name: [] },
        request: { method: "POST", url: "Patient" },
      },
    ],
  };

  const { conn, calls } = makeFakeConn();
  let threw = false;
  let caughtErr: any;
  try {
    await processBundle("ds1", bundle, conn, state);
  } catch (e) {
    threw = true;
    caughtErr = e;
  }

  // Must throw a FhirError 400
  assertEquals(threw, true);
  assertEquals(caughtErr instanceof FhirError, true);
  assertEquals(caughtErr.status, 400);

  // ROLLBACK must have been issued
  const sqlList = calls.map((c) => c.sql);
  assertEquals(sqlList.includes("ROLLBACK"), true);

  // COMMIT must NOT have been issued
  assertEquals(sqlList.includes("COMMIT"), false);
});

Deno.test("batch: malformed-resourceType entry becomes batch-error; valid sibling succeeds", async () => {
  const state = makeState(["Patient"]);

  const bundle = {
    resourceType: "Bundle",
    type: "batch",
    entry: [
      {
        // Malformed resourceType — contains a double-quote
        resource: { resourceType: 'Patient"--', name: [] },
        request: { method: "POST", url: "Patient" },
      },
      {
        // Valid entry that should succeed
        resource: { resourceType: "Patient", name: [{ family: "Good" }] },
        request: { method: "POST", url: "Patient" },
      },
    ],
  };

  const { conn } = makeFakeConn();
  const res = await processBundle("ds1", bundle, conn, state);

  // Batch always returns 200
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.resourceType, "Bundle");
  assertEquals(body.type, "batch-response");
  assertEquals(body.entry.length, 2);

  // First entry is a batch-error wrapping the validation failure
  assertEquals(body.entry[0].response.status, "400 Bad Request");
  assertEquals(body.entry[0].response.outcome.resourceType, "OperationOutcome");
  assertStringIncludes(body.entry[0].response.outcome.issue[0].diagnostics, "Invalid resourceType");

  // Second entry succeeded (201 Created)
  assertEquals(body.entry[1].response.status, "201 Created");
});
