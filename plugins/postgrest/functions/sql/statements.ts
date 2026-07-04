// Ports src/PostgREST/Query/Statements.hs (PostgREST v12.2.3): the mainRead
// statement wrapper (prepareRead), the mutation wrapper (prepareWrite), the
// row decoding into ResultSet and the EXPLAIN plan-rows statement
// (preparePlanRows).
//
// Deviation from upstream: the body aggregation is wrapped in `(...)::text`
// so node-postgres returns the body as raw text — Hasql decodes the json
// column as bytes (HD.bytea), but node-postgres would parse json columns
// into JS objects and re-serialization would not be byte-faithful.

import type { QueryResult } from "pg";
import { internalError } from "../errors.ts";
import type { MediaHandler } from "../plan/types.ts";
import type { PreferRepresentation, PreferResolution } from "../parse/preferences.ts";
import {
  countF,
  explainF,
  handlerF,
  locationF,
  noLocationF,
  responseHeadersF,
  responseStatusF,
  sourceCTE,
} from "./fragment.ts";
import { snip, Snippet } from "./builder.ts";

/** Statements.hs ResultSet (RSStandard; RSPlan is deferred to phase 8). */
export interface ResultSet {
  /** Count of all the table rows (total_result_set). */
  rsTableTotal: number | null;
  /** Count of the query rows (page_total). */
  rsQueryTotal: number;
  /** The Location header (only used for inserts): a list of key/value
   * bindings like ["k1", "eq.42"], or empty when there is no location. */
  rsLocation: [string, string][];
  /** The aggregated body of the query. */
  rsBody: string;
  /** The HTTP headers to be added to the response (response.headers GUC). */
  rsGucHeaders: string | null;
  /** The HTTP status to be added to the response (response.status GUC). */
  rsGucStatus: string | null;
  /** The number of rows inserted (only used for upserts / PUT). */
  rsInserted: number | null;
}

/**
 * Statements.hs prepareWrite — the mutation statement wrapper: the mutation
 * runs as the pgrst_source CTE and the outer select aggregates the RETURNING
 * rows (page_total / Location header bindings / body / GUCs / the
 * pgrst.inserted counter for upserts and PUT).
 */
export function prepareWrite(
  selectQuery: Snippet,
  mutateQuery: Snippet,
  isInsert: boolean,
  isPut: boolean,
  handler: MediaHandler,
  rep: PreferRepresentation | null,
  resolution: PreferResolution | null,
  pKeys: string[],
): Snippet {
  const checkUpsert = (s: Snippet): Snippet => (isInsert && (isPut || resolution === "MergeDuplicates") ? s : snip("''"));
  const pgrstInsertedF = checkUpsert(snip("nullif(current_setting('pgrst.inserted', true),'')::int"));

  const locF = isInsert && rep === "HeadersOnly"
    ? snip(
      "CASE WHEN pg_catalog.count(_postgrest_t) = 1 ",
      "THEN coalesce(",
      locationF(pKeys),
      ", ",
      noLocationF,
      ") ",
      "ELSE ",
      noLocationF,
      " ",
      "END",
    )
    : noLocationF;

  // prevent using any of the column names in ?select= when no response is returned from the CTE
  const selectF = handler.kind === "NoAgg" ? snip("SELECT * FROM ", sourceCTE) : selectQuery;

  return snip(
    "WITH ",
    sourceCTE,
    " AS (",
    mutateQuery,
    ") ",
    "SELECT ",
    "'' AS total_result_set, ",
    "pg_catalog.count(_postgrest_t) AS page_total, ",
    locF,
    " AS header, ",
    "(",
    handlerF(handler),
    ")::text AS body, ",
    responseHeadersF,
    " AS response_headers, ",
    responseStatusF,
    " AS response_status, ",
    pgrstInsertedF,
    " AS response_inserted ",
    "FROM (",
    selectF,
    ") _postgrest_t",
  );
}

