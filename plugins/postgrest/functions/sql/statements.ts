// Ports src/PostgREST/Query/Statements.hs (PostgREST v12.2.3): the mainRead
// statement wrapper (prepareRead), the mutation wrapper (prepareWrite), the
// RPC wrapper (prepareCall), the row decoding into ResultSet and the EXPLAIN
// plan-rows statement (preparePlanRows).
//
// The generated wrapper SQL is byte-identical to upstream's (PlanSpec EXPLAINs
// it, so even a stray cast shows up); the main statement always runs with raw
// type parsing (executor rawTypes) so node-postgres hands every column back
// as its wire text — upstream reads the body as raw bytes via Hasql, and
// parsing/re-serializing json here would not be byte-faithful.

import type { QueryResult } from "pg";
import { internalError } from "../errors.ts";
import type { MediaType } from "../parse/media-type.ts";
import type { MediaHandler } from "../plan/types.ts";
import type { Routine } from "../schema-cache/types.ts";
import { funcReturnsSingle } from "../schema-cache/types.ts";
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

/** Statements.hs ResultSet — the RSStandard constructor. */
export interface RSStandard {
  kind: "RSStandard";
  /** Count of all the table rows (total_result_set). */
  rsTableTotal: number | null;
  /** Count of the query rows (page_total). */
  rsQueryTotal: number;
  /** The Location header (only used for inserts): a list of key/value
   * bindings like ["k1", "eq.42"], or empty when there is no location. */
  rsLocation: [string, string][];
  /** The aggregated body of the query. Bytes when a bytea-based custom media
   * handler produced it (upstream reads every body as raw bytes). */
  rsBody: string | Uint8Array<ArrayBuffer>;
  /** The HTTP headers to be added to the response (response.headers GUC). */
  rsGucHeaders: string | null;
  /** The HTTP status to be added to the response (response.status GUC). */
  rsGucStatus: string | null;
  /** The number of rows inserted (only used for upserts / PUT). */
  rsInserted: number | null;
}

/** Statements.hs ResultSet — the RSPlan constructor (the EXPLAIN output). */
export interface RSPlan {
  kind: "RSPlan";
  rsPlan: string;
}

export type ResultSet = RSStandard | RSPlan;

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
    handlerF(null, handler),
    " AS body, ",
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
    handlerF(null, handler),
    " AS body, ",
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

/**
 * Statements.hs prepareCall — the RPC statement wrapper: the function call
 * runs as the pgrst_source CTE and the outer select aggregates the (read
 * pipeline shaped) rows. Single-returning functions report page_total = 1.
 */
export function prepareCall(
  rout: Routine,
  callProcQuery: Snippet,
  selectQuery: Snippet,
  countQuery: Snippet,
  countTotal: boolean,
  handler: MediaHandler,
): Snippet {
  const [countCTEF, countResultF] = countF(countQuery, countTotal);
  return snip(
    "WITH ",
    sourceCTE,
    " AS (",
    callProcQuery,
    ") ",
    countCTEF,
    "SELECT ",
    countResultF,
    " AS total_result_set, ",
    funcReturnsSingle(rout) ? "1" : "pg_catalog.count(_postgrest_t)",
    " AS page_total, ",
    handlerF(rout, handler),
    " AS body, ",
    responseHeadersF,
    " AS response_headers, ",
    responseStatusF,
    " AS response_status, ",
    "''",
    " AS response_inserted ",
    "FROM (",
    selectQuery,
    ") _postgrest_t",
  );
}

/** Statements.hs preparePlanRows — EXPLAIN (FORMAT JSON) over the count query. */
export function preparePlanRows(countQuery: Snippet): Snippet {
  return explainF("PlanJSON", [], countQuery);
}

/**
 * Statements.hs mtSnippet: an application/vnd.pgrst.plan accept wraps the
 * main statement in EXPLAIN with the requested format/options. (Upstream
 * threads the media type through prepareRead/prepareWrite/prepareCall; the
 * plugin applies it at the query layer to keep the wrappers SQL-only.)
 */
export function mtSnippet(mediaType: MediaType, snippet: Snippet): Snippet {
  if (mediaType.kind === "MTVndPlan") return explainF(mediaType.format, mediaType.options, snippet);
  return snippet;
}

/**
 * Statements.hs planRow decoding: EXPLAIN (FORMAT TEXT) yields many
 * single-column rows, FORMAT JSON one — BS.unlines joins them (with a
 * trailing newline). The query must run with raw type parsing so FORMAT JSON
 * output stays byte-faithful (node-postgres would parse the json column).
 */
export function decodePlanResult(res: QueryResult): RSPlan {
  const rows = res.rows as Record<string, unknown>[];
  const lines = rows.map((row) => String(Object.values(row)[0] ?? ""));
  return { kind: "RSPlan", rsPlan: lines.map((line) => `${line}\n`).join("") };
}

