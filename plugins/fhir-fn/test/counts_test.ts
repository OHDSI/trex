import { assertEquals } from "std/assert/mod.ts";
import { parseRoute } from "../functions/router.ts";
import { buildListTablesSql, buildCountSql } from "../functions/handlers/counts.ts";

// ---------------------------------------------------------------------------
// Route parsing
// ---------------------------------------------------------------------------

Deno.test("GET /{ds}/$counts → counts route", () => {
  assertEquals(parseRoute("GET", "/ds1/$counts"), { kind: "counts", datasetId: "ds1" });
});

Deno.test("POST /{ds}/$counts → notFound", () => {
  assertEquals(parseRoute("POST", "/ds1/$counts"), { kind: "notFound" });
});

Deno.test("DELETE /{ds}/$counts → notFound", () => {
  assertEquals(parseRoute("DELETE", "/ds1/$counts"), { kind: "notFound" });
});

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

Deno.test("buildListTablesSql excludes _ prefixed tables", () => {
  const sql = buildListTablesSql("memory", "ds1");
  // Must filter to the right schema and exclude _ tables
  assertEquals(sql.includes("table_schema = 'ds1'"), true);
  assertEquals(sql.includes("NOT LIKE"), true);
  assertEquals(sql.includes("\\_%"), true);
});

Deno.test("buildListTablesSql converts hyphens to underscores in schema name", () => {
  const sql = buildListTablesSql("memory", "my-dataset");
  assertEquals(sql.includes("'my_dataset'"), true);
});

Deno.test("buildCountSql returns NOT _is_deleted filter", () => {
  const sql = buildCountSql('"memory"."ds1"', "patient");
  assertEquals(sql.includes('WHERE NOT _is_deleted'), true);
  assertEquals(sql.includes('"patient"'), true);
  assertEquals(sql.includes('"memory"."ds1"'), true);
});
