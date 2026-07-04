// Ports src/PostgREST/Response.hs (PostgREST v12.2.3): actionResponse for
// WrappedReadPlan (status via rangeStatusHeader, Content-Range /
// Content-Location / Content-Type / Preference-Applied headers), for
// MutateReadPlan (create/update/singleUpsert/delete responses: 201-vs-200
// via the pgrst.inserted counter, the Location header of inserts,
// Content-Range for mutations), for CallReadPlan (RPC: 204 for
// void-returning functions, empty body on HEAD), the RSPlan responses
// (EXPLAIN output for application/vnd.pgrst.plan), the OpenAPI/inspect
// response (MaybeDbResult) and the OPTIONS info responses (RelInfoPlan /
// RoutineInfoPlan / SchemaInfoPlan Allow headers), plus the response.status /
// response.headers GUC overrides (Response/GucHeader.hs).

import { gucHeadersError, gucStatusError, invalidRange, notFound } from "./errors.ts";
import type { ApiRequest } from "./parse/api-request.ts";
import { type MediaType, toContentType } from "./parse/media-type.ts";
import { prefAppliedHeader, shouldCount } from "./parse/preferences.ts";
import { contentRangeH, rangeOffset, rangeStatusHeader } from "./parse/range.ts";
import type { WrappedReadPlan } from "./plan/read-plan.ts";
import type { MutateReadPlan } from "./plan/mutate-plan.ts";
import type { CallReadPlan } from "./plan/call-plan.ts";
import type { QualifiedIdentifier, Routine, SchemaCache } from "./schema-cache/types.ts";
import { funcReturnsVoid, qiKey } from "./schema-cache/types.ts";
import type { ResultSet, RSPlan, RSStandard } from "./sql/statements.ts";

/** Ports the `RSPlan plan -> ...` branches of Response.hs actionResponse:
 * a 200 with the EXPLAIN output and the negotiated plan Content-Type. */
function planResponse(resultSet: RSPlan, media: MediaType, apiReq: ApiRequest): Response {
  const headers = new Headers();
  for (const [k, v] of contentTypeHeaders(media, apiReq)) headers.append(k, v);
  return new Response(resultSet.rsPlan, { status: 200, headers });
}

/** Ports Response.hs actionResponse (DbCrudResult WrappedReadPlan ...). */
export function readResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: WrappedReadPlan): Response {
  if (resultSet.kind === "RSPlan") return planResponse(resultSet, plan.wrMedia, apiReq);
  const { iPreferences, iTopLevelRange, iQueryParams, iSchema, iNegotiatedByProfile } = apiReq;
  const { rsTableTotal, rsQueryTotal, rsBody } = resultSet;

  const { status, header: contentRange } = rangeStatusHeader(iTopLevelRange, rsQueryTotal, rsTableTotal);
  // Only these preferences count as applied on reads (Response.hs).
  const prefHeader = prefAppliedHeader({
    preferResolution: null,
    preferRepresentation: null,
    preferParameters: null,
    preferCount: iPreferences.preferCount,
    preferTransaction: iPreferences.preferTransaction,
    preferMissing: null,
    preferHandling: iPreferences.preferHandling,
    preferTimezone: iPreferences.preferTimezone,
    preferMaxAffected: null,
    invalidPrefs: [],
  });
  const headers: [string, string][] = [
    contentRange,
    [
      "Content-Location",
      `/${plan.crudQi.name}${iQueryParams.qsCanonical === "" ? "" : `?${iQueryParams.qsCanonical}`}`,
    ],
    toContentType(plan.wrMedia),
    ...(iNegotiatedByProfile ? [["Content-Profile", iSchema] as [string, string]] : []),
    ...(prefHeader === null ? [] : [["Preference-Applied", prefHeader] as [string, string]]),
  ];

  const body = status === 416
    ? JSON.stringify(
      invalidRange({
        kind: "OutOfBounds",
        lower: String(rangeOffset(iTopLevelRange)),
        total: rsTableTotal === null ? "0" : String(rsTableTotal),
      }).body,
    )
    : plan.wrHdrsOnly
    ? null
    : rsBody;

  return finishResponse(resultSet, status, headers, body);
}

