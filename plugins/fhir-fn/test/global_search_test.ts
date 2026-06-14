import { assertEquals } from "std/assert/mod.ts";
import { parseRoute } from "../functions/router.ts";
import { buildGlobalSearchSql } from "../functions/handlers/global_search.ts";

// ---------------------------------------------------------------------------
// Route parsing
// ---------------------------------------------------------------------------

Deno.test("GET /{ds}/$global-search → globalSearch route", () => {
  assertEquals(parseRoute("GET", "/ds1/$global-search"), { kind: "globalSearch", datasetId: "ds1" });
});

Deno.test("POST /{ds}/$global-search → notFound", () => {
  assertEquals(parseRoute("POST", "/ds1/$global-search"), { kind: "notFound" });
});

Deno.test("DELETE /{ds}/$global-search → notFound", () => {
  assertEquals(parseRoute("DELETE", "/ds1/$global-search"), { kind: "notFound" });
});

Deno.test("GET /{ds}/$global-search with hyphenated dataset id", () => {
  assertEquals(parseRoute("GET", "/my-dataset/$global-search"), { kind: "globalSearch", datasetId: "my-dataset" });
});

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

Deno.test("buildGlobalSearchSql contains ILIKE filter on _raw", () => {
  const sql = buildGlobalSearchSql('"memory"."ds1"', "patient", "Müller");
  assertEquals(sql.includes("ILIKE"), true);
  assertEquals(sql.includes("Müller"), true);
  assertEquals(sql.includes('"patient"'), true);
  assertEquals(sql.includes("_is_deleted = false"), true);
  assertEquals(sql.includes("LIMIT 20"), true);
});

Deno.test("buildGlobalSearchSql escapes single-quotes in search term", () => {
  const sql = buildGlobalSearchSql('"memory"."ds1"', "patient", "O'Brien");
  // Single-quote in O'Brien must be doubled → O''Brien
  assertEquals(sql.includes("O''Brien"), true);
  assertEquals(sql.includes("O'Brien"), false);
});

Deno.test("buildGlobalSearchSql uses provided schema and table", () => {
  const sql = buildGlobalSearchSql('"mydb"."my_schema"', "observation", "test");
  assertEquals(sql.includes('"mydb"."my_schema"'), true);
  assertEquals(sql.includes('"observation"'), true);
});
