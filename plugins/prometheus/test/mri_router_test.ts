// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { parseMriRoute } from "../functions-mri/router.ts";

Deno.test("parseMriRoute: getMyConfig action", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/pa/services/analytics.xsjs", new URLSearchParams("action=getMyConfig&datasetId=ds1")), {
    kind: "getMyConfig",
    datasetId: "ds1",
  });
});

Deno.test("parseMriRoute: patientcount", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/api/services/population/json/patientcount", new URLSearchParams("mriquery=abc")), {
    kind: "patientcount",
  });
});

Deno.test("parseMriRoute: barchart", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/api/services/population/json/barchart", new URLSearchParams()), {
    kind: "barchart",
  });
});

Deno.test("parseMriRoute: unknown → notFound", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/nope", new URLSearchParams()).kind, "notFound");
});
