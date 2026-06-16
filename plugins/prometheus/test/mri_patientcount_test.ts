// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { buildPatientCountResponse } from "../functions-mri/handlers/patientcount.ts";

Deno.test("buildPatientCountResponse shapes the MRI pcount payload", () => {
  assertEquals(buildPatientCountResponse(1234), { data: [{ "patient.attributes.pcount": 1234 }] });
});
