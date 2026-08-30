// @ts-nocheck
// Tests for functions/handlers/search.ts
// Transcribed from search.rs #[cfg(test)] + handler tests with fake Conn.

import { assertEquals, assertRejects } from "std/assert/mod.ts";
import {
  parsePaginationParams,
  buildSearchSuffix,
  buildSearchLinks,
  searchResources,
} from "../functions/handlers/search.ts";
import { FhirError } from "../functions/error.ts";
import { SearchParamRegistry } from "../functions/fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Helpers: minimal AppState + fake Conn
// ---------------------------------------------------------------------------

function makeState(knownTypes: string[] = ["Patient", "Observation"]): {
  registry: any;
  searchParams: any;
  dbName: string;
} {
  const registry = {
    isKnownResourceType(rt: string): boolean {
      return knownTypes.includes(rt);
    },
    definitions(): undefined {
      return undefined;
    },
  } as any;
  const searchParams = SearchParamRegistry.loadFromJson(
    JSON.stringify({ resourceType: "Bundle", entry: [] }),
  );
  return { registry, searchParams, dbName: "memory" };
}

/** A fake Conn that records SQL calls and returns configurable row sequences. */
function makeFakeConn(responses: Map<string | RegExp, any[]>): {
  conn: any;
  calls: { sql: string; params: unknown[] }[];
} {
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      for (const [key, rows] of responses.entries()) {
        if (typeof key === "string") {
          if (sql.includes(key)) return rows;
        } else {
          if (key.test(sql)) return rows;
        }
      }
      return [];
    },
  };
  return { conn, calls };
}

// ---------------------------------------------------------------------------
// parsePaginationParams — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("parsePaginationParams_defaults", () => {
  assertEquals(parsePaginationParams({}), [100, 0]);
});

Deno.test("parsePaginationParams_caps_count_at_1000", () => {
  assertEquals(parsePaginationParams({ _count: "5000", _offset: "200" }), [1000, 200]);
});

Deno.test("parsePaginationParams_uses_defaults_on_invalid_values", () => {
  assertEquals(parsePaginationParams({ _count: "abc", _offset: "xyz" }), [100, 0]);
});

Deno.test("parsePaginationParams_accepts_valid_values", () => {
  assertEquals(parsePaginationParams({ _count: "25", _offset: "50" }), [25, 50]);
});

// ---------------------------------------------------------------------------
// buildSearchSuffix — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("buildSearchSuffix_empty_when_only_control_params", () => {
  assertEquals(buildSearchSuffix({ _count: "10", _offset: "0" }), "");
});

Deno.test("buildSearchSuffix_includes_non_control_params", () => {
  const s = buildSearchSuffix({ _count: "10", name: "Smith" });
  assertEquals(s.startsWith("&"), true);
  assertEquals(s.includes("name=Smith"), true);
  assertEquals(s.includes("_count"), false);
});

// ---------------------------------------------------------------------------
// buildSearchLinks — port of Rust tests
// ---------------------------------------------------------------------------

Deno.test("buildSearchLinks_self_only_when_no_more_no_offset", () => {
  const links = buildSearchLinks("d1", "Patient", 10, 0, false, "");
  assertEquals(links.length, 1);
  assertEquals((links[0] as any).relation, "self");
  assertEquals((links[0] as any).url, "/d1/Patient?_count=10&_offset=0");
});

Deno.test("buildSearchLinks_include_next_when_has_more", () => {
  const links = buildSearchLinks("d1", "Patient", 10, 0, true, "");
  assertEquals(links.length, 2);
  assertEquals((links[1] as any).relation, "next");
  assertEquals((links[1] as any).url, "/d1/Patient?_count=10&_offset=10");
});

Deno.test("buildSearchLinks_include_previous_when_offset_positive", () => {
  const links = buildSearchLinks("d1", "Patient", 10, 20, false, "");
  assertEquals(links.length, 2);
  assertEquals((links[1] as any).relation, "previous");
  assertEquals((links[1] as any).url, "/d1/Patient?_count=10&_offset=10");
});

Deno.test("buildSearchLinks_previous_clamped_to_zero", () => {
  const links = buildSearchLinks("d1", "Patient", 10, 5, false, "");
  assertEquals((links[1] as any).relation, "previous");
  assertEquals((links[1] as any).url, "/d1/Patient?_count=10&_offset=0");
});

Deno.test("buildSearchLinks_self_next_previous_with_suffix", () => {
  const links = buildSearchLinks("d1", "Patient", 10, 20, true, "&name=Smith");
  assertEquals(links.length, 3);
  const urls = links.map((l) => (l as any).url as string);
  assertEquals(urls[0].endsWith("&name=Smith"), true);
  assertEquals(urls[1].endsWith("&name=Smith"), true);
  assertEquals(urls[2].endsWith("&name=Smith"), true);
});

// ---------------------------------------------------------------------------
// searchResources handler — fake Conn
// ---------------------------------------------------------------------------

