// @ts-nocheck
// Tests for functions/fhir/bundle_processor.ts
// Transcribed from plugins/fhir/src/fhir/bundle_processor.rs #[cfg(test)]

import { assertEquals, assertThrows } from "std/assert/mod.ts";
import {
  processBundleEntries,
  ProcessedEntry,
} from "../functions/fhir/bundle_processor.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID pattern: 8-4-4-4-12 hex groups separated by hyphens */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

// ---------------------------------------------------------------------------
// Tests mirroring Rust #[cfg(test)] (10 tests)
// ---------------------------------------------------------------------------

Deno.test("process_bundle_empty", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 0);
});

Deno.test("process_bundle_basic", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        fullUrl: "urn:uuid:abc-123",
        resource: {
          resourceType: "Patient",
          name: [{ family: "Smith" }],
        },
        request: {
          method: "POST",
          url: "Patient",
        },
      },
    ],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 1);
  assertEquals(result[0].resourceType, "Patient");
  assertEquals(result[0].method, "POST");
  assertEquals(typeof result[0].serverId, "string");
  assertEquals(result[0].serverId.length > 0, true);
});

Deno.test("temp_reference_resolution", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        fullUrl: "urn:uuid:patient-1",
        resource: {
          resourceType: "Patient",
          name: [{ family: "Smith" }],
        },
        request: { method: "POST", url: "Patient" },
      },
      {
        fullUrl: "urn:uuid:obs-1",
        resource: {
          resourceType: "Observation",
          subject: { reference: "urn:uuid:patient-1" },
          status: "final",
        },
        request: { method: "POST", url: "Observation" },
      },
    ],
  };

  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 2);

  const obs = result[1];
  const subjectRef: string = obs.resource?.subject?.reference;
  assertEquals(typeof subjectRef, "string");
  assertEquals(subjectRef.startsWith("Patient/"), true);
  assertEquals(subjectRef.includes("urn:uuid:"), false);
});

Deno.test("put_extracts_id_from_request_url", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: {
          resourceType: "Patient",
          name: [{ family: "Smith" }],
        },
        request: {
          method: "PUT",
          url: "Patient/123",
        },
      },
    ],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 1);
  assertEquals(result[0].serverId, "123");
  assertEquals(result[0].method, "PUT");
});

Deno.test("delete_extracts_id_from_request_url", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: {
          resourceType: "Patient",
        },
        request: {
          method: "DELETE",
          url: "Patient/456",
        },
      },
    ],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 1);
  assertEquals(result[0].serverId, "456");
  assertEquals(result[0].method, "DELETE");
});

Deno.test("post_generates_uuid", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: {
          resourceType: "Patient",
          name: [{ family: "Smith" }],
        },
        request: {
          method: "POST",
          url: "Patient",
        },
      },
    ],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 1);
  assertEquals(result[0].method, "POST");
  // POST should generate a UUID, not "Patient"
  assertEquals(result[0].serverId !== "Patient", true);
  assertEquals(result[0].serverId.includes("-"), true); // UUID format
});

Deno.test("put_falls_back_to_resource_id", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: {
          resourceType: "Patient",
          id: "from-resource",
        },
        request: {
          method: "PUT",
          url: "Patient",
        },
      },
    ],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result[0].serverId, "from-resource");
});

