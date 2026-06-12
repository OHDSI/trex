// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/schema/sql_builder.rs #[cfg(test)] mod tests

import { assertEquals, assert } from "std/assert/mod.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";
import {
  buildInsertSql,
  buildUpdateSql,
  buildUpsertSql,
} from "../functions/schema/sql_builder.ts";
import {
  generateJsonTransform,
  generateColumnNames,
} from "../functions/schema/json_transform.ts";

function testCols(): string[] {
  return ["gender", "birthDate", "name"];
}

// ---------------------------------------------------------------------------
// Rust test: test_build_insert_sql_structure
// ---------------------------------------------------------------------------
Deno.test("test_build_insert_sql_structure", () => {
  const cols = testCols();
  const sql = buildInsertSql('"test"', "patient", 1, '{"gender": "VARCHAR"}', cols);
  assert(sql.startsWith('INSERT INTO "test"."patient"'), `wrong prefix: ${sql}`);
  assert(sql.includes('"gender"'), "missing column gender");
  assert(sql.includes('"birthDate"'), "missing column birthDate");
  assert(sql.includes('t."gender"'), "missing select gender");
  assert(sql.includes('t."birthDate"'), "missing select birthDate");
  assert(sql.includes("json_transform($2::JSON,"), "missing json_transform");
  assert(sql.includes("$1"), "missing $1 param");
  assert(sql.includes("$2::JSON"), "missing $2 param");
});

// ---------------------------------------------------------------------------
// Rust test: test_build_update_sql_structure
// ---------------------------------------------------------------------------
Deno.test("test_build_update_sql_structure", () => {
  const cols = testCols();
  const sql = buildUpdateSql('"test"', "patient", 2, '{"gender": "VARCHAR"}', cols);
  assert(sql.startsWith('UPDATE "test"."patient" SET'), `wrong prefix: ${sql}`);
  assert(sql.includes('"gender" = t."gender"'), "missing SET gender");
  assert(sql.includes("WHERE _id = $1"), "missing WHERE clause");
  assert(sql.includes("json_transform($2::JSON,"), "missing json_transform");
});

// ---------------------------------------------------------------------------
// Rust test: test_build_upsert_sql_structure
// ---------------------------------------------------------------------------
Deno.test("test_build_upsert_sql_structure", () => {
  const cols = testCols();
  const sql = buildUpsertSql('"test"', "patient", 1, '{"gender": "VARCHAR"}', cols);
  assert(sql.startsWith('INSERT OR REPLACE INTO "test"."patient"'), `wrong prefix: ${sql}`);
  assert(sql.includes("json_transform($2::JSON,"), "missing json_transform");
});

// ---------------------------------------------------------------------------
// Rust test: test_empty_columns
// ---------------------------------------------------------------------------
Deno.test("test_empty_columns", () => {
  const empty: string[] = [];
  const sql = buildInsertSql('"s"', "t", 1, "{}", empty);
  assert(!sql.includes(", ,"), "should not have empty column list");
  assert(sql.includes("_raw)"), "should end column list with _raw");
});

// ---------------------------------------------------------------------------
// Rust test: test_single_quote_escaping
// ---------------------------------------------------------------------------
Deno.test("test_single_quote_escaping", () => {
  const sql = buildInsertSql('"s"', "t", 1, "{'key': 'val'}", ["key"]);
  assert(sql.includes("''key'': ''val''"), `should escape single quotes: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_insert_sql_with_real_patient_spec (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_insert_sql_with_real_patient_spec", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const spec = generateJsonTransform(defs, "Patient");
  const cols = generateColumnNames(defs, "Patient");

  const sql = buildInsertSql('"myschema"', "patient", 1, spec, cols);

  assert(sql.startsWith('INSERT INTO "myschema"."patient"'));
  assert(sql.includes("json_transform($2::JSON,"));
  // Should have gender, birthDate, name columns
  assert(sql.includes('"gender"'), `missing gender in: ${sql.slice(0, 500)}`);
  assert(sql.includes('"birthDate"'), "missing birthDate");
  assert(sql.includes('"name"'), "missing name");
  // Should not contain resourceType
  assert(!sql.includes('"resourceType"'), "should not have resourceType column");
});

// ---------------------------------------------------------------------------
// Rust test: test_update_sql_with_real_patient_spec (uses real defs)
// ---------------------------------------------------------------------------
Deno.test("test_update_sql_with_real_patient_spec", async () => {
  const defs = await DefinitionRegistry.loadDefault();
  const spec = generateJsonTransform(defs, "Patient");
  const cols = generateColumnNames(defs, "Patient");

  const sql = buildUpdateSql('"myschema"', "patient", 2, spec, cols);

  assert(sql.startsWith('UPDATE "myschema"."patient" SET'));
  assert(sql.includes('"gender" = t."gender"'));
  assert(sql.includes("WHERE _id = $1"));
});

// ---------------------------------------------------------------------------
// Additional: exact SQL structure checks
// ---------------------------------------------------------------------------
Deno.test("buildInsertSql - exact structure with two columns", () => {
  const sql = buildInsertSql('"s"', "tbl", 3, '{"a": "VARCHAR"}', ["a", "b"]);
  assertEquals(
    sql,
    'INSERT INTO "s"."tbl" (_id, _version_id, _last_updated, _is_deleted, _raw, "a", "b") SELECT $1, 3, CURRENT_TIMESTAMP, false, $2::JSON, t."a", t."b" FROM (SELECT UNNEST(json_transform($2::JSON, \'{"a": "VARCHAR"}\'))) AS t',
  );
});

Deno.test("buildUpdateSql - exact structure with one column", () => {
  const sql = buildUpdateSql('"s"', "tbl", 7, '{"x": "INTEGER"}', ["x"]);
  assertEquals(
    sql,
    'UPDATE "s"."tbl" SET _version_id = 7, _last_updated = CURRENT_TIMESTAMP, _is_deleted = false, _raw = $2::JSON, "x" = t."x" FROM (SELECT UNNEST(json_transform($2::JSON, \'{"x": "INTEGER"}\'))) AS t WHERE _id = $1',
  );
});

Deno.test("buildUpsertSql - exact structure with one column", () => {
  const sql = buildUpsertSql('"s"', "tbl", 1, '{"y": "BOOLEAN"}', ["y"]);
  assertEquals(
    sql,
    'INSERT OR REPLACE INTO "s"."tbl" (_id, _version_id, _last_updated, _is_deleted, _raw, "y") SELECT $1, 1, CURRENT_TIMESTAMP, false, $2::JSON, t."y" FROM (SELECT UNNEST(json_transform($2::JSON, \'{"y": "BOOLEAN"}\'))) AS t',
  );
});

Deno.test("buildInsertSql - empty columns produces no suffix", () => {
  const sql = buildInsertSql('"s"', "tbl", 1, "{}", []);
  assertEquals(
    sql,
    `INSERT INTO "s"."tbl" (_id, _version_id, _last_updated, _is_deleted, _raw) SELECT $1, 1, CURRENT_TIMESTAMP, false, $2::JSON FROM (SELECT UNNEST(json_transform($2::JSON, '{}'))) AS t`,
  );
});