// --------------------------------------------------------------------------
// Mutation responses (Response.hs actionResponse for MutateReadPlan)
// --------------------------------------------------------------------------

/** Response.hs contentTypeHeaders. */
function contentTypeHeaders(media: MediaType, apiReq: ApiRequest): [string, string][] {
  return [
    toContentType(media),
    ...(apiReq.iNegotiatedByProfile ? [["Content-Profile", apiReq.iSchema] as [string, string]] : []),
  ];
}

/** Network.HTTP.Types.URI renderSimpleQuery True — "?k=v&..." with query-string
 * percent-encoding (unreserved characters kept verbatim). */
function renderSimpleQuery(kvs: [string, string][]): string {
  const enc = (s: string): string =>
    [...new TextEncoder().encode(s)]
      .map((b) => {
        const c = String.fromCharCode(b);
        return /[A-Za-z0-9_.~-]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
      })
      .join("");
  return `?${kvs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&")}`;
}

/** Applies the GUC status/header overrides and builds the final Response. */
function finishResponse(
  resultSet: Pick<RSStandard, "rsGucStatus" | "rsGucHeaders">,
  status: number,
  headers: [string, string][],
  body: string | Uint8Array<ArrayBuffer> | null,
): Response {
  const [ovStatus, ovHeaders] = overrideStatusHeaders(resultSet.rsGucStatus, resultSet.rsGucHeaders, status, headers);
  const responseHeaders = new Headers();
  for (const [k, v] of ovHeaders) responseHeaders.append(k, v);
  // a null body is mandatory on 204/304 (Fetch API), where upstream sends mempty
  const bod = ovStatus === 204 || ovStatus === 304 ? null : body;
  return new Response(bod, { status: ovStatus, headers: responseHeaders });
}

/** Ports Response.hs actionResponse (MutateReadPlan MutationCreate). */
export function createResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: MutateReadPlan): Response {
  if (resultSet.kind === "RSPlan") return planResponse(resultSet, plan.mrMedia, apiReq);
  const p = apiReq.iPreferences;
  const { rsQueryTotal, rsLocation, rsInserted, rsBody } = resultSet;
  const pkCols = plan.mrMutatePlan.kind === "Insert" ? plan.mrMutatePlan.insPkCols : [];
  const prefHeader = prefAppliedHeader({
    preferResolution: pkCols.length === 0 && apiReq.iQueryParams.qsOnConflict === null ? null : p.preferResolution,
    preferRepresentation: p.preferRepresentation,
    preferParameters: null,
    preferCount: p.preferCount,
    preferTransaction: p.preferTransaction,
    preferMissing: p.preferMissing,
    preferHandling: p.preferHandling,
    preferTimezone: p.preferTimezone,
    preferMaxAffected: null,
    invalidPrefs: [],
  });
  const headers: [string, string][] = [
    ...(rsLocation.length === 0
      ? []
      : [["Location", `/${plan.crudQi.name}${renderSimpleQuery(rsLocation)}`] as [string, string]]),
    contentRangeH(1, 0, shouldCount(p.preferCount) ? rsQueryTotal : null),
    ...(prefHeader === null ? [] : [["Preference-Applied", prefHeader] as [string, string]]),
  ];
  // isInsertIfGTZero: '' decodes as 0 for plain inserts (→ 201); a
  // merge-duplicates upsert that inserted nothing responds 200
  const status = rsInserted === null
    ? 200
    : rsInserted <= 0 && p.preferResolution === "MergeDuplicates"
    ? 200
    : 201;
  const full = p.preferRepresentation === "Full";
  return finishResponse(
    resultSet,
    status,
    full ? [...headers, ...contentTypeHeaders(plan.mrMedia, apiReq)] : headers,
    full ? rsBody : null,
  );
}

