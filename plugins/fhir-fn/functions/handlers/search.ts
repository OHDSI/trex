// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/handlers/search.rs

import { Conn } from "../db.ts";
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";
import {
  validateDatasetId,
  validateResourceType,
  toQualifiedSchema,
} from "../sql_safety.ts";
import { ResourceRegistry } from "../fhir/resource_registry.ts";
import { generateSearchSql } from "../fhir/search_parameter.ts";

// ---------------------------------------------------------------------------
// Pure helpers (port of search.rs pure fns)
// ---------------------------------------------------------------------------

/**
 * Parse `_count` (max 1000, default 100) and `_offset` (default 0) from search params.
 * Mirrors Rust: parse_pagination_params
 */
export function parsePaginationParams(
  params: Record<string, string>,
): [number, number] {
  const countRaw = params["_count"];
  const offsetRaw = params["_offset"];

  // Mirrors Rust: .and_then(|v| v.parse::<usize>().ok()) — only pure integer strings parse
  function parseUsize(s: string | undefined, def: number): number {
    if (s === undefined) return def;
    // Rust's usize::from_str accepts only digit strings (no leading +/- for usize)
    if (!/^\d+$/.test(s)) return def;
    const n = parseInt(s, 10);
    return isNaN(n) ? def : n;
  }

  const count = Math.min(parseUsize(countRaw, 100), 1000);
  const offset = parseUsize(offsetRaw, 0);

  return [count, offset];
}

/**
 * Build the `&key=value` suffix from non-FHIR-control search params (those not starting with `_`).
 * Mirrors Rust: build_search_suffix
 */
export function buildSearchSuffix(params: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!k.startsWith("_")) {
      parts.push(`${k}=${v}`);
    }
  }
  if (parts.length === 0) return "";
  return `&${parts.join("&")}`;
}

/**
 * Build the `link` array (self + optional next + optional previous).
 * Mirrors Rust: build_search_links
 */
export function buildSearchLinks(
  datasetId: string,
  resourceType: string,
  count: number,
  offset: number,
  hasMore: boolean,
  searchSuffix: string,
): unknown[] {
  const link: unknown[] = [
    {
      relation: "self",
      url: `/${datasetId}/${resourceType}?_count=${count}&_offset=${offset}${searchSuffix}`,
    },
  ];

  if (hasMore) {
    link.push({
      relation: "next",
      url: `/${datasetId}/${resourceType}?_count=${count}&_offset=${offset + count}${searchSuffix}`,
    });
  }

  if (offset > 0) {
    const prevOffset = offset > count ? offset - count : 0;
    link.push({
      relation: "previous",
      url: `/${datasetId}/${resourceType}?_count=${count}&_offset=${prevOffset}${searchSuffix}`,
    });
  }

  return link;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Search resources — returns a FHIR searchset Bundle.
 * Mirrors Rust: search_resources
 */
export async function searchResources(
  datasetId: string,
  resourceType: string,
  query: Record<string, string>,
  conn: Conn,
  state: AppState,
): Promise<Response> {
  validateDatasetId(datasetId);
  validateResourceType(resourceType, state.registry);

  const schema = toQualifiedSchema(state.dbName, datasetId);
  const table = ResourceRegistry.tableName(resourceType);

  const [count, offset] = parsePaginationParams(query);

  // generateSearchSql throws on unknown params — wrap as 400 (mirrors Rust .map_err(AppError::BadRequest))
  let searchWhere: string;
  try {
    searchWhere = generateSearchSql(state.searchParams, state.registry, resourceType, query);
  } catch (e) {
    throw FhirError.badRequest(String(e));
  }

  const whereClause = searchWhere === ""
    ? "NOT _is_deleted"
    : `NOT _is_deleted AND (${searchWhere})`;

  // Fetch count+1 rows to detect hasMore (mirrors Rust LIMIT count+1)
  const dataSql =
    `SELECT _raw FROM ${schema}."${table}" WHERE ${whereClause} LIMIT ${count + 1} OFFSET ${offset}`;
  const countSql =
    `SELECT COUNT(*)::VARCHAR AS cnt FROM ${schema}."${table}" WHERE ${whereClause}`;

  // Execute count query
  let total = 0;
  try {
    const countRows = await conn.query(countSql);
    const firstRow = countRows?.[0];
    if (firstRow !== undefined) {
      const cntVal = firstRow.cnt ?? firstRow.column0 ?? "0";
      const parsed = parseInt(String(cntVal), 10);
      if (!isNaN(parsed)) total = parsed;
    }
  } catch (e) {
    const msg = String(e);
    if (msg.includes("does not exist") || msg.includes("Table")) {
      throw FhirError.notFound(
        `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
      );
    }
    console.error(`[fhir] Count failed: ${msg}`);
    throw FhirError.internal("Search failed");
  }

  // Execute data query
  let rows: any[];
  try {
    rows = await conn.query(dataSql);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("does not exist") || msg.includes("Table")) {
      throw FhirError.notFound(
        `Resource type '${resourceType}' not found in dataset '${datasetId}'`,
      );
    }
    console.error(`[fhir] Search failed: ${msg}`);
    throw FhirError.internal("Search failed");
  }

  const hasMore = rows.length > count;

  const entries: unknown[] = rows
    .slice(0, count)
    .flatMap((row) => {
      const rawJson: string = row._raw ?? row.column0 ?? "";
      if (rawJson === "") return [];
      let resource: Record<string, unknown>;
      try {
        resource = JSON.parse(rawJson);
      } catch {
        return [];
      }
      const id = typeof resource["id"] === "string" ? resource["id"] : "";
      return [{
        fullUrl: `${resourceType}/${id}`,
        resource,
        search: { mode: "match" },
      }];
    });

  const searchSuffix = buildSearchSuffix(query);
  const link = buildSearchLinks(datasetId, resourceType, count, offset, hasMore, searchSuffix);

  const bundle = {
    resourceType: "Bundle",
    type: "searchset",
    total,
    link,
    entry: entries,
  };

  return new Response(JSON.stringify(bundle), {
    status: 200,
    headers: { "Content-Type": "application/fhir+json" },
  });
}
