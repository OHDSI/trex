import { assertEquals, assertMatch } from "std/assert/mod.ts";
import { parseRoute, postProcess, type Route } from "../functions/router.ts";
import { handle } from "../functions/index.ts";

// ---------------------------------------------------------------------------
// parseRoute — all route kinds
// ---------------------------------------------------------------------------

Deno.test("parseRoute: health", () => {
  assertEquals(parseRoute("GET", "/health"), { kind: "health" });
});

Deno.test("parseRoute: metrics", () => {
  assertEquals(parseRoute("GET", "/metrics"), { kind: "metrics" });
});

Deno.test("parseRoute: createDataset", () => {
  assertEquals(parseRoute("POST", "/datasets"), { kind: "createDataset" });
});

Deno.test("parseRoute: listDatasets", () => {
  assertEquals(parseRoute("GET", "/datasets"), { kind: "listDatasets" });
});

Deno.test("parseRoute: getDataset", () => {
  assertEquals(parseRoute("GET", "/datasets/ds1"), { kind: "getDataset", datasetId: "ds1" });
});

Deno.test("parseRoute: updateDataset", () => {
  assertEquals(parseRoute("PUT", "/datasets/ds1"), { kind: "updateDataset", datasetId: "ds1" });
});

Deno.test("parseRoute: deleteDataset", () => {
  assertEquals(parseRoute("DELETE", "/datasets/ds1"), { kind: "deleteDataset", datasetId: "ds1" });
});

Deno.test("parseRoute: metadata", () => {
  assertEquals(parseRoute("GET", "/ds1/metadata"), { kind: "metadata", datasetId: "ds1" });
});

Deno.test("parseRoute: search", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient"), {
    kind: "search",
    datasetId: "ds1",
    resourceType: "Patient",
  });
});

Deno.test("parseRoute: create", () => {
  assertEquals(parseRoute("POST", "/ds1/Patient"), {
    kind: "create",
    datasetId: "ds1",
    resourceType: "Patient",
  });
});

Deno.test("parseRoute: read", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient/p1"), {
    kind: "read",
    datasetId: "ds1",
    resourceType: "Patient",
    id: "p1",
  });
});

Deno.test("parseRoute: update", () => {
  assertEquals(parseRoute("PUT", "/ds1/Patient/p1"), {
    kind: "update",
    datasetId: "ds1",
    resourceType: "Patient",
    id: "p1",
  });
});

Deno.test("parseRoute: delete", () => {
  assertEquals(parseRoute("DELETE", "/ds1/Patient/p1"), {
    kind: "delete",
    datasetId: "ds1",
    resourceType: "Patient",
    id: "p1",
  });
});

Deno.test("parseRoute: history", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient/p1/_history"), {
    kind: "history",
    datasetId: "ds1",
    resourceType: "Patient",
    id: "p1",
  });
});

Deno.test("parseRoute: vread", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient/p1/_history/v2"), {
    kind: "vread",
    datasetId: "ds1",
    resourceType: "Patient",
    id: "p1",
    versionId: "v2",
  });
});

Deno.test("parseRoute: bundle", () => {
  assertEquals(parseRoute("POST", "/ds1"), { kind: "bundle", datasetId: "ds1" });
});

Deno.test("parseRoute: import", () => {
  assertEquals(parseRoute("POST", "/ds1/$import"), { kind: "import", datasetId: "ds1" });
});

Deno.test("parseRoute: export", () => {
  assertEquals(parseRoute("GET", "/ds1/$export"), { kind: "export", datasetId: "ds1" });
});

Deno.test("parseRoute: exportStatus", () => {
  assertEquals(parseRoute("GET", "/ds1/$export/status/j1"), {
    kind: "exportStatus",
    datasetId: "ds1",
    jobId: "j1",
  });
});

Deno.test("parseRoute: typeExport", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient/$export"), {
    kind: "typeExport",
    datasetId: "ds1",
    resourceType: "Patient",
  });
});

Deno.test("parseRoute: evaluateMeasure (no measureId)", () => {
  assertEquals(parseRoute("GET", "/ds1/Measure/$evaluate-measure"), {
    kind: "evaluateMeasure",
    datasetId: "ds1",
  });
  assertEquals(parseRoute("POST", "/ds1/Measure/$evaluate-measure"), {
    kind: "evaluateMeasure",
    datasetId: "ds1",
  });
});

