// Ports src/PostgREST/ApiRequest.hs (PostgREST v12.2.3) — translating the
// HTTP request into the ApiRequest domain type: action/target resolution,
// schema (profile) negotiation, ranges, preferences, query params, media
// types and (since Phase 6) the request-body payload via ./payload.ts.

import {
  invalidRpcMethod,
  notFound,
  invalidRange,
  limitNoOrderError,
  putLimitNotAllowedError,
  unacceptableSchema,
  unsupportedMethod,
} from "../errors.ts";
import type { FieldName } from "../types.ts";
import type { QualifiedIdentifier } from "../schema-cache/index.ts";
import { decodeMediaType, MTAny, MTApplicationJSON, type MediaType, parseHttpAccept } from "./media-type.ts";
import { getPayload } from "./payload.ts";
import { fromHeaders, type Preferences } from "./preferences.ts";
import { parseQueryParams, type QueryParams } from "./query-params.ts";
import {
  allRange,
  convertToLimitZeroRange,
  hasLimitZero,
  type NonnegRange,
  rangeEq,
  rangeIntersection,
  rangeIsEmpty,
  rangeRequested,
} from "./range.ts";

// --------------------------------------------------------------------------
// Payload (parsed in ./payload.ts getPayload)
// --------------------------------------------------------------------------

export type Payload =
  /** Cached attributes of a JSON payload (raw body + uniform object keys). */
  | { kind: "ProcessedJSON"; payRaw: string; payKeys: Set<string> }
  | { kind: "ProcessedUrlEncoded"; payArray: [string, string][]; payKeys: Set<string> }
  | { kind: "RawJSON"; payRaw: string }
  | { kind: "RawPay"; payRaw: string };

// --------------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------------

export type InvokeMethod = { kind: "Inv" } | { kind: "InvRead"; headersOnly: boolean };

export type Mutation = "MutationCreate" | "MutationDelete" | "MutationSingleUpsert" | "MutationUpdate";

export type Resource =
  | { kind: "ResourceRelation"; name: string }
  | { kind: "ResourceRoutine"; name: string }
  | { kind: "ResourceSchema" };

export type DbAction =
  | { kind: "ActRelationRead"; qi: QualifiedIdentifier; headersOnly: boolean }
  | { kind: "ActRelationMut"; qi: QualifiedIdentifier; mutation: Mutation }
  | { kind: "ActRoutine"; qi: QualifiedIdentifier; invMethod: InvokeMethod }
  | { kind: "ActSchemaRead"; schema: string; headersOnly: boolean };

export type Action =
  | { kind: "ActDb"; db: DbAction }
  | { kind: "ActRelationInfo"; qi: QualifiedIdentifier }
  | { kind: "ActRoutineInfo"; qi: QualifiedIdentifier; invMethod: InvokeMethod }
  | { kind: "ActSchemaInfo" };

// --------------------------------------------------------------------------
// ApiRequest
// --------------------------------------------------------------------------

/**
 * Describes what the user wants to do. A translation of the raw elements of
 * an HTTP request into domain specific language — whether the intent is
 * sensible is determined by later stages (planning).
 */
export interface ApiRequest {
  /** Action on the resource. */
  iAction: Action;
  /** Requested range of rows within response (keyed like qsRanges). */
  iRange: Map<string, NonnegRange>;
  /** Requested range of rows from the top level. */
  iTopLevelRange: NonnegRange;
  /** Data sent by client and used for mutation actions. */
  iPayload: Payload | null;
  /** Prefer header values. */
  iPreferences: Preferences;
  iQueryParams: QueryParams;
  /** Parsed columns from the &columns parameter and the payload keys. */
  iColumns: Set<FieldName>;
  /** HTTP request headers (folded case, cookies excluded). */
  iHeaders: [string, string][];
  /** Request cookies. */
  iCookies: [string, string][];
  /** Raw request path. */
  iPath: string;
  /** Raw request method. */
  iMethod: string;
  /** The request schema. Can vary depending on profile headers. */
  iSchema: string;
  /** Whether the schema was chosen according to the profile spec. */
  iNegotiatedByProfile: boolean;
  /** The resolved media types in Accept, ordered by quality factors. */
  iAcceptMediaType: MediaType[];
  /** The media type in the Content-Type header. */
  iContentMediaType: MediaType;
}

/** The AppConfig subset userApiRequest needs (structurally satisfied). */
export interface ApiRequestConf {
  /** Non-empty; the first schema is the default one. */
  dbSchemas: string[];
  openApiMode: "follow-privileges" | "ignore-privileges" | "disabled";
  dbTxEnd: string;
  /** db-root-spec (not yet surfaced in the plugin's AppConfig). */
  dbRootSpec?: QualifiedIdentifier | null;
}

