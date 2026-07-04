// Ports src/PostgREST/Response/OpenAPI.hs (PostgREST v12.2.3) — the whole
// swagger 2.0 generation: definitions from tables (per-column properties with
// PK/FK notes, enums, defaults, required from not-null), parameters (select /
// order / on_conflict / limit / offset / Range headers / Prefer variants /
// per-column rowFilters / per-table body params), paths for tables and
// /rpc functions, the root path item, security definitions
// (openapi-security-active) and the host/basePath from
// openapi-server-proxy-uri (Config/Proxy.hs pickProxy) or server-host/port.
//
// Data.Swagger's aeson encoding is reproduced with plain JSON objects; absent
// (Nothing/mempty) fields are omitted like aeson does.

import type { AppConfig } from "./config.ts";
import type { Column, FkRelationship, RelationshipsMap, Routine, RoutineParam, Table } from "./schema-cache/types.ts";
import { relsMapKey } from "./schema-cache/types.ts";

// Ports src/PostgREST/Version.hs: prettyVersion (no git hash available) and
// docsVersion ("v" <> first version component).
export const prettyVersion = "12.2.3";
export const docsVersion = "v12";

type Json = Record<string, unknown>;

/** Drops undefined values so the output matches aeson's omitted fields. */
function obj(entries: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * swagger2's ToJSON (sopSwaggerGenericToJSON) omits fields whose value equals
 * their mempty default: an empty `properties` InsOrdHashMap or an empty
 * `parameters` list is not serialized at all.
 */
function omitEmpty<T extends object>(v: T): T | undefined {
  const isEmpty = Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
  return isEmpty ? undefined : v;
}

// --------------------------------------------------------------------------
// Swagger types (OpenAPI.hs toSwaggerType and friends)
// --------------------------------------------------------------------------

/** Ports OpenAPI.hs toSwaggerType — json/jsonb yield no type (undefined). */
export function toSwaggerType(colType: string): string | undefined {
  switch (colType) {
    case "character varying":
    case "character":
    case "text":
      return "string";
    case "boolean":
      return "boolean";
    case "smallint":
    case "integer":
    case "bigint":
      return "integer";
    case "numeric":
    case "real":
    case "double precision":
      return "number";
    case "json":
    case "jsonb":
      return undefined;
    default:
      return colType.endsWith("[]") ? "array" : "string";
  }
}

/** Ports OpenAPI.hs typeFromArray. */
function typeFromArray(arrType: string): string {
  return arrType.slice(0, -2);
}

/** Ports OpenAPI.hs toSwaggerTypeFromArray. */
function toSwaggerTypeFromArray(arrType: string): string | undefined {
  return toSwaggerType(typeFromArray(arrType));
}

/** Ports OpenAPI.hs makePropertyItems — only array types get items. */
function makePropertyItems(arrType: string): Json | undefined {
  if (toSwaggerType(arrType) !== "array") return undefined;
  return obj({ type: toSwaggerTypeFromArray(arrType) });
}

/** Ports OpenAPI.hs parseDefault — string-typed defaults are unquoted and
 * re-wrapped so JSON.parse yields the plain string. */
export function parseDefault(colType: string, colDefault: string): string {
  if (toSwaggerType(colType) === "string") {
    const stripped = colDefault.endsWith(`::${colType}`)
      ? colDefault.slice(0, -(colType.length + 2))
      : colDefault;
    const unquoted = stripped.replace(/^'+/, "").replace(/'+$/, "");
    return `"${unquoted}"`;
  }
  return colDefault;
}

/** `JSON.decode` equivalent: undefined (omit) on parse failure. */
function jsonDecode(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// --------------------------------------------------------------------------
// Definitions (OpenAPI.hs makeTableDef / makeProperty)
// --------------------------------------------------------------------------

/** Ports OpenAPI.hs makeTableDef. */
export function makeTableDef(rels: RelationshipsMap, t: Table): [string, Json] {
  const required = t.columns.filter((c) => !c.nullable).map((c) => c.name);
  return [
    t.name,
    obj({
      description: t.description ?? undefined,
      required: required.length > 0 ? required : undefined,
      properties: omitEmpty(Object.fromEntries(t.columns.map((c) => makeProperty(t, rels, c)))),
      type: "object",
    }),
  ];
}

/** Ports OpenAPI.hs makeProperty — incl. the PK/FK notes in the description. */
function makeProperty(tbl: Table, rels: RelationshipsMap, col: Column): [string, Json] {
  const searchedRels = rels.get(relsMapKey({ schema: tbl.schema, name: tbl.name }, tbl.schema)) ?? [];
  // Sorts the relationship list to get tables first (sortOn relFTableIsView, stable).
  const fkRels = searchedRels.filter((r): r is FkRelationship => r.kind === "fk");
  const relsSortedByIsView = [...fkRels].sort(
    (a, b) => Number(a.foreignTableIsView) - Number(b.foreignTableIsView),
  );
  // Finds the relationship that has a single column foreign key.
  const rel = relsSortedByIsView.find((r) => {
    const card = r.cardinality;
    const isFkSide = card.tag === "M2O" || (card.tag === "O2O" && !card.isParent);
    return isFkSide && card.columns.length === 1 && card.columns[0][0] === col.name;
  });
  const fk = rel === undefined || rel.cardinality.tag === "M2M"
    ? undefined
    : (() => {
      const fCol = rel.cardinality.columns[0]?.[1];
      const fTbl = rel.foreignTable.name;
      return fCol === undefined
        ? undefined
        : `This is a Foreign Key to \`${fTbl}.${fCol}\`.<fk table='${fTbl}' column='${fCol}'/>`;
    })();
  const pk = tbl.pkCols.includes(col.name);
  const notes = ["Note:", ...(pk ? ["This is a Primary Key.<pk/>"] : []), ...(fk !== undefined ? [fk] : [])];
  const description = notes.length > 1
    ? `${col.description === null ? "" : `${col.description}\n\n`}${notes.join("\n")}`
    : col.description ?? undefined;
  return [
    col.name,
    obj({
      default: col.default === null ? undefined : jsonDecode(parseDefault(col.dataType, col.default)),
      description,
      enum: col.enumVals.length > 0 ? col.enumVals : undefined,
      format: col.dataType,
      maxLength: col.maxLen ?? undefined,
      type: toSwaggerType(col.dataType),
      items: makePropertyItems(col.dataType),
    }),
  ];
}

// --------------------------------------------------------------------------
// Procs (OpenAPI.hs makeProcSchema / makeProcGetParams / makeProcPostParams)
// --------------------------------------------------------------------------

/** Ports OpenAPI.hs makeProcSchema — the POST args body schema. */
function makeProcSchema(pd: Routine): Json {
  const required = pd.params.filter((p) => p.required).map((p) => p.name);
  return obj({
    description: pd.description ?? undefined,
    required: required.length > 0 ? required : undefined,
    properties: omitEmpty(Object.fromEntries(pd.params.map(makeProcProperty))),
    type: "object",
  });
}

/** Ports OpenAPI.hs makeProcProperty. */
function makeProcProperty(p: RoutineParam): [string, Json] {
  return [p.name, obj({ format: p.type, type: toSwaggerType(p.type), items: makePropertyItems(p.type) })];
}

/** Ports OpenAPI.hs makePreferParam. */
function makePreferParam(ts: string[]): Json {
  const vals = ts.flatMap((t) => {
    switch (t) {
      case "count":
        return ["count=none"];
      case "params":
        return ["params=single-object"];
      case "return":
        return ["return=representation", "return=minimal", "return=none"];
      case "resolution":
        return ["resolution=ignore-duplicates", "resolution=merge-duplicates"];
      default:
        return [];
    }
  });
  return obj({
    name: "Prefer",
    description: "Preference",
    required: false,
    in: "header",
    type: "string",
    enum: vals,
  });
}

/** Ports OpenAPI.hs makeProcGetParam — variadic params collect multi items. */
function makeProcGetParam(p: RoutineParam): Json {
  const base = { name: p.name, required: p.required, in: "query" };
  if (p.variadic) {
    return obj({
      ...base,
      type: toSwaggerType(p.type) ?? "string",
      items: obj({ format: typeFromArray(p.type), type: toSwaggerTypeFromArray(p.type) }),
      collectionFormat: "multi",
    });
  }
  const swaggerType = toSwaggerType(p.type);
  return obj({
    ...base,
    format: p.type,
    // Array uses {} in query params; a missing type must become string
    type: swaggerType === undefined || swaggerType === "array" ? "string" : swaggerType,
  });
}

/** Ports OpenAPI.hs makeProcPostParams. */
function makeProcPostParams(pd: Routine): unknown[] {
  return [
    obj({ name: "args", required: true, in: "body", schema: makeProcSchema(pd) }),
    { $ref: "#/parameters/preferParams" },
  ];
}

// --------------------------------------------------------------------------
// Parameter definitions (OpenAPI.hs makeParamDefs)
// --------------------------------------------------------------------------

function queryStringParam(name: string, description: string): [string, Json] {
  return [name, obj({ name, description, required: false, in: "query", type: "string" })];
}

function headerStringParam(key: string, name: string, description: string, def?: string): [string, Json] {
  return [key, obj({ name, description, required: false, in: "header", type: "string", default: def })];
}

/** Ports OpenAPI.hs makeObjectBody. */
function makeObjectBody(tn: string): [string, Json] {
  return [
    `body.${tn}`,
    obj({ name: tn, description: tn, required: false, in: "body", schema: { $ref: `#/definitions/${tn}` } }),
  ];
}

/** Ports OpenAPI.hs makeRowFilter. */
function makeRowFilter(tn: string, c: Column): [string, Json] {
  return [
    `rowFilter.${tn}.${c.name}`,
    obj({ name: c.name, description: c.description ?? undefined, required: false, in: "query", type: "string" }),
  ];
}

/** Ports OpenAPI.hs makeParamDefs. */
export function makeParamDefs(ti: Table[]): Json {
  const entries: [string, Json][] = [
    // TODO(upstream): create Prefer for each method (GET, PATCH, etc.)
    ["preferParams", makePreferParam(["params"])],
    ["preferReturn", makePreferParam(["return"])],
    ["preferCount", makePreferParam(["count"])],
    ["preferPost", makePreferParam(["return", "resolution"])],
    queryStringParam("select", "Filtering Columns"),
    queryStringParam("on_conflict", "On Conflict"),
    queryStringParam("order", "Ordering"),
    headerStringParam("range", "Range", "Limiting and Pagination"),
    headerStringParam("rangeUnit", "Range-Unit", "Limiting and Pagination", "items"),
    queryStringParam("offset", "Limiting and Pagination"),
    queryStringParam("limit", "Limiting and Pagination"),
    ...ti.flatMap((t): [string, Json][] => [
      makeObjectBody(t.name),
      ...t.columns.map((c) => makeRowFilter(t.name, c)),
    ]),
  ];
  return Object.fromEntries(entries);
}

// --------------------------------------------------------------------------
// Path items (OpenAPI.hs makePathItem / makeProcPathItem / makeRootPathItem)
// --------------------------------------------------------------------------

/** OpenAPI.hs breakOn "\n": (summary, description) from an SQL comment. */
function splitDescription(text: string | null): [string | undefined, string | undefined] {
  if (text === null) return [undefined, undefined];
  const nl = text.indexOf("\n");
  const summary = nl === -1 ? text : text.slice(0, nl);
  // We strip leading newlines from description so that users can include a
  // blank line between summary and description.
  const rest = nl === -1 ? "" : text.slice(nl).replace(/^\n+/, "");
  return [summary, rest === "" ? undefined : rest];
}

const ref = (name: string): Json => ({ $ref: `#/parameters/${name}` });

/** Ports OpenAPI.hs makePathItem. */
export function makePathItem(t: Table): [string, Json] {
  const tn = t.name;
  const [tSum, tDesc] = splitDescription(t.description);
  const tOp = obj({ tags: [tn], summary: tSum, description: tDesc });
  const rs = t.columns.map((c) => `rowFilter.${tn}.${c.name}`);
  const getOp = obj({
    ...tOp,
    parameters: [...rs, "select", "order", "range", "rangeUnit", "offset", "limit", "preferCount"].map(ref),
    responses: {
      "200": {
        description: "OK",
        schema: { items: { $ref: `#/definitions/${tn}` }, type: "array" },
      },
      "206": { description: "Partial Content" },
    },
  });
  const postOp = obj({
    ...tOp,
    parameters: [`body.${tn}`, "select", "preferPost"].map(ref),
    responses: { "201": { description: "Created" } },
  });
  const patchOp = obj({
    ...tOp,
    parameters: [...rs, `body.${tn}`, "preferReturn"].map(ref),
    responses: { "204": { description: "No Content" } },
  });
  const deleteOp = obj({
    ...tOp,
    parameters: [...rs, "preferReturn"].map(ref),
    responses: { "204": { description: "No Content" } },
  });
  const writable = t.insertable || t.updatable || t.deletable;
  return [
    `/${tn}`,
    writable ? { get: getOp, post: postOp, patch: patchOp, delete: deleteOp } : { get: getOp },
  ];
}

/** Ports OpenAPI.hs makeProcPathItem. */
export function makeProcPathItem(pd: Routine): [string, Json] {
  const [pSum, pDesc] = splitDescription(pd.description);
  const procOp = obj({
    tags: [`(rpc) ${pd.name}`],
    summary: pSum,
    description: pDesc,
    produces: [
      "application/json",
      "application/vnd.pgrst.object+json;nulls=stripped",
      "application/vnd.pgrst.object+json",
    ],
    responses: { "200": { description: "OK" } },
  });
  return [
    `/rpc/${pd.name}`,
    {
      get: obj({ ...procOp, parameters: omitEmpty(pd.params.map(makeProcGetParam)) }),
      post: obj({ ...procOp, parameters: omitEmpty(makeProcPostParams(pd)) }),
    },
  ];
}

/** Ports OpenAPI.hs makeRootPathItem. */
function makeRootPathItem(): [string, Json] {
  return [
    "/",
    {
      get: {
        tags: ["Introspection"],
        summary: "OpenAPI description (this document)",
        produces: ["application/openapi+json", "application/json"],
        responses: { "200": { description: "OK" } },
      },
    },
  ];
}

/** Ports OpenAPI.hs makePathItems. */
function makePathItems(pds: Routine[], ti: Table[]): Json {
  return Object.fromEntries([makeRootPathItem(), ...ti.map(makePathItem), ...pds.map(makeProcPathItem)]);
}

// --------------------------------------------------------------------------
// Security definitions / proxy uri
// --------------------------------------------------------------------------

/** Ports OpenAPI.hs makeSecurityDefinitions. */
function makeSecurityDefinitions(secName: string, allow: boolean): Json | undefined {
  if (!allow) return undefined;
  return {
    [secName]: {
      type: "apiKey",
      description: 'Add the token prepending "Bearer " (without quotes) to it',
      name: "Authorization",
      in: "header",
    },
  };
}

/** Ports OpenAPI.hs escapeHostName. */
export function escapeHostName(h: string): string {
  return ["*", "*4", "!4", "*6", "!6"].includes(h) ? "0.0.0.0" : h;
}

/** Ports Config/Proxy.hs Proxy. */
export interface Proxy {
  proxyScheme: string;
  proxyHost: string;
  proxyPort: number;
  proxyPath: string;
}

/**
 * Ports OpenAPI.hs pickProxy + Config/Proxy.hs isMalformedProxyUri: a valid
 * proxy uri is absolute, http(s), without query or user info, port 1-65535.
 */
export function pickProxy(proxy: string | null): Proxy | null {
  if (proxy === null) return null;
  let uri: URL;
  try {
    uri = new URL(proxy);
  } catch {
    return null;
  }
  const scheme = uri.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") return null;
  if (uri.search !== "" || uri.username !== "" || uri.password !== "") return null;
  if (uri.hostname === "") return null;
  const port = uri.port === "" ? (scheme === "http" ? 80 : 443) : Number.parseInt(uri.port, 10);
  if (!(port > 0 && port < 65536)) return null;
  return {
    proxyScheme: scheme,
    proxyHost: uri.hostname,
    proxyPort: port,
    proxyPath: uri.pathname === "" ? "/" : uri.pathname,
  };
}

/** Ports OpenAPI.hs proxyUri — (scheme, host, port, basePath). */
export function proxyUri(conf: AppConfig): [string, string, number, string] {
  const proxy = pickProxy(conf.openApiServerProxyUri);
  if (proxy !== null) return [proxy.proxyScheme, proxy.proxyHost, proxy.proxyPort, proxy.proxyPath];
  return ["http", conf.serverHost, conf.serverPort, "/"];
}

// --------------------------------------------------------------------------
// The spec (OpenAPI.hs postgrestSpec / encode)
// --------------------------------------------------------------------------

const TOP_LEVEL_MEDIA_TYPES = [
  "application/json",
  "application/vnd.pgrst.object+json;nulls=stripped",
  "application/vnd.pgrst.object+json",
  "text/csv",
];

/** Ports OpenAPI.hs postgrestSpec. */
export function postgrestSpec(
  versions: [string, string],
  rels: RelationshipsMap,
  pds: Routine[],
  ti: Table[],
  uri: [string, string, number, string],
  sd: string | null,
  allowSecurityDef: boolean,
): Json {
  const [version, docs] = versions;
  const [s, h, p, b] = uri;
  const [dTitle, dDesc] = splitDescription(sd);
  const securityDefName = "JWT";
  return obj({
    swagger: "2.0",
    basePath: b,
    schemes: [s === "http" ? "http" : "https"],
    info: {
      description: dDesc ?? "This is a dynamic API generated by PostgREST",
      title: dTitle ?? "PostgREST API",
      version,
    },
    externalDocs: {
      description: "PostgREST Documentation",
      url: `https://postgrest.org/en/${docs}/references/api.html`,
    },
    host: `${escapeHostName(h)}:${p}`,
    definitions: Object.fromEntries(ti.map((t) => makeTableDef(rels, t))),
    parameters: makeParamDefs(ti),
    paths: makePathItems(pds, ti),
    produces: TOP_LEVEL_MEDIA_TYPES,
    consumes: TOP_LEVEL_MEDIA_TYPES,
    securityDefinitions: makeSecurityDefinitions(securityDefName, allowSecurityDef),
    security: allowSecurityDef ? [{ [securityDefName]: [] }] : undefined,
  });
}

/** Ports OpenAPI.hs encode. */
export function encodeOpenApi(
  conf: AppConfig,
  rels: RelationshipsMap,
  tables: Table[],
  procs: Routine[],
  schemaDescription: string | null,
): string {
  return JSON.stringify(
    postgrestSpec(
      [prettyVersion, docsVersion],
      rels,
      procs,
      tables,
      proxyUri(conf),
      schemaDescription,
      conf.openApiSecurityActive,
    ),
  );
}