/** Ports Response.hs actionResponse (MutateReadPlan MutationUpdate). */
export function updateResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: MutateReadPlan): Response {
  if (resultSet.kind === "RSPlan") return planResponse(resultSet, plan.mrMedia, apiReq);
  const p = apiReq.iPreferences;
  const { rsQueryTotal, rsBody } = resultSet;
  const contentRangeHeader = contentRangeH(0, rsQueryTotal - 1, shouldCount(p.preferCount) ? rsQueryTotal : null);
  const prefHeader = prefAppliedHeader({
    preferResolution: null,
    preferRepresentation: p.preferRepresentation,
    preferParameters: null,
    preferCount: p.preferCount,
    preferTransaction: p.preferTransaction,
    preferMissing: p.preferMissing,
    preferHandling: p.preferHandling,
    preferTimezone: p.preferTimezone,
    preferMaxAffected: p.preferMaxAffected,
    invalidPrefs: [],
  });
  const headers: [string, string][] = [
    contentRangeHeader,
    ...(prefHeader === null ? [] : [["Preference-Applied", prefHeader] as [string, string]]),
  ];
  const full = p.preferRepresentation === "Full";
  return finishResponse(
    resultSet,
    full ? 200 : 204,
    full ? [...headers, ...contentTypeHeaders(plan.mrMedia, apiReq)] : headers,
    full ? rsBody : null,
  );
}

/** Ports Response.hs actionResponse (MutateReadPlan MutationSingleUpsert). */
export function singleUpsertResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: MutateReadPlan): Response {
  if (resultSet.kind === "RSPlan") return planResponse(resultSet, plan.mrMedia, apiReq);
  const p = apiReq.iPreferences;
  const { rsInserted, rsBody } = resultSet;
  const prefHeader = prefAppliedHeader({
    preferResolution: null,
    preferRepresentation: p.preferRepresentation,
    preferParameters: null,
    preferCount: p.preferCount,
    preferTransaction: p.preferTransaction,
    preferMissing: null,
    preferHandling: p.preferHandling,
    preferTimezone: p.preferTimezone,
    preferMaxAffected: null,
    invalidPrefs: [],
  });
  const prefHeaders: [string, string][] = prefHeader === null ? [] : [["Preference-Applied", prefHeader]];
  // upsertStatus = isInsertIfGTZero (fromJust rsInserted)
  const upsertStatus = (rsInserted ?? 0) > 0 ? 201 : 200;
  const full = p.preferRepresentation === "Full";
  return finishResponse(
    resultSet,
    full ? upsertStatus : 204,
    full ? [...contentTypeHeaders(plan.mrMedia, apiReq), ...prefHeaders] : prefHeaders,
    full ? rsBody : null,
  );
}

/** Ports Response.hs actionResponse (MutateReadPlan MutationDelete). */
export function deleteResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: MutateReadPlan): Response {
  if (resultSet.kind === "RSPlan") return planResponse(resultSet, plan.mrMedia, apiReq);
  const p = apiReq.iPreferences;
  const { rsQueryTotal, rsBody } = resultSet;
  const contentRangeHeader = contentRangeH(1, 0, shouldCount(p.preferCount) ? rsQueryTotal : null);
  const prefHeader = prefAppliedHeader({
    preferResolution: null,
    preferRepresentation: p.preferRepresentation,
    preferParameters: null,
    preferCount: p.preferCount,
    preferTransaction: p.preferTransaction,
    preferMissing: null,
    preferHandling: p.preferHandling,
    preferTimezone: p.preferTimezone,
    preferMaxAffected: p.preferMaxAffected,
    invalidPrefs: [],
  });
  const headers: [string, string][] = [
    contentRangeHeader,
    ...(prefHeader === null ? [] : [["Preference-Applied", prefHeader] as [string, string]]),
  ];
  const full = p.preferRepresentation === "Full";
  return finishResponse(
    resultSet,
    full ? 200 : 204,
    full ? [...headers, ...contentTypeHeaders(plan.mrMedia, apiReq)] : headers,
    full ? rsBody : null,
  );
}

