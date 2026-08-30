// @ts-nocheck
import { assertEquals, assert } from "std/assert/mod.ts";
import { buildPresentTypesSql, getMyConfigResponse } from "../functions-mri/handlers/config.ts";

Deno.test("buildPresentTypesSql lists non-internal tables for the dataset schema", () => {
  const sql = buildPresentTypesSql("ds1");
  assert(sql.includes("information_schema.tables"));
  assert(sql.includes("table_schema = 'ds1'"));
  assert(sql.includes("NOT LIKE '\\_%'"));
});

Deno.test("getMyConfigResponse returns an array with one config", () => {
  const body = getMyConfigResponse("ds1", ["Patient", "Condition"]);
  assert(Array.isArray(body));
  assertEquals(body.length, 1);
  assertEquals(body[0].meta.configId, "fhir-ds1");
});
