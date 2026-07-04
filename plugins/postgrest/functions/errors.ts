// Ports src/PostgREST/Error.hs (PostgREST v12.2.3).
//
// Error bodies are always `{code, message, details, hint}` JSON. Codes follow
// PostgREST's catalog: PGRST0xx connection, PGRST1xx api-request, PGRST2xx
// schema-cache, PGRST3xx JWT, PGRSTX00 internal — plus raw PostgreSQL
// SQLSTATE passthrough for database errors.

export interface PgrstErrorBody {
  code: string;
  message: string;
  details: unknown;
  hint: unknown;
}

export class PgrstError extends Error {
  readonly status: number;
  /** Serialized verbatim — usually a PgrstErrorBody, `{}` for plain 404s. */
  readonly body: Partial<PgrstErrorBody>;
  readonly headers: Record<string, string>;

  constructor(status: number, body: Partial<PgrstErrorBody>, headers: Record<string, string> = {}) {
    super(body.message ?? "");
    this.name = "PgrstError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }

  response(): Response {
    return new Response(JSON.stringify(this.body), {
      status: this.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...this.headers },
    });
  }
}

function body(code: string, message: string, details: unknown = null, hint: unknown = null): PgrstErrorBody {
  return { code, message, details, hint };
}

// ---------------------------------------------------------------------------
// ApiRequestError variants (Error.hs instance ToJSON ApiRequestError + status)
// ---------------------------------------------------------------------------

/** PGRST100 — query string parse failure (QPError message + details). */
export function queryParamError(message: string, details: string): PgrstError {
  return new PgrstError(400, body("PGRST100", message, details));
}

/** PGRST101 — RPC only supports GET/POST/HEAD/OPTIONS. */
export function invalidRpcMethod(method: string): PgrstError {
  return new PgrstError(405, body("PGRST101", `Cannot use the ${method} method on RPC`));
}

/** PGRST102 — unparsable request body. */
export function invalidBody(errorMessage: string): PgrstError {
  return new PgrstError(400, body("PGRST102", errorMessage));
}

export type RangeError =
  | { kind: "NegativeLimit" }
  | { kind: "LowerGTUpper" }
  | { kind: "OutOfBounds"; lower: string; total: string };

/** PGRST103 — requested range not satisfiable. */
export function invalidRange(err: RangeError): PgrstError {
  const details = err.kind === "NegativeLimit"
    ? "Limit should be greater than or equal to zero."
    : err.kind === "LowerGTUpper"
    ? "The lower boundary must be lower than or equal to the upper boundary in the Range header."
    : `An offset of ${err.lower} was requested, but there are only ${err.total} rows.`;
  return new PgrstError(416, body("PGRST103", "Requested range not satisfiable", details));
}

/** PGRST105 — PUT requires eq filters on all PK columns. */
export function invalidFilters(): PgrstError {
  return new PgrstError(405, body("PGRST105", "Filters must include all and only primary key columns with 'eq' operators"));
}

/** PGRST106 — Accept-Profile / Content-Profile schema not exposed. */
export function unacceptableSchema(schemas: string[]): PgrstError {
  return new PgrstError(406, body("PGRST106", `The schema must be one of the following: ${schemas.join(", ")}`));
}

/** PGRST107 — no acceptable media type. */
export function mediaTypeError(cts: string[]): PgrstError {
  return new PgrstError(406, body("PGRST107", `None of these media types are available: ${cts.join(", ")}`));
}

/** 404 with empty JSON object body (ApiRequestError NotFound). */
export function notFound(): PgrstError {
  return new PgrstError(404, {});
}

/** PGRST108 — filter/order path references a resource not in select=. */
export function notEmbedded(resource: string): PgrstError {
  return new PgrstError(
    400,
    body(
      "PGRST108",
      `'${resource}' is not an embedded resource in this request`,
      null,
      `Verify that '${resource}' is included in the 'select' query parameter.`,
    ),
  );
}

/** PGRST109 — limited update/delete without order. */
export function limitNoOrderError(): PgrstError {
  return new PgrstError(400, body("PGRST109", "A 'limit' was applied without an explicit 'order'", null, "Apply an 'order' using unique column(s)"));
}

/** PGRST110 — limited update/delete affects rows out of the limit range. */
export function offLimitsChangesError(n: number, max: number): PgrstError {
  return new PgrstError(
    400,
    body(
      "PGRST110",
      "The maximum number of rows allowed to change was surpassed",
      `Results contain ${n} rows changed but the maximum number allowed is ${max}`,
    ),
  );
}