/** Ports Response.hs actionResponse (DbCallResult CallReadPlan). */
export function invokeResponse(resultSet: ResultSet, apiReq: ApiRequest, plan: CallReadPlan): Response {
  if (resultSet.kind === "RSPlan") return planResponse(resultSet, plan.crMedia, apiReq);
  const p = apiReq.iPreferences;
  const { iTopLevelRange } = apiReq;
  const { rsTableTotal, rsQueryTotal, rsBody } = resultSet;

  const { status, header: contentRange } = rangeStatusHeader(iTopLevelRange, rsQueryTotal, rsTableTotal);
  const rsOrErrBody = status === 416
    ? JSON.stringify(
      invalidRange({
        kind: "OutOfBounds",
        lower: String(rangeOffset(iTopLevelRange)),
        total: rsTableTotal === null ? "0" : String(rsTableTotal),
      }).body,
    )
    : rsBody;
  const prefHeader = prefAppliedHeader({
    preferResolution: null,
    preferRepresentation: null,
    preferParameters: p.preferParameters,
    preferCount: p.preferCount,
    preferTransaction: p.preferTransaction,
    preferMissing: null,
    preferHandling: p.preferHandling,
    preferTimezone: p.preferTimezone,
    preferMaxAffected: p.preferMaxAffected,
    invalidPrefs: [],
  });
  const headers: [string, string][] = [
    contentRange,
    ...(prefHeader === null ? [] : [["Preference-Applied", prefHeader] as [string, string]]),
  ];

  // funcReturnsVoid → 204 without body; HEAD (InvRead True) keeps headers only
  if (funcReturnsVoid(plan.crProc)) {
    return finishResponse(resultSet, 204, headers, null);
  }
  const headersOnly = plan.crInvMthd.kind === "InvRead" && plan.crInvMthd.headersOnly;
  return finishResponse(
    resultSet,
    status,
    [...headers, ...contentTypeHeaders(plan.crMedia, apiReq)],
    headersOnly ? null : rsOrErrBody,
  );
}

/**
 * Ports Response.hs overrideStatusHeaders — status and headers can be
 * overridden from SQL via the response.status / response.headers GUCs.
 * Throws PGRST112 / PGRST111 on malformed values.
 */
function overrideStatusHeaders(
  rsGucStatus: string | null,
  rsGucHeaders: string | null,
  status: number,
  headers: [string, string][],
): [number, [string, string][]] {
  const gucStatus = decodeGucStatus(rsGucStatus);
  const gucHeaders = decodeGucHeaders(rsGucHeaders);
  return [gucStatus ?? status, addHeadersIfNotIncluded(headers, gucHeaders)];
}

/**
 * Ports Response.hs decodeGucHeaders + GucHeader.hs FromJSON: the GUC must
 * be a JSON array of objects with a single key and a string value.
 */
function decodeGucHeaders(raw: string | null): [string, string][] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw gucHeadersError();
  }
  if (!Array.isArray(parsed)) throw gucHeadersError();
  return parsed.map((entry): [string, string] => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw gucHeadersError();
    const kvs = Object.entries(entry as Record<string, unknown>);
    if (kvs.length !== 1 || typeof kvs[0][1] !== "string") throw gucHeadersError();
    return [kvs[0][0], kvs[0][1]];
  });
}

/**
 * Ports Response.hs decodeGucStatus (Data.Text.Read decimal: leading digits
 * parse, any trailing rest is ignored).
 */
function decodeGucStatus(raw: string | null): number | null {
  if (raw === null) return null;
  const m = /^\d+/.exec(raw);
  if (m === null) throw gucStatusError();
  return Number.parseInt(m[0], 10);
}

/**
 * Ports Response.hs addHeadersIfNotIncluded: GUC headers win — a produced
 * header is dropped when a GUC header with the same (case-insensitive) name
 * exists, so the user can override instead of duplicating.
 */
function addHeadersIfNotIncluded(newHeaders: [string, string][], initialHeaders: [string, string][]): [string, string][] {
  const initialNames = new Set(initialHeaders.map(([k]) => k.toLowerCase()));
  return [...newHeaders.filter(([k]) => !initialNames.has(k.toLowerCase())), ...initialHeaders];
}

// --------------------------------------------------------------------------
// OpenAPI response (Response.hs actionResponse for MaybeDbResult)
// --------------------------------------------------------------------------

/**
 * Ports Response.hs actionResponse (MaybeDbResult InspectPlan ...): always a
 * 200 with the application/openapi+json Content-Type; the body is empty on
 * HEAD (and when openapi-mode=disabled, where upstream carries Nothing —
 * unreachable here because getResource already 404s in that mode).
 */
export function openApiResponse(body: string | null, headersOnly: boolean, apiReq: ApiRequest): Response {
  const headers = new Headers();
  for (const [k, v] of contentTypeHeaders({ kind: "MTOpenAPI" }, apiReq)) headers.append(k, v);
  return new Response(body === null || headersOnly ? "" : body, { status: 200, headers });
}