// --------------------------------------------------------------------------
// userApiRequest
// --------------------------------------------------------------------------

/**
 * Ports ApiRequest.hs userApiRequest. `path` is the in-API path (mount
 * prefix already stripped); `timezones` is the schema cache's timezone list
 * for Prefer: timezone validation; `reqBody` is the fully-read request body
 * (upstream reads it strictly before parsing). Throws PgrstError on invalid
 * requests.
 */
export function userApiRequest(
  conf: ApiRequestConf,
  req: { method: string; url: string; headers: Headers },
  path: string,
  timezones: Set<string>,
  reqBody = "",
): ApiRequest {
  const url = new URL(req.url, "http://localhost");
  const method = req.method;
  const headerList: [string, string][] = [...req.headers.entries()];

  const resource = getResource(conf, pathInfo(path));
  const [schema, negotiatedByProfile] = getSchema(conf, req.headers, method);
  const act = getAction(resource, schema, method);
  const qPrms = parseQueryParams(url.search, actIsInvokeSafe(act));
  const [topLevelRange, ranges] = getRanges(method, qPrms, req.headers);

  const allowTxDbOverride = conf.dbTxEnd === "commit-allow-override" || conf.dbTxEnd === "rollback-allow-override";
  const accept = req.headers.get("accept");
  const contentType = req.headers.get("content-type");
  const cookieHeader = req.headers.get("cookie");
  const contentMediaType = contentType === null ? MTApplicationJSON : decodeMediaType(contentType);

  const [payload, columns] = getPayload(reqBody, contentMediaType, qPrms.qsColumns, act);

  return {
    iAction: act,
    iRange: ranges,
    iTopLevelRange: topLevelRange,
    iPayload: payload,
    iPreferences: fromHeaders(allowTxDbOverride, timezones, headerList),
    iQueryParams: qPrms,
    iColumns: columns,
    iHeaders: headerList.filter(([k]) => k.toLowerCase() !== "cookie").map(([k, v]): [string, string] => [k.toLowerCase(), v]),
    iCookies: cookieHeader === null ? [] : parseCookies(cookieHeader),
    iPath: path,
    iMethod: method,
    iSchema: schema,
    iNegotiatedByProfile: negotiatedByProfile,
    iAcceptMediaType: accept === null ? [MTAny] : parseHttpAccept(accept).map(decodeMediaType),
    iContentMediaType: contentMediaType,
  };
}

/** ApiRequest.hs actIsInvokeSafe: RPC GET/HEAD parse values as arguments. */
function actIsInvokeSafe(act: Action): boolean {
  return act.kind === "ActDb" && act.db.kind === "ActRoutine" && act.db.invMethod.kind === "InvRead";
}

/** Network.Wai pathInfo: decoded path segments (leading "/" dropped). */
export function pathInfo(path: string): string[] {
  const p = path.startsWith("/") ? path.slice(1) : path;
  if (p === "") return [];
  return p.split("/").map((seg) => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  });
}

/** Ports ApiRequest.hs getResource. Throws 404 for unknown paths. */
export function getResource(conf: ApiRequestConf, segments: string[]): Resource {
  if (segments.length === 0) {
    const rootSpec = conf.dbRootSpec ?? null;
    if (rootSpec !== null) return { kind: "ResourceRoutine", name: rootSpec.name };
    if (conf.openApiMode === "disabled") throw notFound();
    return { kind: "ResourceSchema" };
  }
  if (segments.length === 1) return { kind: "ResourceRelation", name: segments[0] };
  if (segments.length === 2 && segments[0] === "rpc") return { kind: "ResourceRoutine", name: segments[1] };
  throw notFound();
}