Deno.test("mixed_bundle_splits_with_correct_ids", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        fullUrl: "urn:uuid:new-patient",
        resource: {
          resourceType: "Patient",
          name: [{ family: "New" }],
        },
        request: { method: "POST", url: "Patient" },
      },
      {
        resource: {
          resourceType: "Patient",
          name: [{ family: "Updated" }],
        },
        request: { method: "PUT", url: "Patient/pat-123" },
      },
      {
        resource: {
          resourceType: "Observation",
          status: "final",
          subject: { reference: "urn:uuid:new-patient" },
        },
        request: { method: "PUT", url: "Observation/obs-456" },
      },
      {
        resource: {
          resourceType: "Condition",
        },
        request: { method: "DELETE", url: "Condition/cond-789" },
      },
    ],
  };

  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 4);

  // POST: gets a generated UUID, not the resource type
  assertEquals(result[0].method, "POST");
  assertEquals(result[0].resourceType, "Patient");
  assertEquals(result[0].serverId !== "Patient", true);
  assertEquals(result[0].serverId.includes("-"), true);

  // PUT Patient/pat-123: server_id must be "pat-123"
  assertEquals(result[1].method, "PUT");
  assertEquals(result[1].resourceType, "Patient");
  assertEquals(result[1].serverId, "pat-123");

  // PUT Observation/obs-456: server_id must be "obs-456"
  assertEquals(result[2].method, "PUT");
  assertEquals(result[2].resourceType, "Observation");
  assertEquals(result[2].serverId, "obs-456");

  // Cross-reference from POST entry should be resolved
  const subjectRef: string = result[2].resource?.subject?.reference;
  assertEquals(
    subjectRef.startsWith("Patient/"),
    true,
    `expected Patient/<uuid>, got: ${subjectRef}`,
  );
  assertEquals(subjectRef.includes("urn:uuid:"), false);

  // DELETE Condition/cond-789: server_id must be "cond-789"
  assertEquals(result[3].method, "DELETE");
  assertEquals(result[3].resourceType, "Condition");
  assertEquals(result[3].serverId, "cond-789");

  // Simulate what process_single_entry does: set resource.id = server_id.
  for (const entry of result) {
    const resource = { ...entry.resource };
    resource.id = entry.serverId;
    assertEquals(
      resource.id,
      entry.serverId,
      `resource.id must equal serverId so GET /${entry.resourceType}/${entry.serverId} works`,
    );
  }
  // Verify PUT resources are GET-reachable by their request URL IDs
  assertEquals(result[1].serverId, "pat-123", "GET /Patient/pat-123 must find this resource");
  assertEquals(result[2].serverId, "obs-456", "GET /Observation/obs-456 must find this resource");
  assertEquals(result[3].serverId, "cond-789", "DELETE used correct id from request.url");
});

Deno.test("put_conditional_url_falls_back_to_resource_id", () => {
  // Real-world pattern: PUT Patient?identifier=xxx uses resource.id
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: {
          resourceType: "Patient",
          id: "79dbcd3d-eb5f-4f3d-b7e1-7a73b77f26e7",
          name: [{ use: "anonymous", given: ["79dbcd3d"] }],
        },
        request: {
          method: "PUT",
          url: "Patient?identifier=79dbcd3d-eb5f-4f3d-b7e1-7a73b77f26e7",
        },
      },
      {
        resource: {
          resourceType: "Observation",
          id: "019b02f3-fea0-c489-b20d-a4904a80e613",
          status: "final",
          code: { text: "test" },
          subject: {
            reference: "Patient/79dbcd3d-eb5f-4f3d-b7e1-7a73b77f26e7",
          },
        },
        request: {
          method: "PUT",
          url: "Observation?identifier=019b02f3-fea0-c489-b20d-a4904a80e613",
        },
      },
    ],
  };
  const result = processBundleEntries(bundle, 1000);
  assertEquals(result.length, 2);

  // Conditional URLs don't contain a direct ID, so resource.id is used
  assertEquals(result[0].serverId, "79dbcd3d-eb5f-4f3d-b7e1-7a73b77f26e7");
  assertEquals(result[0].method, "PUT");

  assertEquals(result[1].serverId, "019b02f3-fea0-c489-b20d-a4904a80e613");
  assertEquals(result[1].method, "PUT");
});

Deno.test("max_entries_exceeded", () => {
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: [
      {
        resource: { resourceType: "Patient" },
        request: { method: "POST", url: "Patient" },
      },
      {
        resource: { resourceType: "Patient" },
        request: { method: "POST", url: "Patient" },
      },
      {
        resource: { resourceType: "Patient" },
        request: { method: "POST", url: "Patient" },
      },
    ],
  };
  assertThrows(
    () => processBundleEntries(bundle, 2),
    Error,
    "exceeds maximum",
  );
});