Deno.test("parseRoute: evaluateMeasure with measureId", () => {
  assertEquals(parseRoute("GET", "/ds1/Measure/m1/$evaluate-measure"), {
    kind: "evaluateMeasure",
    datasetId: "ds1",
    measureId: "m1",
  });
  assertEquals(parseRoute("POST", "/ds1/Measure/m1/$evaluate-measure"), {
    kind: "evaluateMeasure",
    datasetId: "ds1",
    measureId: "m1",
  });
});

Deno.test("parseRoute: cql", () => {
  assertEquals(parseRoute("POST", "/ds1/$cql"), { kind: "cql", datasetId: "ds1" });
});

Deno.test("parseRoute: notFound for unknown path", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient/p1/extra/segment/nope"), { kind: "notFound" });
  assertEquals(parseRoute("PATCH", "/ds1/Patient"), { kind: "notFound" });
});

// ---------------------------------------------------------------------------
// Wrong-method fencing: literal/operation segments must not fall through
// ---------------------------------------------------------------------------

Deno.test("wrong-method: GET /ds/$import → notFound (not search)", () => {
  assertEquals(parseRoute("GET", "/ds/$import"), { kind: "notFound" });
});

Deno.test("wrong-method: GET /ds/$cql → notFound (not search)", () => {
  assertEquals(parseRoute("GET", "/ds/$cql"), { kind: "notFound" });
});

Deno.test("wrong-method: POST /ds/$export → notFound (not create)", () => {
  assertEquals(parseRoute("POST", "/ds/$export"), { kind: "notFound" });
});

Deno.test("wrong-method: POST /ds/metadata → notFound (not create)", () => {
  assertEquals(parseRoute("POST", "/ds/metadata"), { kind: "notFound" });
});

Deno.test("wrong-method: DELETE /ds/Patient/$export → notFound (not delete with id=$export)", () => {
  assertEquals(parseRoute("DELETE", "/ds/Patient/$export"), { kind: "notFound" });
});

Deno.test("wrong-method: PUT /ds/Patient/$export → notFound (not update with id=$export)", () => {
  assertEquals(parseRoute("PUT", "/ds/Patient/$export"), { kind: "notFound" });
});

Deno.test("wrong-method: DELETE /ds/Measure/$evaluate-measure → notFound", () => {
  assertEquals(parseRoute("DELETE", "/ds/Measure/$evaluate-measure"), { kind: "notFound" });
});

Deno.test("wrong-method: PUT /ds/Measure/$evaluate-measure → notFound", () => {
  assertEquals(parseRoute("PUT", "/ds/Measure/$evaluate-measure"), { kind: "notFound" });
});

Deno.test("wrong-method: DELETE /ds/Measure/m1/$evaluate-measure → notFound", () => {
  assertEquals(parseRoute("DELETE", "/ds/Measure/m1/$evaluate-measure"), { kind: "notFound" });
});

Deno.test("wrong-method: PUT /ds/Measure/m1/$evaluate-measure → notFound", () => {
  assertEquals(parseRoute("PUT", "/ds/Measure/m1/$evaluate-measure"), { kind: "notFound" });
});

Deno.test("wrong-method: POST /health → notFound (not bundle)", () => {
  assertEquals(parseRoute("POST", "/health"), { kind: "notFound" });
});

Deno.test("wrong-method: POST /metrics → notFound (not bundle)", () => {
  assertEquals(parseRoute("POST", "/metrics"), { kind: "notFound" });
});

Deno.test("wrong-method: DELETE /ds/$export/status/j1 → notFound", () => {
  assertEquals(parseRoute("DELETE", "/ds/$export/status/j1"), { kind: "notFound" });
});

Deno.test("wrong-method: PUT /ds/Patient/p1/_history → notFound", () => {
  assertEquals(parseRoute("PUT", "/ds/Patient/p1/_history"), { kind: "notFound" });
});

// ---------------------------------------------------------------------------
// Precedence assertions
// ---------------------------------------------------------------------------

Deno.test("precedence: /ds1/metadata → metadata, not search", () => {
  const r = parseRoute("GET", "/ds1/metadata");
  assertEquals(r.kind, "metadata");
});

Deno.test("precedence: /ds1/$import → import, not search", () => {
  const r = parseRoute("POST", "/ds1/$import");
  assertEquals(r.kind, "import");
});

Deno.test("precedence: /ds1/$export/status/j1 → exportStatus", () => {
  const r = parseRoute("GET", "/ds1/$export/status/j1");
  assertEquals(r.kind, "exportStatus");
  if (r.kind === "exportStatus") assertEquals(r.jobId, "j1");
});