/** Ports ApiRequest.hs getAction. Throws 405 on bad methods. */
export function getAction(resource: Resource, schema: string, method: string): Action {
  const qi = (name: string): QualifiedIdentifier => ({ schema, name });

  if (resource.kind === "ResourceRoutine") {
    switch (method) {
      case "HEAD":
        return { kind: "ActDb", db: { kind: "ActRoutine", qi: qi(resource.name), invMethod: { kind: "InvRead", headersOnly: true } } };
      case "GET":
        return { kind: "ActDb", db: { kind: "ActRoutine", qi: qi(resource.name), invMethod: { kind: "InvRead", headersOnly: false } } };
      case "POST":
        return { kind: "ActDb", db: { kind: "ActRoutine", qi: qi(resource.name), invMethod: { kind: "Inv" } } };
      case "OPTIONS":
        return { kind: "ActRoutineInfo", qi: qi(resource.name), invMethod: { kind: "InvRead", headersOnly: true } };
      default:
        throw invalidRpcMethod(method);
    }
  }

  if (resource.kind === "ResourceRelation") {
    switch (method) {
      case "HEAD":
        return { kind: "ActDb", db: { kind: "ActRelationRead", qi: qi(resource.name), headersOnly: true } };
      case "GET":
        return { kind: "ActDb", db: { kind: "ActRelationRead", qi: qi(resource.name), headersOnly: false } };
      case "POST":
        return { kind: "ActDb", db: { kind: "ActRelationMut", qi: qi(resource.name), mutation: "MutationCreate" } };
      case "PUT":
        return { kind: "ActDb", db: { kind: "ActRelationMut", qi: qi(resource.name), mutation: "MutationSingleUpsert" } };
      case "PATCH":
        return { kind: "ActDb", db: { kind: "ActRelationMut", qi: qi(resource.name), mutation: "MutationUpdate" } };
      case "DELETE":
        return { kind: "ActDb", db: { kind: "ActRelationMut", qi: qi(resource.name), mutation: "MutationDelete" } };
      case "OPTIONS":
        return { kind: "ActRelationInfo", qi: qi(resource.name) };
      default:
        throw unsupportedMethod(method);
    }
  }

  switch (method) {
    case "HEAD":
      return { kind: "ActDb", db: { kind: "ActSchemaRead", schema, headersOnly: true } };
    case "GET":
      return { kind: "ActDb", db: { kind: "ActSchemaRead", schema, headersOnly: false } };
    case "OPTIONS":
      return { kind: "ActSchemaInfo" };
    default:
      throw unsupportedMethod(method);
  }
}

/**
 * Ports ApiRequest.hs getSchema: Accept-Profile/Content-Profile negotiation
 * against the exposed schemas. Throws 406 on unknown profiles.
 */
export function getSchema(
  conf: Pick<ApiRequestConf, "dbSchemas">,
  headers: Headers,
  method: string,
): [string, boolean] {
  // POST/PATCH/PUT/DELETE don't use the same header as per the spec
  const usesContentProfile = method === "DELETE" || method === "PATCH" || method === "POST" || method === "PUT";
  const profile = headers.get(usesContentProfile ? "Content-Profile" : "Accept-Profile");
  if (profile !== null) {
    if (!conf.dbSchemas.includes(profile)) throw unacceptableSchema(conf.dbSchemas);
    return [profile, true];
  }
  // if we have many schemas, assume the default schema was negotiated
  return [conf.dbSchemas[0], conf.dbSchemas.length !== 1];
}

/**
 * Ports ApiRequest.hs getRanges: combines the Range header (GET only, per
 * RFC9110) with the limit/offset params. Throws PGRST103/109/114.
 */
export function getRanges(
  method: string,
  qsParams: Pick<QueryParams, "qsOrder" | "qsRanges">,
  headers: Headers | [string, string][],
): [NonnegRange, Map<string, NonnegRange>] {
  const { qsOrder, qsRanges } = qsParams;
  // The Range header must be ignored for all methods other than GET
  const headerRange = method === "GET" ? rangeRequested(headers) : allRange;
  const limitRange = qsRanges.get("limit") ?? allRange;
  const headerAndLimitRange = rangeIntersection(headerRange, limitRange);
  // Bypass all the ranges and send only the limit zero range (0 <= x <= -1)
  // if limit=0 is present in the query params (not allowed for Range)
  const ranges = new Map(qsRanges);
  ranges.set("limit", convertToLimitZeroRange(limitRange, headerAndLimitRange));
  // if no limit is specified, get all the requested rows
  const topLevelRange = ranges.get("limit") ?? allRange;
  // The only emptyRange allowed is the limit zero range
  const isInvalidRange = rangeIsEmpty(topLevelRange) && !hasLimitZero(limitRange);
  if (isInvalidRange) {
    throw invalidRange(rangeIsEmpty(headerRange) ? { kind: "LowerGTUpper" } : { kind: "NegativeLimit" });
  }
  if ((method === "PATCH" || method === "DELETE") && qsRanges.size > 0 && qsOrder.length === 0) {
    throw limitNoOrderError();
  }
  if (method === "PUT" && !rangeEq(topLevelRange, allRange)) {
    throw putLimitNotAllowedError();
  }
  return [topLevelRange, ranges];
}

/** Web.Cookie parseCookies (simplified: name=value pairs split on ';'). */
export function parseCookies(header: string): [string, string][] {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part): [string, string] => {
      const eq = part.indexOf("=");
      if (eq === -1) return [part, ""];
      return [part.slice(0, eq), part.slice(eq + 1)];
    });
}
