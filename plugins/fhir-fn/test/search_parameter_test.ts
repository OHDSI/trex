import { assertEquals, assert, assertThrows } from "std/assert/mod.ts";
import {
  SearchParamRegistry,
  SearchParamType,
  generateSearchSql,
} from "../functions/fhir/search_parameter.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";

// ---------------------------------------------------------------------------
// Helpers — mirrors test_resource_registry() in Rust mod tests (line ~575)
// ---------------------------------------------------------------------------

function makeTestResourceRegistry(): ResourceRegistry {
  const resourcesJson = JSON.stringify({
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "StructureDefinition",
          name: "Patient",
          type: "Patient",
          kind: "resource",
          abstract: false,
          derivation: "specialization",
          snapshot: {
            element: [
              { path: "Patient", min: 0, max: "*" },
              { path: "Patient.name", min: 0, max: "*", type: [{ code: "HumanName" }] },
              { path: "Patient.birthDate", min: 0, max: "1", type: [{ code: "date" }] },
              { path: "Patient.gender", min: 0, max: "1", type: [{ code: "code" }] },
              { path: "Patient.identifier", min: 0, max: "*", type: [{ code: "Identifier" }] },
              { path: "Patient.contact", min: 0, max: "*", type: [{ code: "BackboneElement" }] },
              { path: "Patient.contact.name", min: 0, max: "1", type: [{ code: "HumanName" }] },
            ],
          },
        },
      },
    ],
  });

  const typesJson = JSON.stringify({
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        resource: {
          resourceType: "StructureDefinition",
          name: "HumanName",
          type: "HumanName",
          kind: "complex-type",
          abstract: false,
          derivation: "specialization",
          snapshot: {
            element: [
              { path: "HumanName", min: 0, max: "*" },
              { path: "HumanName.family", min: 0, max: "1", type: [{ code: "string" }] },
              { path: "HumanName.given", min: 0, max: "*", type: [{ code: "string" }] },
            ],
          },
        },
      },
    ],
  });

  const definitions = DefinitionRegistry.loadFromJson(resourcesJson, typesJson);
  return ResourceRegistry.withDefinitions(definitions);
}

// ---------------------------------------------------------------------------
// Rust test: test_parse_prefix (line ~508)
// ---------------------------------------------------------------------------

// parse_prefix is private; we test it indirectly via generateDateCondition / generateNumberCondition.
// The Rust test checked ("", "2020-01-01"), ("ge","2020-01-01"), ("lt","100"), ("","exact").
// We verify those by checking that the SQL operators are correct.

Deno.test("parse_prefix: plain date has no prefix", () => {
  // ("", "2020-01-01") → no prefix → eq
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "birthdate",
        type: "date",
        expression: "Patient.birthDate",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { birthdate: "2020-01-01" });
  assert(sql.includes("= '2020-01-01'"), `Expected = '2020-01-01', got: ${sql}`);
});

Deno.test("parse_prefix: ge prefix on date", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "birthdate",
        type: "date",
        expression: "Patient.birthDate",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { birthdate: "ge2020-01-01" });
  assert(sql.includes(">= '2020-01-01'"), `Expected >= '2020-01-01', got: ${sql}`);
});

Deno.test("parse_prefix: lt prefix on number", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "value-quantity",
        type: "number",
        expression: "Observation.value",
        base: ["Observation"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Observation", { "value-quantity": "lt100" });
  assert(sql.includes("< 100"), `Expected < 100, got: ${sql}`);
});

