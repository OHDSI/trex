// @ts-nocheck
// Tests for functions/fhir/validation.ts
// Transcribed from validation.rs #[cfg(test)] mod tests (all 8 tests).

import { assertEquals } from "std/assert/mod.ts";
import {
  validateResource,
  validateResourceUpdate,
} from "../functions/fhir/validation.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An empty registry — knows no resource types. Mirrors empty_registry() in Rust. */
function emptyRegistry() {
  return {
    isKnownResourceType(_rt: string): boolean {
      return false;
    },
  };
}

/** A registry that knows about Patient. */
function patientRegistry() {
  return {
    isKnownResourceType(rt: string): boolean {
      return rt === "Patient";
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: non_object_resource_is_structure_error
// ---------------------------------------------------------------------------

Deno.test("non_object_resource_is_structure_error", () => {
  const r = emptyRegistry();
  const res = validateResource("not an object", "Patient", r);
  assertEquals(res.isValid(), false);
  assertEquals(res.issues[0].code, "structure");
});

// ---------------------------------------------------------------------------
// Test 2: missing_resource_type_is_required_error
// ---------------------------------------------------------------------------

Deno.test("missing_resource_type_is_required_error", () => {
  const r = emptyRegistry();
  const res = validateResource({}, "Patient", r);
  assertEquals(res.isValid(), false);
  assertEquals(res.issues[0].code, "required");
  assertEquals(res.issues[0].path, "resourceType");
});

// ---------------------------------------------------------------------------
// Test 3: mismatched_resource_type_is_value_error
// ---------------------------------------------------------------------------

Deno.test("mismatched_resource_type_is_value_error", () => {
  const r = emptyRegistry();
  const res = validateResource({ resourceType: "Observation" }, "Patient", r);
  assertEquals(res.isValid(), false);
  assertEquals(res.issues[0].code, "value");
});

// ---------------------------------------------------------------------------
// Test 4: unknown_resource_type_is_not_supported
// ---------------------------------------------------------------------------

Deno.test("unknown_resource_type_is_not_supported", () => {
  const r = emptyRegistry();
  const res = validateResource({ resourceType: "Patient" }, "Patient", r);
  assertEquals(res.isValid(), false);
  assertEquals(res.issues.some((i) => i.code === "not-supported"), true);
});

// ---------------------------------------------------------------------------
// Test 5: client_id_emits_warning_only
// ---------------------------------------------------------------------------

Deno.test("client_id_emits_warning_only", () => {
  // Use a registry that knows Patient so the not-supported error is absent
  const r = patientRegistry();
  const res = validateResource({ resourceType: "Patient", id: "abc" }, "Patient", r);
  // Should have warning for id, but no errors → still valid
  assertEquals(
    res.issues.some((i) => i.severity === "warning" && i.path === "id"),
    true,
  );
  // The resource is valid (warnings don't fail is_valid)
  assertEquals(res.isValid(), true);
});

// ---------------------------------------------------------------------------
// Test 6: update_mismatched_id_is_value_error
// ---------------------------------------------------------------------------

Deno.test("update_mismatched_id_is_value_error", () => {
  const r = emptyRegistry();
  const res = validateResourceUpdate(
    { resourceType: "Patient", id: "other" },
    "Patient",
    "expected-id",
    r,
  );
  assertEquals(
    res.issues.some((i) => i.code === "value" && i.path === "id"),
    true,
  );
});

// ---------------------------------------------------------------------------
// Test 7: update_matching_id_does_not_emit_id_error
// ---------------------------------------------------------------------------

Deno.test("update_matching_id_does_not_emit_id_error", () => {
  const r = emptyRegistry();
  const res = validateResourceUpdate(
    { resourceType: "Patient", id: "abc" },
    "Patient",
    "abc",
    r,
  );
  assertEquals(
    res.issues.some((i) => i.code === "value" && i.path === "id"),
    false,
  );
});

// ---------------------------------------------------------------------------
// Test 8: operation_outcome_includes_expression_when_path_set
// ---------------------------------------------------------------------------

Deno.test("operation_outcome_includes_expression_when_path_set", () => {
  const r = emptyRegistry();
  const res = validateResource({}, "Patient", r);
  const oo = res.toOperationOutcome();
  assertEquals(oo["resourceType"], "OperationOutcome");
  assertEquals((oo["issue"] as any[])[0]["expression"][0], "resourceType");
});
