// Tests for functions/errors.ts — one case per Error.hs catalog entry plus
// the SQLSTATE → HTTP status mapping table.
import { assertEquals } from "std/assert/mod.ts";
import * as errors from "../functions/errors.ts";

Deno.test("PGRST100 queryParamError", () => {
  const e = errors.queryParamError('"failed to parse filter (val)" (line 1, column 1)', 'unexpected "v"');
  assertEquals(e.status, 400);
  assertEquals(e.body, {
    code: "PGRST100",
    message: '"failed to parse filter (val)" (line 1, column 1)',
    details: 'unexpected "v"',
    hint: null,
  });
});

Deno.test("PGRST101 invalidRpcMethod", () => {
  const e = errors.invalidRpcMethod("PATCH");
  assertEquals(e.status, 405);
  assertEquals(e.body.code, "PGRST101");
  assertEquals(e.body.message, "Cannot use the PATCH method on RPC");
});

Deno.test("PGRST102 invalidBody", () => {
  const e = errors.invalidBody("Empty or invalid json");
  assertEquals(e.status, 400);
  assertEquals(e.body.code, "PGRST102");
});

Deno.test("PGRST103 invalidRange variants", () => {
  const neg = errors.invalidRange({ kind: "NegativeLimit" });
  assertEquals(neg.status, 416);
  assertEquals(neg.body.details, "Limit should be greater than or equal to zero.");
  const lgu = errors.invalidRange({ kind: "LowerGTUpper" });
  assertEquals(lgu.body.details, "The lower boundary must be lower than or equal to the upper boundary in the Range header.");
  const oob = errors.invalidRange({ kind: "OutOfBounds", lower: "100", total: "15" });
  assertEquals(oob.body.details, "An offset of 100 was requested, but there are only 15 rows.");
  assertEquals(oob.body.message, "Requested range not satisfiable");
});

Deno.test("PGRST105 invalidFilters", () => {
  const e = errors.invalidFilters();
  assertEquals(e.status, 405);
  assertEquals(e.body.message, "Filters must include all and only primary key columns with 'eq' operators");
});

Deno.test("PGRST106 unacceptableSchema", () => {
  const e = errors.unacceptableSchema(["public", "storage"]);
  assertEquals(e.status, 406);
  assertEquals(e.body.message, "The schema must be one of the following: public, storage");
});

Deno.test("PGRST107 mediaTypeError", () => {
  const e = errors.mediaTypeError(["application/vnd.ms-excel"]);
  assertEquals(e.status, 406);
  assertEquals(e.body.message, "None of these media types are available: application/vnd.ms-excel");
});

Deno.test("notFound has empty JSON object body", async () => {
  const e = errors.notFound();
  assertEquals(e.status, 404);
  assertEquals(await e.response().json(), {});
});

Deno.test("PGRST108 notEmbedded", () => {
  const e = errors.notEmbedded("clients");
  assertEquals(e.status, 400);
  assertEquals(e.body.hint, "Verify that 'clients' is included in the 'select' query parameter.");
});

Deno.test("PGRST109 limitNoOrderError", () => {
  const e = errors.limitNoOrderError();
  assertEquals(e.status, 400);
  assertEquals(e.body.hint, "Apply an 'order' using unique column(s)");
});

Deno.test("PGRST110 offLimitsChangesError", () => {
  const e = errors.offLimitsChangesError(10, 5);
  assertEquals(e.status, 400);
  assertEquals(e.body.details, "Results contain 10 rows changed but the maximum number allowed is 5");
});

Deno.test("PGRST111/112 GUC errors are 500", () => {
  assertEquals(errors.gucHeadersError().status, 500);
  assertEquals(errors.gucStatusError().status, 500);
});

Deno.test("PGRST114/115 PUT errors", () => {
  assertEquals(errors.putLimitNotAllowedError().status, 400);
  assertEquals(errors.putMatchingPkError().body.message, "Payload values do not match URL in primary key column(s)");
});

Deno.test("PGRST116 singularityError", () => {
  const e = errors.singularityError(3);
  assertEquals(e.status, 406);
  assertEquals(e.body.message, "JSON object requested, multiple (or no) rows returned");
  assertEquals(e.body.details, "The result contains 3 rows");
});

