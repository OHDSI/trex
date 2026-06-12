import { assertEquals } from "std/assert/mod.ts";
import { FhirError } from "../functions/error.ts";

Deno.test("status + issue code mapping", () => {
  assertEquals(FhirError.notFound("x").status, 404);
  assertEquals(FhirError.badRequest("x").status, 400);
  assertEquals(FhirError.conflict("x").status, 409);
  assertEquals(FhirError.gone("x").status, 410);
  assertEquals(FhirError.internal("x").status, 500);
  assertEquals(FhirError.timeout("x").status, 408);
});

Deno.test("operationOutcome shape", () => {
  const oo = FhirError.notFound("missing").operationOutcome();
  assertEquals(oo.resourceType, "OperationOutcome");
  assertEquals(oo.issue[0].code, "not-found");
  assertEquals(oo.issue[0].diagnostics, "missing");
  assertEquals(oo.issue[0].severity, "error");
});

Deno.test("toResponse sets fhir content-type", () => {
  const res = FhirError.badRequest("bad").toResponse();
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("content-type"), "application/fhir+json");
});

Deno.test("FhirError is an Error subclass", () => {
  const e = FhirError.notFound("x");
  assertEquals(e instanceof Error, true);
});