Deno.test("searchResources_returns_searchset_bundle_with_two_entries", async () => {
  const state = makeState(["Patient"]);

  // Two _raw rows (data query returns count+1 check — here exactly 2 so hasMore=false)
  const rawRow1 = JSON.stringify({ resourceType: "Patient", id: "p1" });
  const rawRow2 = JSON.stringify({ resourceType: "Patient", id: "p2" });

  const responses = new Map<string | RegExp, any[]>([
    // Count query matched by "AS cnt"
    ["AS cnt", [{ cnt: "2" }]],
    // Data query matched by "SELECT _raw"
    ["SELECT _raw", [{ _raw: rawRow1 }, { _raw: rawRow2 }]],
  ]);

  const { conn, calls } = makeFakeConn(responses);
  const query = { _count: "10", _offset: "0" };

  const res = await searchResources("ds1", "Patient", query, conn, state);
  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.resourceType, "Bundle");
  assertEquals(body.type, "searchset");
  assertEquals(body.total, 2);
  assertEquals(body.entry.length, 2);
  assertEquals(body.entry[0].fullUrl, "Patient/p1");
  assertEquals(body.entry[0].resource.id, "p1");
  assertEquals(body.entry[0].search.mode, "match");
  assertEquals(body.entry[1].fullUrl, "Patient/p2");
  assertEquals(body.entry[1].resource.id, "p2");

  // Verify SQL strings
  const countCall = calls.find((c) => c.sql.includes("AS cnt"));
  const dataCall = calls.find((c) => c.sql.includes("SELECT _raw"));
  assertEquals(countCall !== undefined, true);
  assertEquals(dataCall !== undefined, true);

  // Count SQL uses AS cnt alias
  assertEquals(countCall!.sql.includes("COUNT(*)::VARCHAR AS cnt"), true);
  // Data SQL uses LIMIT count+1 (10+1=11)
  assertEquals(dataCall!.sql.includes("LIMIT 11"), true);
  assertEquals(dataCall!.sql.includes("OFFSET 0"), true);
});

Deno.test("searchResources_hasMore_true_when_rows_exceed_count", async () => {
  const state = makeState(["Patient"]);

  // Return count+1 rows (2 rows with _count=1 → hasMore)
  const rawRow1 = JSON.stringify({ resourceType: "Patient", id: "a" });
  const rawRow2 = JSON.stringify({ resourceType: "Patient", id: "b" });

  const responses = new Map<string | RegExp, any[]>([
    ["AS cnt", [{ cnt: "50" }]],
    ["SELECT _raw", [{ _raw: rawRow1 }, { _raw: rawRow2 }]],
  ]);

  const { conn } = makeFakeConn(responses);
  const res = await searchResources("ds1", "Patient", { _count: "1" }, conn, state);
  const body = await res.json();

  // hasMore=true → next link present
  const nextLink = body.link.find((l: any) => l.relation === "next");
  assertEquals(nextLink !== undefined, true);
  // Only 1 entry (slice to count=1)
  assertEquals(body.entry.length, 1);
  assertEquals(body.entry[0].fullUrl, "Patient/a");
});

Deno.test("searchResources_where_clause_no_search_params", async () => {
  const state = makeState(["Patient"]);

  const responses = new Map<string | RegExp, any[]>([
    ["AS cnt", [{ cnt: "0" }]],
    ["SELECT _raw", []],
  ]);

  const { conn, calls } = makeFakeConn(responses);
  await searchResources("ds1", "Patient", {}, conn, state);

  const dataCall = calls.find((c) => c.sql.includes("SELECT _raw"));
  // No search params → whereClause is just NOT _is_deleted
  assertEquals(dataCall!.sql.includes("WHERE NOT _is_deleted"), true);
});

Deno.test("searchResources_unknown_search_param_throws_400", async () => {
  const state = makeState(["Patient"]);
  const responses = new Map<string | RegExp, any[]>();
  const { conn } = makeFakeConn(responses);

  await assertRejects(
    () => searchResources("ds1", "Patient", { unknownParam: "x" }, conn, state),
    FhirError,
  );

  // Verify status code is 400
  try {
    await searchResources("ds1", "Patient", { unknownParam: "x" }, conn, state);
  } catch (e) {
    if (e instanceof FhirError) {
      assertEquals(e.status, 400);
    }
  }
});

Deno.test("searchResources_table_error_throws_404", async () => {
  const state = makeState(["Patient"]);

  const conn = {
    async query(sql: string) {
      throw new Error("table does not exist");
    },
  };

  await assertRejects(
    () => searchResources("ds1", "Patient", {}, conn, state),
    FhirError,
  );

  try {
    await searchResources("ds1", "Patient", {}, conn, state);
  } catch (e) {
    if (e instanceof FhirError) {
      assertEquals(e.status, 404);
    }
  }
});

Deno.test("searchResources_count_sql_uses_as_cnt_alias", async () => {
  const state = makeState(["Patient"]);

  const responses = new Map<string | RegExp, any[]>([
    ["AS cnt", [{ cnt: "3" }]],
    ["SELECT _raw", []],
  ]);

  const { conn, calls } = makeFakeConn(responses);
  await searchResources("ds1", "Patient", {}, conn, state);

  const countCall = calls.find((c) => c.sql.includes("COUNT"));
  assertEquals(countCall !== undefined, true);
  assertEquals(countCall!.sql.includes("COUNT(*)::VARCHAR AS cnt"), true);
  // Total parsed correctly from cnt column
  const res = await (async () => {
    const { conn: c2 } = makeFakeConn(new Map([
      ["AS cnt", [{ cnt: "3" }]],
      ["SELECT _raw", []],
    ]));
    return await searchResources("ds1", "Patient", {}, c2, state);
  })();
  const body = await res.json();
  assertEquals(body.total, 3);
});
