// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { assembleBarchart } from "../functions-mri/postprocess/barchart.ts";

Deno.test("assembleBarchart returns categories/measures/totalPatientCount + fills combos", () => {
  const axes = [
    { id: "x1", valueExpr: "AGE", kind: "num", binSize: 10 },
    { id: "y1", valueExpr: "GENDER", kind: "text" },
  ];
  const rows = [
    { x1: 30, y1: "male", pcount: 5 },
    { x1: 30, y1: "female", pcount: 3 },
    { x1: 40, y1: "male", pcount: 7 },
    // (40, female) missing → should be filled with 0
  ];
  const res = assembleBarchart(rows, axes, [{ name: "Age" }, { name: "Gender" }]);
  assertEquals(res.totalPatientCount, 15);
  assertEquals(res.categories.length, 2);
  assertEquals(res.categories[0].id, "x1");
  assertEquals(res.categories[0].binsize, 10);
  assertEquals(res.data.length, 4);
  const filled = res.data.find((d) => d.x1 === 40 && d.y1 === "female");
  assertEquals(filled.pcount, 0);
});
