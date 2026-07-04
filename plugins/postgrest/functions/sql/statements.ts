// Ports src/PostgREST/Query/Statements.hs (PostgREST v12.2.3) — the read
// side: the mainRead statement wrapper (prepareRead) and the row decoding
// into ResultSet, plus the EXPLAIN plan-rows statement (preparePlanRows).
//
// Deviation from upstream: the body aggregation is wrapped in `(...)::text`
// so node-postgres returns the body as raw text — Hasql decodes the json
// column as bytes (HD.bytea), but node-postgres would parse json columns
// into JS objects and re-serialization would not be byte-faithful.

import type { QueryResult } from "pg";
import { internalError } from "../errors.ts";
import type { MediaHandler } from "../plan/types.ts";
import { countF, explainF, handlerF, responseHeadersF, responseStatusF, sourceCTE } from "./fragment.ts";
import { snip, Snippet } from "./builder.ts";

/** Statements.hs ResultSet (RSStandard; RSPlan is deferred to phase 8). */
export interface ResultSet {
  /** Count of all the table rows (total_result_set). */
  rsTableTotal: number | null;
  /** Count of the query rows (page_total). */
  rsQueryTotal: number;
  /** The aggregated body of the query. */
  rsBody: string;
  /** The HTTP headers to be added to the response (response.headers GUC). */
  rsGucHeaders: string | null;
  /** The HTTP status to be added to the response (response.status GUC). */
  rsGucStatus: string | null;
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
    rsBody: row.body ?? "",
    rsGucHeaders: row.response_headers,
    rsGucStatus: row.response_status,
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