Deno.test("PGRST117 unsupportedMethod", () => {
  const e = errors.unsupportedMethod("TRACE");
  assertEquals(e.status, 405);
});

Deno.test("PGRST118/119 related order and spread", () => {
  const e18 = errors.relatedOrderNotToOne("projects", "tasks");
  assertEquals(e18.status, 400);
  assertEquals(e18.body.details, "'projects' and 'tasks' do not form a many-to-one or one-to-one relationship");
  const e19 = errors.spreadNotToOne("projects", "tasks");
  assertEquals(e19.body.message, "A spread operation on 'tasks' is not possible");
});

Deno.test("PGRST120 unacceptableFilter", () => {
  const e = errors.unacceptableFilter("clients");
  assertEquals(e.status, 400);
  assertEquals(e.body.message, "Bad operator on the 'clients' embedded resource");
});

Deno.test("PGRST121 pgrstParseError variants", () => {
  const msg = errors.pgrstParseError({ kind: "MsgParseError", raw: "oops" });
  assertEquals(msg.status, 500);
  assertEquals(msg.body.details, "Invalid JSON value for MESSAGE: 'oops'");
  const noDetail = errors.pgrstParseError({ kind: "NoDetail" });
  assertEquals(noDetail.body.details, "DETAIL is missing in the RAISE statement");
});

Deno.test("PGRST122 invalidPreferences", () => {
  const e = errors.invalidPreferences(["tx=foo", "count=bar"]);
  assertEquals(e.status, 400);
  assertEquals(e.body.details, "Invalid preferences: tx=foo, count=bar");
});

Deno.test("PGRST123 aggregatesNotAllowed", () => {
  assertEquals(errors.aggregatesNotAllowed().status, 400);
});

Deno.test("PGRST124 maxAffectedViolationError", () => {
  const e = errors.maxAffectedViolationError(9);
  assertEquals(e.body.details, "The query affects 9 rows");
});

Deno.test("PGRST200 noRelBetween with and without hint", () => {
  const e = errors.noRelBetween("projects", "client", null, "public", "Perhaps you meant 'clients' instead of 'client'.");
  assertEquals(e.status, 400);
  assertEquals(e.body.code, "PGRST200");
  assertEquals(
    e.body.details,
    "Searched for a foreign key relationship between 'projects' and 'client' in the schema 'public', but no matches were found.",
  );
  const withHint = errors.noRelBetween("projects", "client", "fk", "public", null);
  assertEquals(
    withHint.body.details,
    "Searched for a foreign key relationship between 'projects' and 'client' using the hint 'fk' in the schema 'public', but no matches were found.",
  );
});

Deno.test("PGRST201 ambiguousRelBetween is HTTP 300", () => {
  const e = errors.ambiguousRelBetween("projects", "users", [], "hint");
  assertEquals(e.status, 300);
});

Deno.test("PGRST202/203/204", () => {
  assertEquals(errors.noRpc("m", "d", null).status, 404);
  assertEquals(errors.ambiguousRpc(["a.f(x => int)"]).status, 300);
  const col = errors.columnNotFound("projects", "namee");
  assertEquals(col.status, 400);
  assertEquals(col.body.message, "Could not find the 'namee' column of 'projects' in the schema cache");
});

Deno.test("PGRST30x JWT errors", () => {
  assertEquals(errors.jwtTokenMissing().status, 500);
  const invalid = errors.jwtTokenInvalid("JWT expired");
  assertEquals(invalid.status, 401);
  assertEquals(invalid.headers["WWW-Authenticate"], 'Bearer error="invalid_token", error_description="JWT expired"');
  const required = errors.jwtTokenRequired();
  assertEquals(required.status, 401);
  assertEquals(required.headers["WWW-Authenticate"], "Bearer");
});

Deno.test("PGRST00x connection errors", () => {
  assertEquals(errors.connectionError("boom").status, 503);
  assertEquals(errors.databaseClientError(null).status, 503);
  assertEquals(errors.noSchemaCacheError().status, 503);
  assertEquals(errors.poolAcquisitionTimeout().status, 504);
});

