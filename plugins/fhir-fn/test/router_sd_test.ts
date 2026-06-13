import { assertEquals } from "std/assert/mod.ts";
import { parseRoute } from "../functions/router.ts";

Deno.test("GET /{ds}/StructureDefinition → list", () => {
  assertEquals(parseRoute("GET", "/ds1/StructureDefinition"), { kind: "structureDefinitionList", datasetId: "ds1" });
});
Deno.test("GET /{ds}/StructureDefinition/Patient → read", () => {
  assertEquals(parseRoute("GET", "/ds1/StructureDefinition/Patient"), { kind: "structureDefinitionRead", datasetId: "ds1", type: "Patient" });
});