Deno.test("precedence: /ds1/Patient/$export → typeExport, not read", () => {
  const r = parseRoute("GET", "/ds1/Patient/$export");
  assertEquals(r.kind, "typeExport");
  if (r.kind === "typeExport") assertEquals(r.resourceType, "Patient");
});

Deno.test("precedence: /ds1/Measure/$evaluate-measure → evaluateMeasure (no id)", () => {
  const r = parseRoute("GET", "/ds1/Measure/$evaluate-measure");
  assertEquals(r.kind, "evaluateMeasure");
  if (r.kind === "evaluateMeasure") assertEquals(r.measureId, undefined);
});

Deno.test("precedence: /ds1/Measure/m1/$evaluate-measure → evaluateMeasure measureId=m1", () => {
  const r = parseRoute("GET", "/ds1/Measure/m1/$evaluate-measure");
  assertEquals(r.kind, "evaluateMeasure");
  if (r.kind === "evaluateMeasure") assertEquals(r.measureId, "m1");
});

// ---------------------------------------------------------------------------
// postProcess tests
// ---------------------------------------------------------------------------

Deno.test("postProcess: rewrites Bundle entry fullUrl", async () => {
  const bundle = {
    resourceType: "Bundle",
    entry: [{ fullUrl: "Patient/p1", resource: {} }],
  };
  const res = new Response(JSON.stringify(bundle), {
    headers: { "content-type": "application/json" },
  });
  const out = await postProcess(res, "http://x/trex/fhir", "ds1");
  const body = await out.json();
  assertEquals(body.entry[0].fullUrl, "http://x/trex/fhir/ds1/Patient/p1");
});

Deno.test("postProcess: absolute fullUrl left unchanged", async () => {
  const bundle = {
    resourceType: "Bundle",
    entry: [{ fullUrl: "http://other/Patient/p1", resource: {} }],
  };
  const res = new Response(JSON.stringify(bundle), {
    headers: { "content-type": "application/json" },
  });
  const out = await postProcess(res, "http://x/trex/fhir", "ds1");
  const body = await out.json();
  assertEquals(body.entry[0].fullUrl, "http://other/Patient/p1");
});

Deno.test("postProcess: rewrites relative Location header", async () => {
  const res = new Response(JSON.stringify({ resourceType: "Patient" }), {
    headers: {
      "content-type": "application/json",
      "location": "Patient/p1",
    },
  });
  const out = await postProcess(res, "http://x/trex/fhir", "ds1");
  assertEquals(out.headers.get("location"), "http://x/trex/fhir/ds1/Patient/p1");
});

Deno.test("postProcess: rewrites relative Location header with leading slash", async () => {
  const res = new Response(JSON.stringify({}), {
    headers: {
      "content-type": "application/json",
      "location": "/Patient/p1",
    },
  });
  const out = await postProcess(res, "http://x/trex/fhir", "ds1");
  assertEquals(out.headers.get("location"), "http://x/trex/fhir/ds1/Patient/p1");
});

Deno.test("postProcess: content-type set to application/fhir+json", async () => {
  const res = new Response(JSON.stringify({ resourceType: "Patient" }), {
    headers: { "content-type": "application/json" },
  });
  const out = await postProcess(res, "http://x/trex/fhir", "ds1");
  assertEquals(out.headers.get("content-type"), "application/fhir+json");
});

Deno.test("postProcess: non-JSON response passed through unchanged", async () => {
  const res = new Response("plain text", {
    headers: { "content-type": "text/plain" },
  });
  const out = await postProcess(res, "http://x/trex/fhir", "ds1");
  assertEquals(out.headers.get("content-type"), "text/plain");
  assertEquals(await out.text(), "plain text");
});

// ---------------------------------------------------------------------------
// Integration: handle() still serves /health and mounted /trex/fhir/health
// ---------------------------------------------------------------------------

Deno.test("handle: health returns 200 ok", async () => {
  const res = await handle(new Request("http://x/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "ok");
});

Deno.test("handle: health via mounted path", async () => {
  const res = await handle(new Request("http://x/trex/fhir/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "ok");
});

Deno.test("handle: unknown path returns 404 OperationOutcome", async () => {
  const res = await handle(new Request("http://x/nope"));
  assertEquals(res.status, 404);
  assertEquals((await res.json()).resourceType, "OperationOutcome");
});
