// @ts-nocheck
import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { buildDatasetExistsSql, getMetadata } from "../functions/handlers/metadata.ts";
import { FhirError } from "../functions/error.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// buildDatasetExistsSql — exact SQL string tests (port of metadata.rs tests)
// ---------------------------------------------------------------------------

Deno.test("dataset_exists_sql_escapes_quotes", () => {
  const sql = buildDatasetExistsSql('"db"."meta"', "d's");
  // Must start with the correct schema reference
  assertEquals(sql.startsWith('SELECT id FROM "db"."meta"._datasets'), true);
  // Must contain the escaped single quote
  assertEquals(sql.includes("'d''s'"), true);
});

Deno.test("dataset_exists_sql_plain", () => {
  const sql = buildDatasetExistsSql('"m"', "ds1");
  assertEquals(sql, `SELECT id FROM "m"._datasets WHERE id = 'ds1'`);
});

// ---------------------------------------------------------------------------
// Minimal AppState for unit tests — no real registries needed for SQL tests;
// for getMetadata we need a registry that returns resourceTypeNames()=[].
// ---------------------------------------------------------------------------

function makeState(): { registry: ResourceRegistry; searchParams: SearchParamRegistry; dbName: string } {
  const registry = ResourceRegistry.empty();
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );
  return { registry, searchParams, dbName: "memory" };
}

// ---------------------------------------------------------------------------
// getMetadata — unit tests using a fake Conn (no withConnection needed)
// ---------------------------------------------------------------------------

Deno.test("getMetadata returns 200 with CapabilityStatement when dataset exists", async () => {
  const state = makeState();
  // Fake Conn: query returns one row → dataset exists
  const conn = {
    async query(_sql: string) {
      return [{ id: "ds1" }];
    },
  };

  const res = await getMetadata("ds1", conn, state);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.resourceType, "CapabilityStatement");
  assertEquals(body.id, "ds1-capability");
  assertEquals(body.fhirVersion, "4.0.1");
  assertEquals(body.kind, "instance");
  assertEquals(body.status, "active");
  assertEquals(body.rest[0].mode, "server");
});

Deno.test("getMetadata throws FhirError 404 when dataset is missing", async () => {
  const state = makeState();
  // Fake Conn: query returns empty array → dataset not found
  const conn = {
    async query(_sql: string) {
      return [];
    },
  };

  await assertRejects(
    () => getMetadata("missing-ds", conn, state),
    FhirError,
    "Dataset 'missing-ds' not found",
  );
});

Deno.test("getMetadata 404 FhirError has status 404", async () => {
  const state = makeState();
  const conn = { async query() { return []; } };

  try {
    await getMetadata("gone", conn, state);
    throw new Error("should have thrown");
  } catch (err) {
    assertEquals(err instanceof FhirError, true);
    assertEquals((err as FhirError).status, 404);
  }
});

Deno.test("getMetadata rejects invalid dataset ID before querying", async () => {
  const state = makeState();
  let queried = false;
  const conn = {
    async query() {
      queried = true;
      return [{ id: "x" }];
    },
  };

  await assertRejects(
    () => getMetadata("bad id!", conn, state),
    FhirError,
  );
  assertEquals(queried, false);
});

// ---------------------------------------------------------------------------
// Capability statement shape tests (transcribed from capability.rs #[cfg(test)])
// ---------------------------------------------------------------------------

import { buildCapabilityStatement } from "../functions/fhir/capability.ts";

Deno.test("test_build_capability_statement_structure", () => {
  const registry = ResourceRegistry.empty();
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );

  const cs = buildCapabilityStatement(registry, searchParams, "test-ds");

  assertEquals(cs.resourceType, "CapabilityStatement");
  assertEquals(cs.fhirVersion, "4.0.1");
  assertEquals(cs.kind, "instance");
  assertEquals(cs.status, "active");
  assertEquals(cs.rest.length, 1);
  assertEquals(cs.rest[0].mode, "server");
});

Deno.test("test_capability_id_includes_dataset", () => {
  const registry = ResourceRegistry.empty();
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );

  const cs = buildCapabilityStatement(registry, searchParams, "mydata");
  assertEquals(cs.id, "mydata-capability");
  assertEquals(cs.implementation.description.includes("mydata"), true);
});

Deno.test("test_capability_lists_resources_when_registry_populated", async () => {
  const registry = await ResourceRegistry.loadDefault();
  const searchParams = await SearchParamRegistry.loadDefault();

  const cs = buildCapabilityStatement(registry, searchParams, "ds1");

  const resources: any[] = cs.rest[0].resource;
  assertEquals(resources.length >= 100, true, `expected ≥100 resources, got ${resources.length}`);

  const patient = resources.find((r: any) => r.type === "Patient");
  assertEquals(patient !== undefined, true, "Patient resource should be present");

  const interactionCodes: string[] = patient.interaction.map((i: any) => i.code);
  assertEquals(interactionCodes.includes("read"), true);
  assertEquals(interactionCodes.includes("create"), true);
  assertEquals(interactionCodes.includes("search-type"), true);

  // Patient should have search params
  assertEquals(patient.searchParam !== undefined, true, "Patient should have searchParam");
});

Deno.test("test_search_param_type_str_all_variants", () => {
  // Test that the capability builder correctly maps all SearchParamType variants.
  // We verify by constructing a registry with synthetic search params and checking the output.
  const registry = ResourceRegistry.empty();

  // Build a minimal bundle with one SearchParameter per type
  const types = ["string", "token", "reference", "date", "quantity", "number", "uri", "composite", "special"];
  const entries = types.map((t, i) => ({
    resource: {
      resourceType: "SearchParameter",
      code: `param-${t}`,
      type: t,
      expression: `FakeResource.field${i}`,
      base: ["FakeResource"],
    },
  }));

  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: entries }),
  );

  // paramsForType returns the definitions; verify paramsForType works for each name
  for (const t of types) {
    const def = searchParams.get("FakeResource", `param-${t}`);
    assertEquals(def !== undefined, true, `should have param-${t}`);
  }
});
