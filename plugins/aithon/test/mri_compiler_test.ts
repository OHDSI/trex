// @ts-nocheck
import { assert, assertEquals } from "std/assert/mod.ts";
import { compileCount, compileBarchart, binExpr } from "../functions-mri/elm/compiler.ts";

const schema = `"memory"."ds1"`;

Deno.test("binExpr floors numeric value to bin start", () => {
  assertEquals(binExpr("x", 10), "floor((x) / 10) * 10");
});

Deno.test("compileCount: patient gender filter → COUNT DISTINCT with escaped literal", () => {
  const elm = {
    patientWhere: { type: "And", operands: [{ type: "Compare", op: "=", valueExpr: `json_extract_string(p._raw, '$.gender')`, literal: "male" }] },
    filters: [],
    axes: [],
  };
  const sql = compileCount(elm, schema);
  assert(sql.includes(`FROM "memory"."ds1"."patient" p`));
  assert(sql.includes("NOT p._is_deleted"));
  assert(sql.includes(`json_extract_string(p._raw, '$.gender') = 'male'`));
  assert(sql.includes("COUNT(DISTINCT p.id)"));
});

Deno.test("compileCount: interaction filter → EXISTS joined by subject.reference", () => {
  const elm = {
    patientWhere: { type: "True" },
    filters: [{ resourceType: "Condition", alias: "c0", joinToPatient: true,
      where: { type: "And", operands: [{ type: "Compare", op: "=", valueExpr: `json_extract_string(c0._raw, '$.code.coding[0].code')`, literal: "C34.1" }] } }],
    axes: [],
  };
  const sql = compileCount(elm, schema);
  assert(sql.includes(`EXISTS (SELECT 1 FROM "memory"."ds1"."condition" c0`));
  assert(sql.includes(`json_extract_string(c0._raw, '$.subject.reference') LIKE '%/' || p.id`));
  assert(sql.includes(`json_extract_string(c0._raw, '$.code.coding[0].code') = 'C34.1'`));
});

Deno.test("compileBarchart: numeric axis → GROUP BY binned, alias by category id", () => {
  const elm = {
    patientWhere: { type: "True" },
    filters: [],
    axes: [{ id: "x1", valueExpr: `date_diff('year', CAST(json_extract_string(p._raw, '$.birthDate') AS DATE), current_date)`, kind: "num", binSize: 10 }],
  };
  const sql = compileBarchart(elm, schema);
  assert(sql.includes(`AS "x1"`));
  assert(sql.includes("GROUP BY"));
  assert(sql.includes("COUNT(DISTINCT p.id) AS pcount"));
});
