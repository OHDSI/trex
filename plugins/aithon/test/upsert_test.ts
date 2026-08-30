// @ts-nocheck
// Tests for functions/handlers/upsert.ts
// Transcribed from plugins/fhir/src/handlers/upsert.rs #[cfg(test)]

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import {
  stampUpsertMeta,
  buildUpsertHistorySql,
  UpsertResult,
  upsertResource,
} from "../functions/handlers/upsert.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers: minimal AppState + fake Conn
// ---------------------------------------------------------------------------

function makeState(knownTypes: string[] = ["Patient", "Observation"]) {
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
// Pure-function tests — transcribed from upsert.rs #[cfg(test)]
// ---------------------------------------------------------------------------

Deno.test("stamp_upsert_meta_sets_fields", () => {
  const r: any = { resourceType: "Patient" };
  stampUpsertMeta(r, "x", 3, "2026-05-23T10:00:00Z");
  assertEquals(r.id, "x");
  assertEquals(r.meta.versionId, "3");
  assertEquals(r.meta.lastUpdated, "2026-05-23T10:00:00Z");
});

Deno.test("stamp_upsert_meta_overwrites_existing", () => {
  const r: any = { id: "old", meta: { versionId: "99" } };
  stampUpsertMeta(r, "new", 1, "now");
  assertEquals(r.id, "new");
  assertEquals(r.meta.versionId, "1");
});

Deno.test("stamp_upsert_meta_noop_on_non_object", () => {
  // A non-object value should be left unchanged.
  // In TypeScript we test with a string held as `any`.
  let r: any = "string";
  // stampUpsertMeta only acts on plain objects; passing a primitive has no effect.
  // We call via a wrapper object so we can observe no mutation.
  const original = r;
  // The function requires a mutable reference — pass a boxed wrapper approach:
  // Since JS strings are primitives and the function checks typeof === "object",
  // we verify the guard by ensuring a non-object argument causes no throw and
  // leaves the value unchanged when held in a container.
  const container = { value: "string" };
  // Call with the string directly to confirm no exception.
  stampUpsertMeta("string" as any, "x", 1, "now");
  assertEquals(r, original); // r is unchanged
  // Also verify a null input is a no-op.
  stampUpsertMeta(null as any, "x", 1, "now");
  // Array is also not a plain object.
  const arr: any = [1, 2, 3];
  stampUpsertMeta(arr, "x", 1, "now");
  assertEquals(arr, [1, 2, 3]);
});

Deno.test("upsert_history_sql_embeds_current_version", () => {
  const sql = buildUpsertHistorySql('"db"."ds"', 7);
  assertStringIncludes(sql, '"db"."ds"._history');
  assertStringIncludes(sql, ", 7, ");
  assertStringIncludes(sql, "$1");
  assertStringIncludes(sql, "$2");
  assertStringIncludes(sql, "$3");
  assertStringIncludes(sql, "_is_deleted");
});

Deno.test("upsert_result_holds_version_and_is_new", () => {
  const r: UpsertResult = { version: 5, isNew: true };
  assertEquals(r.version, 5);
  assertEquals(r.isNew, true);
});

// ---------------------------------------------------------------------------
// upsertResource integration tests (fake Conn)
// ---------------------------------------------------------------------------

Deno.test("upsertResource_insert_new_resource", async () => {
  // No existing row → should INSERT (not write history), version=1, isNew=true
  const { conn, calls } = makeFakeConn();
  const state = makeState();
  const now = "2026-06-12T10:00:00Z";

  const result = await upsertResource(
    conn,
    state,
    '"db"."ds"',
    "Patient",
    "p1",
    { resourceType: "Patient" },
    now,
  );

  assertEquals(result.version, 1);
  assertEquals(result.isNew, true);

  // Should have: SELECT check, then INSERT (no history)
  assertEquals(calls.length, 2);
  assertStringIncludes(calls[0].sql, "SELECT _version_id");
  assertStringIncludes(calls[1].sql, "INSERT INTO");
  // No history write
  const historyCalls = calls.filter((c) => c.sql.includes("_history"));
  assertEquals(historyCalls.length, 0);
});

Deno.test("upsertResource_update_existing_resource", async () => {
  // Existing row → should write history, then UPDATE, version=4, isNew=false
  const responses = new Map<string | RegExp, any[]>();
  responses.set("SELECT _version_id", [{ _version_id: "3", _raw: '{"id":"p1"}' }]);

  const { conn, calls } = makeFakeConn(responses);
  const state = makeState();
  const now = "2026-06-12T10:00:00Z";

  const result = await upsertResource(
    conn,
    state,
    '"db"."ds"',
    "Patient",
    "p1",
    { resourceType: "Patient", id: "p1" },
    now,
  );

  assertEquals(result.version, 4);
  assertEquals(result.isNew, false);

  // Should have: SELECT check, history INSERT, UPDATE
  assertEquals(calls.length, 3);
  assertStringIncludes(calls[0].sql, "SELECT _version_id");
  assertStringIncludes(calls[1].sql, "_history");
  assertStringIncludes(calls[2].sql, "UPDATE");
});

Deno.test("upsertResource_stamps_meta_on_resource", async () => {
  // Verify the resource body passed to INSERT has meta stamped
  let capturedRawJson: string | undefined;
  const conn = {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes("INSERT INTO") && !sql.includes("_history")) {
        capturedRawJson = params[1] as string;
      }
      return [];
    },
  };
  const state = makeState();
  const now = "2026-06-12T12:00:00Z";

  await upsertResource(conn, state, '"db"."ds"', "Patient", "p99", { resourceType: "Patient" }, now);

  const parsed = JSON.parse(capturedRawJson!);
  assertEquals(parsed.id, "p99");
  assertEquals(parsed.meta.versionId, "1");
  assertEquals(parsed.meta.lastUpdated, now);
});