Deno.test("parse_prefix: 'exact' is not a prefix (no digit follows)", () => {
  // "exact" → prefix="" value="exact" → eq condition (string equality attempted but parsed as a string value)
  // We verify that the string-type search uses 'exact' as the literal value (no prefix stripped).
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "name",
        type: "string",
        expression: "Patient.name",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  // "exact" as a value (not as :exact modifier)
  const sql = generateSearchSql(sp, rr, "Patient", { name: "exact" });
  // Rust parse_prefix("exact") → ("", "exact")
  // Then generate_string_condition with modifier=None → LIKE 'exact%'
  assert(sql.includes("LIKE 'exact%'"), `Expected LIKE 'exact%', got: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_fhirpath_to_json_path (line ~516)
// ---------------------------------------------------------------------------

// fhirpath_to_json_path is private; tested indirectly via SQL output.
// We test the four cases from the Rust test by checking SQL json_path strings.

Deno.test("fhirpath_to_json_path: Patient.name.family → $.name.family", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { family: "Smith" });
  assert(sql.includes("$.name.family"), `Expected $.name.family, got: ${sql}`);
});

Deno.test("fhirpath_to_json_path: Patient.birthDate → $.birthDate", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "birthdate",
        type: "date",
        expression: "Patient.birthDate",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { birthdate: "2020-01-01" });
  assert(sql.includes("$.birthDate"), `Expected $.birthDate, got: ${sql}`);
});

Deno.test("fhirpath_to_json_path: ofType() segments are stripped → $.value", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "value-quantity",
        type: "quantity",
        expression: "Observation.value.as(Quantity)",
        base: ["Observation"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Observation", { "value-quantity": "5.4" });
  assert(sql.includes("$.value.value"), `Expected $.value.value in: ${sql}`);
});

Deno.test("fhirpath_to_json_path: pipe alternatives — first only (Patient.name)", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "name",
        type: "string",
        expression: "Patient.name | Practitioner.name",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { name: "Smith" });
  assert(sql.includes("$.name"), `Expected $.name, got: ${sql}`);
  assert(!sql.includes("Practitioner"), `Should not contain Practitioner: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_string_condition (line ~536)
// ---------------------------------------------------------------------------

Deno.test("string_condition: default is prefix match (LIKE 'smith%')", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { family: "Smith" });
  assert(sql.includes("LIKE 'smith%'"), `Expected LIKE 'smith%', got: ${sql}`);
});

Deno.test("string_condition: :exact modifier uses = 'Smith'", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { "family:exact": "Smith" });
  assert(sql.includes("= 'Smith'"), `Expected = 'Smith', got: ${sql}`);
});