/** Statements.hs prepareRead — the mainRead statement wrapper. */
export function prepareRead(
  selectQuery: Snippet,
  countQuery: Snippet,
  countTotal: boolean,
  handler: MediaHandler,
): Snippet {
  const [countCTEF, countResultF] = countF(countQuery, countTotal);
  return snip(
    "WITH ",
    sourceCTE,
    " AS ( ",
    selectQuery,
    " ) ",
    countCTEF,
    " ",
    "SELECT ",
    countResultF,
    " AS total_result_set, ",
    "pg_catalog.count(_postgrest_t) AS page_total, ",
    "(",
    handlerF(handler),
    ")::text AS body, ",
    responseHeadersF,
    " AS response_headers, ",
    responseStatusF,
    " AS response_status, ",
    "''",
    " AS response_inserted ",
    "FROM ( SELECT * FROM ",
    sourceCTE,
    " ) _postgrest_t",
  );
}

/** Statements.hs preparePlanRows — EXPLAIN (FORMAT JSON) over the count query. */
export function preparePlanRows(countQuery: Snippet): Snippet {
  return explainF("PlanJSON", [], countQuery);
}

interface ReadRow {
  total_result_set: string | number | null;
  page_total: string | number;
  body: string | null;
  response_headers: string | null;
  response_status: string | null;
}

/** Statements.hs standardRow decoding (HD.singleRow — exactly one row). */
export function decodeReadResult(res: QueryResult): ResultSet {
  if (res.rows.length !== 1) {
    throw internalError(`read statement returned ${res.rows.length} rows, expected 1`);
  }
  const row = res.rows[0] as ReadRow;
  return {
    rsTableTotal: row.total_result_set === null ? null : Number(row.total_result_set),
    rsQueryTotal: Number(row.page_total),
    rsLocation: [],
    rsBody: row.body ?? "",
    rsGucHeaders: row.response_headers,
    rsGucStatus: row.response_status,
    rsInserted: null,
  };
}

interface WriteRow extends ReadRow {
  header: string[] | string | null;
  response_inserted: string | number | null;
}

/** Statements.hs splitKeyValue — "k=eq.42" → ["k", "eq.42"]. */
function splitKeyValue(kv: string): [string, string] {
  const eq = kv.indexOf("=");
  if (eq === -1) return [kv, ""];
  return [kv.slice(0, eq), kv.slice(eq + 1)];
}

/** Minimal pg text-array parser for the header text[] column, in case the
 * driver hands the value through unparsed. */
function parseTextArray(raw: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  let hasField = false;
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (quoted) {
      if (c === "\\") {
        field += raw[++i];
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
      hasField = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
      hasField = false;
    } else {
      field += c;
      hasField = true;
    }
  }
  if (hasField || out.length > 0) out.push(field);
  return out;
}

/**
 * Statements.hs prepareWrite decoding (HD.rowMaybe + the RSStandard default).
 * The `''` filler columns decode like Hasql/postgresql-binary: total ''
 * behaves as no count; response_inserted '' folds to int 0 (which is what
 * makes plain inserts respond 201 upstream); NULL stays null.
 */
export function decodeWriteResult(res: QueryResult): ResultSet {
  if (res.rows.length === 0) {
    return {
      rsTableTotal: null,
      rsQueryTotal: 0,
      rsLocation: [],
      rsBody: "",
      rsGucHeaders: null,
      rsGucStatus: null,
      rsInserted: null,
    };
  }
  const row = res.rows[0] as WriteRow;
  const header = row.header === null
    ? []
    : typeof row.header === "string"
    ? parseTextArray(row.header)
    : row.header;
  return {
    rsTableTotal: row.total_result_set === null || row.total_result_set === "" ? null : Number(row.total_result_set),
    rsQueryTotal: Number(row.page_total),
    rsLocation: header.map(splitKeyValue),
    rsBody: row.body ?? "",
    rsGucHeaders: row.response_headers,
    rsGucStatus: row.response_status,
    rsInserted: row.response_inserted === null ? null : row.response_inserted === "" ? 0 : Number(row.response_inserted),
  };
}

/**
 * Statements.hs preparePlanRows decoding: the first plan's "Plan Rows".
 * node-postgres parses the json column, so the value arrives as objects.
 */
export function decodePlanRows(res: QueryResult): number | null {
  const plan = (res.rows[0] as Record<string, unknown>)?.["QUERY PLAN"];
  if (!Array.isArray(plan)) return null;
  const rows = (plan[0] as { Plan?: { "Plan Rows"?: unknown } } | undefined)?.Plan?.["Plan Rows"];
  return typeof rows === "number" ? rows : null;
}