/** PGRST111 — invalid response.headers GUC. */
export function gucHeadersError(): PgrstError {
  return new PgrstError(500, body("PGRST111", "response.headers guc must be a JSON array composed of objects with a single key and a string value"));
}

/** PGRST112 — invalid response.status GUC. */
export function gucStatusError(): PgrstError {
  return new PgrstError(500, body("PGRST112", "response.status guc must be a valid status code"));
}

/** PGRST114 — limit/offset not allowed for PUT. */
export function putLimitNotAllowedError(): PgrstError {
  return new PgrstError(400, body("PGRST114", "limit/offset querystring parameters are not allowed for PUT"));
}

/** PGRST115 — PUT payload PK values must match the URL filters. */
export function putMatchingPkError(): PgrstError {
  return new PgrstError(400, body("PGRST115", "Payload values do not match URL in primary key column(s)"));
}

/** PGRST116 — vnd.pgrst.object with != 1 row. */
export function singularityError(n: number): PgrstError {
  return new PgrstError(
    406,
    body("PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${n} rows`),
  );
}

/** PGRST117 — unsupported HTTP method. */
export function unsupportedMethod(method: string): PgrstError {
  return new PgrstError(405, body("PGRST117", `Unsupported HTTP method: ${method}`));
}

/** PGRST118 — order by related table requires a to-one relationship. */
export function relatedOrderNotToOne(origin: string, target: string): PgrstError {
  return new PgrstError(
    400,
    body(
      "PGRST118",
      `A related order on '${target}' is not possible`,
      `'${origin}' and '${target}' do not form a many-to-one or one-to-one relationship`,
    ),
  );
}

/** PGRST119 — spread embedding requires a to-one relationship. */
export function spreadNotToOne(origin: string, target: string): PgrstError {
  return new PgrstError(
    400,
    body(
      "PGRST119",
      `A spread operation on '${target}' is not possible`,
      `'${origin}' and '${target}' do not form a many-to-one or one-to-one relationship`,
    ),
  );
}

/** PGRST120 — only is.null / not.is.null filters allowed directly on embeds. */
export function unacceptableFilter(target: string): PgrstError {
  return new PgrstError(
    400,
    body(
      "PGRST120",
      `Bad operator on the '${target}' embedded resource`,
      "Only is null or not is null filters are allowed on embedded resources",
    ),
  );
}

export type RaiseError =
  | { kind: "MsgParseError"; raw: string }
  | { kind: "DetParseError"; raw: string }
  | { kind: "NoDetail" };

/** PGRST121 — could not parse RAISE SQLSTATE 'PGRST' JSON payload. */
export function pgrstParseError(err: RaiseError): PgrstError {
  const details = err.kind === "MsgParseError"
    ? `Invalid JSON value for MESSAGE: '${err.raw}'`
    : err.kind === "DetParseError"
    ? `Invalid JSON value for DETAIL: '${err.raw}'`
    : "DETAIL is missing in the RAISE statement";
  const hint = err.kind === "MsgParseError"
    ? "MESSAGE must be a JSON object with obligatory keys: 'code', 'message' and optional keys: 'details', 'hint'."
    : "DETAIL must be a JSON object with obligatory keys: 'status', 'headers' and optional key: 'status_text'.";
  return new PgrstError(500, body("PGRST121", 'Could not parse JSON in the "RAISE SQLSTATE \'PGRST\'" error', details, hint));
}

/** PGRST122 — invalid preferences given with handling=strict. */
export function invalidPreferences(prefs: string[]): PgrstError {
  return new PgrstError(
    400,
    body("PGRST122", "Invalid preferences given with handling=strict", `Invalid preferences: ${prefs.join(", ")}`),
  );
}

/** PGRST123 — aggregates used while db-aggregates-enabled=false. */
export function aggregatesNotAllowed(): PgrstError {
  return new PgrstError(400, body("PGRST123", "Use of aggregate functions is not allowed"));
}

/** PGRST124 — Prefer: max-affected exceeded with handling=strict. */
export function maxAffectedViolationError(n: number): PgrstError {
  return new PgrstError(
    400,
    body("PGRST124", "Query result exceeds max-affected preference constraint", `The query affects ${n} rows`),
  );
}

// ---------------------------------------------------------------------------
// Schema cache errors (PGRST2xx)
// ---------------------------------------------------------------------------

/** PGRST200 — no relationship found between parent and child. */
export function noRelBetween(parent: string, child: string, embedHint: string | null, schema: string, hint: string | null): PgrstError {
  const hintPart = embedHint === null ? "" : `' using the hint '${embedHint}`;
  return new PgrstError(
    400,
    body(
      "PGRST200",
      `Could not find a relationship between '${parent}' and '${child}' in the schema cache`,
      `Searched for a foreign key relationship between '${parent}' and '${child}${hintPart}' in the schema '${schema}', but no matches were found.`,
      hint,
    ),
  );
}

/** PGRST201 — ambiguous embedding; details list candidate relationships. */
export function ambiguousRelBetween(parent: string, child: string, details: unknown[], hint: string): PgrstError {
  return new PgrstError(
    300,
    body(
      "PGRST201",
      `Could not embed because more than one relationship was found for '${parent}' and '${child}'`,
      details,
      hint,
    ),
  );
}

/** PGRST202 — function not found in schema cache. */
export function noRpc(message: string, details: string, hint: string | null): PgrstError {
  return new PgrstError(404, body("PGRST202", message, details, hint));
}

/** PGRST203 — overloaded function resolution is ambiguous. */
export function ambiguousRpc(candidates: string[]): PgrstError {
  return new PgrstError(
    300,
    body(
      "PGRST203",
      `Could not choose the best candidate function between: ${candidates.join(", ")}`,
      null,
      "Try renaming the parameters or the function itself in the database so function overloading can be resolved",
    ),
  );
}

/** PGRST204 — column not found in schema cache. */
export function columnNotFound(relName: string, colName: string): PgrstError {
  return new PgrstError(400, body("PGRST204", `Could not find the '${colName}' column of '${relName}' in the schema cache`));
}

// ---------------------------------------------------------------------------
// JWT errors (PGRST3xx) — Error.hs `Error` type
// ---------------------------------------------------------------------------

/** PGRST300 — server lacks a JWT secret while a token was sent. */
export function jwtTokenMissing(): PgrstError {
  return new PgrstError(500, body("PGRST300", "Server lacks JWT secret"));
}

/** PGRST301 — invalid/expired JWT. */
export function jwtTokenInvalid(message: string): PgrstError {
  return new PgrstError(401, body("PGRST301", message), {
    // invalidTokenHeader: error_description is the `show`-quoted message
    "WWW-Authenticate": `Bearer error="invalid_token", error_description=${JSON.stringify(message)}`,
  });
}

/** PGRST302 — anonymous access disabled (no db-anon-role and no token). */
export function jwtTokenRequired(): PgrstError {
  return new PgrstError(401, body("PGRST302", "Anonymous access is disabled"), { "WWW-Authenticate": "Bearer" });
}

// ---------------------------------------------------------------------------
// Connection / internal errors (PGRST0xx, PGRSTX00)
// ---------------------------------------------------------------------------

/** PGRST000 — cannot connect to the database. */
export function connectionError(details: string): PgrstError {
  return new PgrstError(503, body("PGRST000", "Database connection error. Retrying the connection.", details));
}

/** PGRST001 — connection dropped mid-session. */
export function databaseClientError(details: string | null): PgrstError {
  return new PgrstError(503, body("PGRST001", "Database client error. Retrying the connection.", details));
}

/** PGRST002 — schema cache load failed. */
export function noSchemaCacheError(): PgrstError {
  return new PgrstError(503, body("PGRST002", "Could not query the database for the schema cache. Retrying."));
}

/** PGRST003 — timed out acquiring a pool connection. */
export function poolAcquisitionTimeout(): PgrstError {
  return new PgrstError(504, body("PGRST003", "Timed out acquiring connection from connection pool."));
}

/** PGRSTX00 — internal error. */
export function internalError(message: string): PgrstError {
  return new PgrstError(500, body("PGRSTX00", message));
}

// ---------------------------------------------------------------------------
// PostgreSQL error mapping (Error.hs pgErrorStatus + ToJSON CommandError)
// ---------------------------------------------------------------------------

/** Shape of errors thrown by node-postgres for server errors. */
export interface PgServerError {
  code?: string; // SQLSTATE
  message: string;
  detail?: string | null;
  hint?: string | null;
}

interface RaiseMessage {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

interface RaiseDetails {
  status: number;
  status_text?: string;
  headers: Record<string, string>;
}

/**
 * Parses the payload of `RAISE ... USING ERRCODE = 'PGRST'` errors, which
 * allow SQL full response control: MESSAGE is `{code,message,details?,hint?}`
 * and DETAIL is `{status, status_text?, headers}`.
 */
function parseRaisePgrst(message: string, detail: string | null | undefined): { msg: RaiseMessage; det: RaiseDetails } | PgrstError {
  let msg: unknown;
  try {
    msg = JSON.parse(message);
  } catch {
    return pgrstParseError({ kind: "MsgParseError", raw: message });
  }
  if (msg === null || typeof msg !== "object" || typeof (msg as RaiseMessage).code !== "string" || typeof (msg as RaiseMessage).message !== "string") {
    return pgrstParseError({ kind: "MsgParseError", raw: message });
  }
  if (detail === null || detail === undefined) {
    return pgrstParseError({ kind: "NoDetail" });
  }
  let det: unknown;
  try {
    det = JSON.parse(detail);
  } catch {
    return pgrstParseError({ kind: "DetParseError", raw: detail });
  }
  if (det === null || typeof det !== "object" || typeof (det as RaiseDetails).status !== "number" || typeof (det as RaiseDetails).headers !== "object") {
    return pgrstParseError({ kind: "DetParseError", raw: detail });
  }
  return { msg: msg as RaiseMessage, det: det as RaiseDetails };
}

/** SQLSTATE → HTTP status (Error.hs pgErrorStatus). `authed` distinguishes 401/403 for 42501. */
export function pgErrorStatus(authed: boolean, code: string, message: string): number {
  if (code.startsWith("08")) return 503; // pg connection err
  if (code.startsWith("09")) return 500; // triggered action exception
  if (code.startsWith("0L")) return 403; // invalid grantor
  if (code.startsWith("0P")) return 403; // invalid role specification
  if (code === "23503") return 409; // foreign_key_violation
  if (code === "23505") return 409; // unique_violation
  if (code === "25006") return 405; // read_only_sql_transaction
  if (code === "21000") {
    // special case for pg-safeupdate, which we consider as client error
    return message.endsWith("requires a WHERE clause") ? 400 : 500;
  }
  if (code.startsWith("25")) return 500; // invalid tx state
  if (code.startsWith("28")) return 403; // invalid auth specification
  if (code.startsWith("2D")) return 500; // invalid tx termination
  if (code.startsWith("38")) return 500; // external routine exception
  if (code.startsWith("39")) return 500; // external routine invocation
  if (code.startsWith("3B")) return 500; // savepoint exception
  if (code.startsWith("40")) return 500; // tx rollback
  if (code === "53400") return 500; // config limit exceeded
  if (code.startsWith("53")) return 503; // insufficient resources
  if (code.startsWith("54")) return 500; // too complex
  if (code.startsWith("55")) return 500; // obj not on prereq state
  if (code === "57P01") return 503; // terminating connection due to administrator command
  if (code.startsWith("57")) return 500; // operator intervention
  if (code.startsWith("58")) return 500; // system error
  if (code.startsWith("F0")) return 500; // conf file error
  if (code.startsWith("HV")) return 500; // foreign data wrapper error
  if (code === "P0001") return 400; // default code for "raise"
  if (code.startsWith("P0")) return 500; // PL/pgSQL Error
  if (code.startsWith("XX")) return 500; // internal Error
  if (code === "42883") {
    // undefined function; xmlagg missing means unacceptable media type
    return message.startsWith("function xmlagg(") ? 406 : 404;
  }
  if (code === "42P01") return 404; // undefined table
  if (code === "42P17") return 500; // infinite recursion
  if (code === "42501") return authed ? 403 : 401; // insufficient privilege
  if (code.startsWith("PT")) {
    // Error.hs: 'P':'T':n -> fromMaybe status500 (mkStatus <$> readMaybe n ...)
    // readMaybe @Int fails on any non-numeric rest (e.g. "PT40A" -> 500).
    const rest = code.slice(2);
    return /^-?\d+$/.test(rest) ? Number.parseInt(rest, 10) : 500;
  }
  return 400;
}

/**
 * Maps a PostgreSQL server error (node-postgres error object) to a PgrstError,
 * matching Error.hs's PgError instance: body is the SQLSTATE passthrough
 * `{code,message,details,hint}`, status via pgErrorStatus, WWW-Authenticate on
 * 401, and full response control for RAISE 'PGRST' errors.
 */
export function fromPgError(authed: boolean, err: PgServerError): PgrstError {
  const code = err.code ?? "";

  if (code === "PGRST") {
    const parsed = parseRaisePgrst(err.message, err.detail);
    if (parsed instanceof PgrstError) return parsed;
    const { msg, det } = parsed;
    return new PgrstError(
      det.status,
      body(msg.code, msg.message, msg.details ?? null, msg.hint ?? null),
      det.headers,
    );
  }

  const status = pgErrorStatus(authed, code, err.message);
  const headers: Record<string, string> = status === 401 ? { "WWW-Authenticate": "Bearer" } : {};
  return new PgrstError(status, body(code, err.message, err.detail ?? null, err.hint ?? null), headers);
}