Deno.test("string_condition: :contains modifier uses LIKE '%mith%'", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { "family:contains": "mith" });
  assert(sql.includes("LIKE '%mith%'"), `Expected LIKE '%mith%', got: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_token_condition_system_code (line ~548)
// ---------------------------------------------------------------------------

Deno.test("token_condition: system|code — contains both system and code", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "identifier",
        type: "token",
        expression: "Patient.identifier",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { identifier: "urn:oid:1.2.3.4|12345" });
  assert(sql.includes("urn:oid:1.2.3.4"), `Missing system: ${sql}`);
  assert(sql.includes("12345"), `Missing code: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_token_condition_code_only (line ~555)
// ---------------------------------------------------------------------------

Deno.test("token_condition: bare code (no pipe) — contains value", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "status",
        type: "token",
        expression: "Patient.status",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { status: "active" });
  assert(sql.includes("active"), `Missing 'active': ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_date_condition (line ~560)
// ---------------------------------------------------------------------------

Deno.test("date_condition: ge prefix → >= '2000-01-01'", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "birthdate",
        type: "date",
        expression: "Patient.birthDate",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { birthdate: "ge2000-01-01" });
  assert(sql.includes(">= '2000-01-01'"), `Expected >= '2000-01-01', got: ${sql}`);
});

Deno.test("date_condition: no prefix → = '2020-06-15'", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "birthdate",
        type: "date",
        expression: "Patient.birthDate",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { birthdate: "2020-06-15" });
  assert(sql.includes("= '2020-06-15'"), `Expected = '2020-06-15', got: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_reference_condition (line ~570)
// ---------------------------------------------------------------------------

Deno.test("reference_condition: contains Patient/123 in exact and suffix match", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "subject",
        type: "reference",
        expression: "Observation.subject",
        base: ["Observation"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Observation", { subject: "Patient/123" });
  assert(sql.includes("Patient/123"), `Missing Patient/123: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_find_array_segments_name_family (line ~635)
// ---------------------------------------------------------------------------

Deno.test("find_array_segments: Patient.name is array (index 0)", () => {
  const rr = makeTestResourceRegistry();
  // Smoke-test via generateSearchSql with a name search param
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const sql = generateSearchSql(sp, rr, "Patient", { family: "smith" });
  // Should produce an EXISTS/json_each condition because Patient.name is an array
  assert(sql.startsWith("EXISTS"), `Expected EXISTS, got: ${sql}`);
  assert(sql.includes("json_each"), `Expected json_each: ${sql}`);
  assert(sql.includes("_arr0.value"), `Expected _arr0.value: ${sql}`);
  assert(sql.includes("$.family"), `Expected $.family: ${sql}`);
  assert(sql.includes("smith%"), `Expected smith%: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_find_array_segments_no_arrays (line ~643)
// ---------------------------------------------------------------------------

Deno.test("find_array_segments: Patient.birthDate is not array — no EXISTS", () => {
  const rr = makeTestResourceRegistry();
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "birthdate",
        type: "date",
        expression: "Patient.birthDate",
        base: ["Patient"],
      },
    }],
  }));
  const sql = generateSearchSql(sp, rr, "Patient", { birthdate: "2000-01-01" });
  assert(!sql.includes("EXISTS"), `Expected no EXISTS, got: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_build_array_condition_string (line ~651)
// ---------------------------------------------------------------------------

Deno.test("build_array_condition: name.family produces correct EXISTS structure", () => {
  const rr = makeTestResourceRegistry();
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const sql = generateSearchSql(sp, rr, "Patient", { family: "smith" });
  assert(sql.includes("json_each"), `Missing json_each: ${sql}`);
  assert(sql.includes("_arr0.value"), `Missing _arr0.value: ${sql}`);
  assert(sql.includes("$.family"), `Missing $.family: ${sql}`);
  assert(sql.includes("smith%"), `Missing smith%: ${sql}`);
  assert(sql.startsWith("EXISTS"), `Should start with EXISTS: ${sql}`);
});

// ---------------------------------------------------------------------------
// Rust test: test_array_condition_fallback_no_definitions (line ~669)
// ---------------------------------------------------------------------------

Deno.test("find_array_segments: no definitions → empty result → no EXISTS wrap", () => {
  const rr = ResourceRegistry.empty();
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "family",
        type: "string",
        expression: "Patient.name.family",
        base: ["Patient"],
      },
    }],
  }));
  const sql = generateSearchSql(sp, rr, "Patient", { family: "smith" });
  // No definitions → no array detection → plain string condition (no EXISTS)
  assert(!sql.includes("EXISTS"), `Expected no EXISTS, got: ${sql}`);
});

// ---------------------------------------------------------------------------
// Additional: unknown param throws
// ---------------------------------------------------------------------------

Deno.test("generateSearchSql: unknown param throws", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [],
  }));
  const rr = ResourceRegistry.empty();
  assertThrows(
    () => generateSearchSql(sp, rr, "Patient", { unknown: "x" }),
    Error,
    "Unknown search parameter",
  );
});

// ---------------------------------------------------------------------------
// Additional: _ params are skipped
// ---------------------------------------------------------------------------

Deno.test("generateSearchSql: _ params are skipped", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { _count: "10" });
  assertEquals(sql, "");
});

// ---------------------------------------------------------------------------
// Additional: empty params → empty string
// ---------------------------------------------------------------------------

Deno.test("generateSearchSql: no params returns empty string", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [],
  }));
  const rr = ResourceRegistry.empty();
  assertEquals(generateSearchSql(sp, rr, "Patient", {}), "");
});

// ---------------------------------------------------------------------------
// Additional: Composite/Special are skipped (no error)
// ---------------------------------------------------------------------------

Deno.test("generateSearchSql: composite and special param types are skipped", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [
      {
        resource: {
          resourceType: "SearchParameter",
          code: "component",
          type: "composite",
          expression: "Observation.component",
          base: ["Observation"],
        },
      },
      {
        resource: {
          resourceType: "SearchParameter",
          code: "near",
          type: "special",
          expression: "Location.position",
          base: ["Location"],
        },
      },
    ],
  }));
  const rr = ResourceRegistry.empty();
  assertEquals(generateSearchSql(sp, rr, "Observation", { component: "x" }), "");
  assertEquals(generateSearchSql(sp, rr, "Location", { near: "y" }), "");
});

// ---------------------------------------------------------------------------
// Token: |code (pipe-code-only) — system empty, code non-empty
// Rust generate_token_condition: system.is_empty() branch →
//   "json_extract_string(_raw, '{path}.code') = '{code}' OR
//    EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '{path}.coding')) AS c
//            WHERE json_extract_string(c.value, '$.code') = '{code}')"
// ---------------------------------------------------------------------------

Deno.test("token_condition: |code (pipe-code-only) — matches Rust system-empty branch", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "identifier",
        type: "token",
        expression: "Patient.identifier",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { identifier: "|ABC" });
  // Must reference .code with value 'ABC' and NOT mention .system
  assertEquals(
    sql,
    "json_extract_string(_raw, '$.identifier.code') = 'ABC' OR " +
    "EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '$.identifier.coding')) AS c " +
    "WHERE json_extract_string(c.value, '$.code') = 'ABC')",
    `Unexpected SQL: ${sql}`,
  );
});

// ---------------------------------------------------------------------------
// Token: system| (system-only) — system non-empty, code empty
// Rust generate_token_condition: code.is_empty() branch →
//   "json_extract_string(_raw, '{path}.system') = '{system}' OR
//    EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '{path}.coding')) AS c
//            WHERE json_extract_string(c.value, '$.system') = '{system}')"
// ---------------------------------------------------------------------------

Deno.test("token_condition: system| (system-only) — matches Rust code-empty branch", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "identifier",
        type: "token",
        expression: "Patient.identifier",
        base: ["Patient"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(sp, rr, "Patient", { identifier: "http://example.com|" });
  // Must reference .system with value 'http://example.com' and NOT mention .code
  assertEquals(
    sql,
    "json_extract_string(_raw, '$.identifier.system') = 'http://example.com' OR " +
    "EXISTS (SELECT 1 FROM json_each(json_extract(_raw, '$.identifier.coding')) AS c " +
    "WHERE json_extract_string(c.value, '$.system') = 'http://example.com')",
    `Unexpected SQL: ${sql}`,
  );
});

// ---------------------------------------------------------------------------
// Quantity: splitn(3) — value with 4+ pipe segments; 3rd part absorbs remainder
// Rust splitn(3, '|') on "100|http://unitsofmeasure.org|mg/dL|extra" →
//   parts = ["100", "http://unitsofmeasure.org", "mg/dL|extra"]
// The code segment embedded in SQL must be "mg/dL|extra", not just "mg/dL".
// ---------------------------------------------------------------------------

Deno.test("quantity_condition: splitn(3) — 4-pipe value produces code = 'mg/dL|extra'", () => {
  const sp = SearchParamRegistry.loadFromJson(JSON.stringify({
    resourceType: "Bundle",
    entry: [{
      resource: {
        resourceType: "SearchParameter",
        code: "value-quantity",
        type: "quantity",
        expression: "Observation.valueQuantity",
        base: ["Observation"],
      },
    }],
  }));
  const rr = ResourceRegistry.empty();
  const sql = generateSearchSql(
    sp, rr, "Observation",
    { "value-quantity": "100|http://unitsofmeasure.org|mg/dL|extra" },
  );
  // The third part must be "mg/dL|extra" (pipe joined), not "mg/dL"
  assert(
    sql.includes("= 'mg/dL|extra'"),
    `Expected code = 'mg/dL|extra' but got: ${sql}`,
  );
  assert(
    !sql.includes("= 'mg/dL'") || sql.includes("= 'mg/dL|extra'"),
    `Code segment must not be plain 'mg/dL': ${sql}`,
  );
  assert(sql.includes("= 'http://unitsofmeasure.org'"), `Missing system: ${sql}`);
});

// ---------------------------------------------------------------------------
// Integration test: loadDefault has Patient.name as string param
// ---------------------------------------------------------------------------

Deno.test("loadDefault has Patient.name as string param", async () => {
  const sp = await SearchParamRegistry.loadDefault();
  const def = sp.get("Patient", "name");
  assert(def !== undefined);
});