/**
 * PostgreSQL's xml output function (xml.c xml_out_internal), which the xml
 * binary send format also goes through: when the value carries no XML
 * declaration (or one that does not need re-printing for a UTF-8 client —
 * version "1.0", no standalone attribute), the declaration is dropped and a
 * single newline right after it is eaten. Our `::text` cast bypasses xml_out
 * (xml -> text is binary-coercible), so it is emulated here.
 */
export function xmlOutInternal(str: string): string {
  if (!str.startsWith("<?xml")) {
    return str.startsWith("\n") ? str.slice(1) : str;
  }
  // <?xml followed by a name char is a PI (e.g. <?xml-stylesheet?>), not a decl.
  if (!/^<\?xml[\s]/.test(str)) {
    return str.startsWith("\n") ? str.slice(1) : str;
  }
  const decl = /^<\?xml\s+version\s*=\s*(?:'([^']*)'|"([^"]*)")(?:\s+encoding\s*=\s*(?:'[^']*'|"[^"]*"))?(?:\s+standalone\s*=\s*(?:'(yes|no)'|"(yes|no)"))?\s*\?>/
    .exec(str);
  if (decl === null) return str; // malformed decl: pg returns the string verbatim
  const version = decl[1] ?? decl[2];
  const standalone = decl[3] ?? decl[4] ?? null;
  const rest = str.slice(decl[0].length);
  // print_xml_decl: re-print when version /= "1.0" or standalone is present
  // (the target/client encoding is UTF-8, so the encoding never forces it).
  if (version !== "1.0" || standalone !== null) {
    const sa = standalone === null ? "" : ` standalone="${standalone}"`;
    return `<?xml version="${version}"${sa}?>${rest}`;
  }
  return rest.startsWith("\n") ? rest.slice(1) : rest;
}

/**
 * Upstream reads the aggregated body as raw bytes (HD.bytea over Hasql's
 * binary protocol), i.e. the SEND format of the handler's result type; the
 * plugin gets the body over the text protocol with a `::text` cast, so the
 * wire differences are emulated here per media-type-domain base type:
 *   - bytea: text protocol renders hex ('\x...') — decode back into bytes
 *   - jsonb: jsonb_send prepends the version byte 0x01 to the canonical text
 *   - xml:   xml_send runs xml_out_internal (the ::text cast bypasses it)
 * json/text/composite base types send their text verbatim — no change.
 */
export function decodeCustomBody(handler: MediaHandler, rs: RSStandard): RSStandard {
  if (handler.kind !== "CustomFunc" || typeof rs.rsBody !== "string") return rs;
  switch (handler.baseType) {
    case "bytea": {
      if (!rs.rsBody.startsWith("\\x")) return rs;
      const hex = rs.rsBody.slice(2);
      const bytes = new Uint8Array(hex.length >> 1);
      for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return { ...rs, rsBody: bytes };
    }
    case "jsonb": {
      if (rs.rsBody === "") return rs; // empty result set: no jsonb value was sent
      const text = new TextEncoder().encode(rs.rsBody);
      const bytes = new Uint8Array(text.length + 1);
      bytes[0] = 0x01;
      bytes.set(text, 1);
      return { ...rs, rsBody: bytes };
    }
    case "xml":
      return { ...rs, rsBody: xmlOutInternal(rs.rsBody) };
    default:
      return rs;
  }
}

interface ReadRow {
  total_result_set: string | number | null;
  page_total: string | number;
  body: string | null;
  response_headers: string | null;
  response_status: string | null;
}

/** Statements.hs standardRow decoding (HD.singleRow — exactly one row). */
export function decodeReadResult(res: QueryResult): RSStandard {
  if (res.rows.length !== 1) {
    throw internalError(`read statement returned ${res.rows.length} rows, expected 1`);
  }
  const row = res.rows[0] as ReadRow;
  return {
    kind: "RSStandard",
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
export function decodeWriteResult(res: QueryResult): RSStandard {
  if (res.rows.length === 0) {
    return {
      kind: "RSStandard",
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
    kind: "RSStandard",
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
 * Statements.hs prepareCall decoding (HD.rowMaybe + the
 * `RSStandard (Just 0) 0 ...` default — note the Just 0 table total, unlike
 * prepareWrite's Nothing). The '' filler columns decode like postgresql-binary:
 * total '' behaves as no count, NULL stays null.
 */
export function decodeCallResult(res: QueryResult): RSStandard {
  if (res.rows.length === 0) {
    return {
      kind: "RSStandard",
      rsTableTotal: 0,
      rsQueryTotal: 0,
      rsLocation: [],
      rsBody: "",
      rsGucHeaders: null,
      rsGucStatus: null,
      rsInserted: null,
    };
  }
  const row = res.rows[0] as ReadRow;
  return {
    kind: "RSStandard",
    rsTableTotal: row.total_result_set === null || row.total_result_set === "" ? null : Number(row.total_result_set),
    rsQueryTotal: Number(row.page_total),
    rsLocation: [],
    rsBody: row.body ?? "",
    rsGucHeaders: row.response_headers,
    rsGucStatus: row.response_status,
    rsInserted: null,
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
