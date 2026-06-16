// @ts-nocheck
import { assert, assertEquals } from "std/assert/mod.ts";
import { handlePatientCount } from "../functions-mri/handlers/patientcount.ts";
import { handleBarchart } from "../functions-mri/handlers/barchart.ts";
import { encodeMriQuery } from "../functions-mri/mriquery/decode.ts";

const state = { registry: { listResourceTypes: () => ["Patient", "Condition"] }, dbName: "memory" };

function fakeConn(rows: any[]) {
  const seen: string[] = [];
  return { seen, query: async (sql: string) => { seen.push(sql); return rows; } };
}

Deno.test("patientcount end-to-end: decodes IFR, builds count SQL, shapes response", async () => {
  const ifr = {
    datasetId: "ds1",
    filter: { configMetadata: { id: "fhir-ds1", version: "1" }, cards: {
      type: "BooleanContainer", op: "AND", content: [{
        type: "FilterCard", configPath: "patient.attributes.Gender", attributes: {
          type: "BooleanContainer", op: "AND", content: [{
            type: "Attribute", configPath: "patient.attributes.Gender",
            constraints: { type: "BooleanContainer", op: "OR", content: [{ type: "Expression", operator: "=", value: "male" }] },
          }],
        },
      }],
    } },
    axisSelection: [],
  };
  const conn = fakeConn([{ pcount: "42" }]);
  const res = await handlePatientCount(await encodeMriQuery(ifr), conn, state);
  const body = await res.json();
  assertEquals(body, { data: [{ "patient.attributes.pcount": 42 }] });
  assert(conn.seen[0].includes("COUNT(DISTINCT p.id)"));
  assert(conn.seen[0].includes(`json_extract_string(p._raw, '$.gender') = 'male'`));
});

Deno.test("barchart end-to-end: Age × Gender → categories/measures + filled data", async () => {
  const ifr = {
    datasetId: "ds1",
    filter: { configMetadata: { id: "fhir-ds1", version: "1" }, cards: { type: "BooleanContainer", op: "AND", content: [] } },
    axisSelection: [
      { categoryId: "x1", attributeId: "patient.attributes.Age", binsize: "10" },
      { categoryId: "y1", attributeId: "patient.attributes.Gender", binsize: "n/a" },
    ],
  };
  const conn = fakeConn([
    { "patient.attributes.Age": 30, "patient.attributes.Gender": "male", pcount: "5" },
    { "patient.attributes.Age": 30, "patient.attributes.Gender": "female", pcount: "3" },
    { "patient.attributes.Age": 40, "patient.attributes.Gender": "male", pcount: "7" },
  ]);
  const res = await handleBarchart(await encodeMriQuery(ifr), conn, state);
  const body = await res.json();
  assertEquals(body.totalPatientCount, 15);
  assertEquals(body.categories.map((c) => c.id), ["patient.attributes.Age", "patient.attributes.Gender"]);
  assertEquals(body.data.length, 4); // 2×2 filled
  assert(conn.seen[0].includes("GROUP BY"));
  assert(conn.seen[0].includes("floor("));
});