// --------------------------------------------------------------------------
// OPTIONS info responses (Response.hs actionResponse for NoDbResult)
// --------------------------------------------------------------------------

/** Ports Response.hs respondInfo. */
function respondInfo(allowHeader: string): Response {
  return new Response(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*", Allow: allowHeader },
  });
}

/**
 * Ports Response.hs actionResponse (NoDbResult (RelInfoPlan ...)) — the
 * per-table Allow header: GET/HEAD always; POST when insertable; PUT when
 * insertable, updatable and a PK exists; PATCH when updatable; DELETE when
 * deletable. 404 for unknown relations.
 */
export function infoIdentResponse(qi: QualifiedIdentifier, sCache: SchemaCache): Response {
  const table = sCache.tables.get(qiKey(qi));
  if (table === undefined) throw notFound();
  const hasPK = table.pkCols.length > 0;
  const allow = [
    "OPTIONS,GET,HEAD",
    ...(table.insertable ? ["POST"] : []),
    ...(table.insertable && table.updatable && hasPK ? ["PUT"] : []),
    ...(table.updatable ? ["PATCH"] : []),
    ...(table.deletable ? ["DELETE"] : []),
  ].join(",");
  return respondInfo(allow);
}

/** Ports Response.hs actionResponse (NoDbResult (RoutineInfoPlan ...)) —
 * volatile functions only allow POST; stable/immutable also GET/HEAD. */
export function infoProcResponse(proc: Routine): Response {
  return respondInfo(proc.volatility === "volatile" ? "OPTIONS,POST" : "OPTIONS,GET,HEAD,POST");
}

/** Ports Response.hs actionResponse (NoDbResult SchemaInfoPlan) — OPTIONS /. */
export function infoRootResponse(): Response {
  return respondInfo("OPTIONS,GET,HEAD");
}

// --------------------------------------------------------------------------
// CORS preflight (Cors.hs corsPolicy + Network.Wai.Middleware.Cors)
// --------------------------------------------------------------------------

/**
 * Ports the wai-cors middleware's preflight handling with PostgREST's policy
 * (Cors.hs corsPolicy). A preflight request (OPTIONS + Origin +
 * Access-Control-Request-Method) is answered by the middleware itself — a
 * 200 with the CORS headers, empty body and, notably, NO Allow header (the
 * OPTIONS info responses never run). Returns null when the request is not a
 * preflight or when the policy check fails (corsIgnoreFailures = True passes
 * the request through to the app untouched).
 */
export function corsPreflightResponse(
  corsAllowedOrigins: string[] | null,
  req: { method: string; headers: Headers },
): Response | null {
  if (req.method !== "OPTIONS") return null;
  const origin = req.headers.get("Origin");
  const requestMethod = req.headers.get("Access-Control-Request-Method");
  if (origin === null || requestMethod === null) return null;

  // corsOrigins: Nothing allows any origin and answers "*"; a configured
  // list must contain the request origin (failures pass through).
  let allowOrigin: string;
  if (corsAllowedOrigins === null) {
    allowOrigin = "*";
  } else if (corsAllowedOrigins.includes(origin)) {
    allowOrigin = origin;
  } else {
    return null;
  }

  // corsMethods ∪ simpleMethods (GET/HEAD/POST); the requested method must
  // be among them, otherwise the failure is ignored (pass through).
  const allowedMethods = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"];
  if (!allowedMethods.includes(requestMethod.toUpperCase())) return null;

  // corsRequestHeaders = "Authorization" : requested headers (Cors.hs), so
  // the wai-cors allowed-headers check always passes; the response echoes
  // the policy list plus the simple headers without Content-Type.
  const acrh = req.headers.get("Access-Control-Request-Headers");
  const requested = acrh === null ? [] : acrh.split(",").map((h) => h.trim()).filter((h) => h !== "");
  const allowHeaders = ["Authorization", ...requested, "Accept", "Accept-Language", "Content-Language"];

  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": allowedMethods.join(", "),
      "Access-Control-Allow-Headers": allowHeaders.join(", "),
      "Access-Control-Max-Age": "86400",
    },
  });
}