// --- SQLSTATE → HTTP status mapping (Error.hs pgErrorStatus) ---

Deno.test("pgErrorStatus mapping table", () => {
  const cases: Array<[string, string, boolean, number]> = [
    ["08006", "", false, 503],
    ["09000", "", false, 500],
    ["0L000", "", false, 403],
    ["0P000", "", false, 403],
    ["23503", "", false, 409],
    ["23505", "", false, 409],
    ["25006", "", false, 405],
    ["21000", "UPDATE requires a WHERE clause", false, 400],
    ["21000", "more than one row returned by a subquery", false, 500],
    ["25001", "", false, 500],
    ["28000", "", false, 403],
    ["2D000", "", false, 500],
    ["38000", "", false, 500],
    ["39000", "", false, 500],
    ["3B000", "", false, 500],
    ["40001", "", false, 500],
    ["53400", "", false, 500],
    ["53300", "", false, 503],
    ["54001", "", false, 500],
    ["55000", "", false, 500],
    ["57P01", "", false, 503],
    ["57000", "", false, 500],
    ["58000", "", false, 500],
    ["F0000", "", false, 500],
    ["HV000", "", false, 500],
    ["P0001", "", false, 400],
    ["P0002", "", false, 500],
    ["XX000", "", false, 500],
    ["42883", "function xmlagg(text) does not exist", false, 406],
    ["42883", "function foo() does not exist", false, 404],
    ["42P01", "", false, 404],
    ["42P17", "", false, 500],
    ["42501", "", true, 403],
    ["42501", "", false, 401],
    ["PT402", "Payment Required", false, 402],
    // Error.hs: 'P':'T':n -> fromMaybe status500 (mkStatus <$> readMaybe n ...)
    // an unparsable status (readMaybe fails) falls back to 500
    ["PT40A", "Wrong", false, 500],
    ["PT", "", false, 500],
    ["22P02", "", false, 400], // default: other SQLSTATEs are client errors
  ];
  for (const [code, message, authed, expected] of cases) {
    assertEquals(errors.pgErrorStatus(authed, code, message), expected, `${code} (${message || "no msg"}) authed=${authed}`);
  }
});

Deno.test("fromPgError passes through SQLSTATE body and adds WWW-Authenticate on 401", () => {
  const e = errors.fromPgError(false, {
    code: "42501",
    message: "permission denied for table secrets",
    detail: null,
    hint: null,
  });
  assertEquals(e.status, 401);
  assertEquals(e.headers["WWW-Authenticate"], "Bearer");
  assertEquals(e.body, {
    code: "42501",
    message: "permission denied for table secrets",
    details: null,
    hint: null,
  });
});

Deno.test("fromPgError RAISE PGRST full response control", () => {
  const e = errors.fromPgError(true, {
    code: "PGRST",
    message: JSON.stringify({ code: "123", message: "custom msg", details: "det", hint: "hnt" }),
    detail: JSON.stringify({ status: 418, headers: { "X-Custom": "1" } }),
  });
  assertEquals(e.status, 418);
  assertEquals(e.headers["X-Custom"], "1");
  assertEquals(e.body, { code: "123", message: "custom msg", details: "det", hint: "hnt" });
});

Deno.test("fromPgError RAISE PGRST with bad payloads → PGRST121", () => {
  const badMsg = errors.fromPgError(true, { code: "PGRST", message: "not json", detail: "{}" });
  assertEquals(badMsg.status, 500);
  assertEquals(badMsg.body.code, "PGRST121");
  const noDetail = errors.fromPgError(true, {
    code: "PGRST",
    message: JSON.stringify({ code: "1", message: "m" }),
    detail: null,
  });
  assertEquals(noDetail.body.details, "DETAIL is missing in the RAISE statement");
});

Deno.test("PgrstError.response() sets JSON content type and headers", async () => {
  const res = errors.jwtTokenInvalid("JWT expired").response();
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
  assertEquals(res.headers.get("WWW-Authenticate"), 'Bearer error="invalid_token", error_description="JWT expired"');
  const parsed = await res.json();
  assertEquals(parsed.code, "PGRST301");
});
