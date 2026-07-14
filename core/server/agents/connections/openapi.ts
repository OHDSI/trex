// OpenAPI realization for connections — turn an OpenAPI 3.x / Swagger 2.0
// document into one realized tool per operation, ready for the connection
// provider to namespace (`<conn>__<op>`), filter (allow/block), and mark for
// approval exactly as it does MCP tools.
//
// This is a FRESH, readable port of eve@0.19.0's connection generator
// (`runtime/connections/openapi-*.js`), which is a genuinely pure transform
// (its only external surface was ai-sdk `tool()` wrapping and a YAML fallback,
// both dropped here). The algorithm — operation naming, `$ref` dereferencing
// with a cycle/depth guard, parameter/requestBody schema derivation, server-URL
// extraction, security placement, request building, response shaping — mirrors
// eve's so behavior tracks that reference.
//
// Scope (v1): the spec source is an INLINE document object or a JSON string.
// Remote-URL specs, file-path specs, and YAML are deferred (parse() throws a
// clear error) — see the Task 4 report. Auth is resolved by the provider (the
// same `resolveHeaders` used for MCP) and handed in as `headers`; per-operation
// `security` then relocates the resolved bearer where the scheme dictates.

// The 1-line guard eve's transform leans on (`#shared/guards.js`).
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isArray(v: unknown): v is readonly unknown[] {
  return Array.isArray(v);
}

// A fetch-shaped function so tests can inject a mock without touching the
// global. Defaults to `globalThis.fetch` at call time.
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface OpenApiDeps {
  fetch?: FetchLike;
}

// Result of executing an operation — returned to the model verbatim so it can
// react to the status and body of ANY response (including non-2xx).
export interface OpenApiToolResult {
  status: number;
  statusText: string;
  body: unknown;
}

// A realized operation, ready for the provider to namespace + wrap. Mirrors
// mcp.ts's RealizedTool but carries its own spec-derived `execute`.
export interface RealizedOpenApiTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<OpenApiToolResult>;
}

// ── operations (eve: openapi-operations.js) ──────────────────────────────────

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

// Provider tool-name rules (Anthropic/OpenAI) only permit [a-zA-Z0-9_-] and cap
// length, so an operationId is sanitized rather than used verbatim.
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 64);
}

function operationName(op: Record<string, unknown>, method: HttpMethod, pathTemplate: string): string {
  if (typeof op.operationId === "string" && op.operationId.length > 0) {
    const n = sanitizeToolName(op.operationId);
    if (n.length > 0) return n;
  }
  const slug = pathTemplate.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitizeToolName(`${method}_${slug}`);
}

function uniqueName(name: string, used: Set<string>): string {
  let n = name;
  let i = 2;
  while (used.has(n)) {
    n = `${name}_${i}`;
    i += 1;
  }
  used.add(n);
  return n;
}

function operationDescription(op: Record<string, unknown>): string {
  if (typeof op.summary === "string" && op.summary.length > 0) return op.summary;
  if (typeof op.description === "string") return op.description;
  return "";
}

// ── schema (eve: openapi-schema.js) ──────────────────────────────────────────

interface OpenApiParameter {
  name: string;
  location: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: Record<string, unknown>;
  description?: string;
}

interface OpenApiRequestBody {
  required: boolean;
  contentType: string;
  schema: Record<string, unknown>;
}

// The combined JSON Schema the model fills in: each param → top-level property;
// the request body (when present) nested under `body`.
function buildInputSchema(
  parameters: readonly OpenApiParameter[],
  requestBody: OpenApiRequestBody | undefined,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of parameters) {
    properties[p.name] = p.description === undefined ? p.schema : { ...p.schema, description: p.description };
    if (p.required) required.push(p.name);
  }
  if (requestBody !== undefined) {
    properties.body = requestBody.schema;
    if (requestBody.required) required.push("body");
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

// Resolve a JSON Pointer `#/a/b/c` against the document root.
function resolveRef(document: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node: unknown = document;
  for (const part of parts) {
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

// Resolve a single `$ref` node one hop; return the node unchanged otherwise.
function deref(document: Record<string, unknown>, node: Record<string, unknown>): unknown {
  return typeof node.$ref === "string" ? resolveRef(document, node.$ref) ?? {} : node;
}

const VALID_JSON_SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

// Drop `type` values providers reject; keep valid ones (string or array form).
function normalizeSchemaType(node: Record<string, unknown>): void {
  const t = node.type;
  if (typeof t === "string" && !VALID_JSON_SCHEMA_TYPES.has(t)) {
    delete node.type;
  } else if (isArray(t)) {
    const kept = t.filter((x): x is string => typeof x === "string" && VALID_JSON_SCHEMA_TYPES.has(x));
    if (kept.length === 0) delete node.type;
    else node.type = kept;
  }
}

// OpenAPI 3.0 `nullable:true` → JSON-Schema-2020 `type:[t,"null"]` (or enum+null).
function normalizeNullable(node: Record<string, unknown>): void {
  if (!("nullable" in node)) return;
  const wasNullable = node.nullable === true;
  delete node.nullable;
  if (!wasNullable) return;
  const t = node.type;
  if (typeof t === "string") {
    if (t !== "null") node.type = [t, "null"];
  } else if (isArray(t)) {
    if (!t.includes("null")) node.type = [...t, "null"];
  } else if (isArray(node.enum) && !node.enum.includes(null)) {
    node.enum = [...node.enum, null];
  }
}

// Deeply resolve local `$ref`s, truncating cycles and over-deep nesting so the
// output stays finite + serializable (draft 2020-12). Truncation replaces an
// object (always a schema position) with `{}`; scalars/arrays pass through.
function derefSchema(
  document: Record<string, unknown>,
  node: unknown,
  depth = 0,
  seen: ReadonlySet<string> = new Set(),
): unknown {
  if (isArray(node)) return node.map((e) => derefSchema(document, e, depth + 1, seen));
  if (!isObject(node)) return node;
  if (depth > 12) return {};
  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref)) return {};
    const resolved = resolveRef(document, node.$ref);
    return resolved === undefined ? {} : derefSchema(document, resolved, depth + 1, new Set([...seen, node.$ref]));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = derefSchema(document, v, depth + 1, seen);
  normalizeSchemaType(out);
  normalizeNullable(out);
  return out;
}

// ── security (eve: openapi-security.js) ──────────────────────────────────────

type SecurityPlacement =
  | { kind: "bearer" }
  | { kind: "basic" }
  | { kind: "apiKey"; in: "header" | "query" | "cookie"; name: string };

function getSecuritySchemes(document: Record<string, unknown>): Record<string, unknown> | undefined {
  const components = isObject(document.components) ? document.components : undefined;
  if (components !== undefined && isObject(components.securitySchemes)) return components.securitySchemes;
  if (isObject(document.securityDefinitions)) return document.securityDefinitions;
  return undefined;
}

function mapSecurityScheme(scheme: Record<string, unknown>): SecurityPlacement | undefined {
  if (scheme.type === "apiKey") {
    const loc = scheme.in;
    return (loc === "header" || loc === "query" || loc === "cookie") && typeof scheme.name === "string" &&
        scheme.name.length > 0
      ? { kind: "apiKey", in: loc, name: scheme.name }
      : undefined;
  }
  if (scheme.type === "http") {
    return (typeof scheme.scheme === "string" ? scheme.scheme.toLowerCase() : "") === "basic"
      ? { kind: "basic" }
      : { kind: "bearer" };
  }
  if (scheme.type === "basic") return { kind: "basic" };
  if (scheme.type === "oauth2" || scheme.type === "openIdConnect") return { kind: "bearer" };
  return undefined;
}

// The first recognized scheme in the first requirement wins; operation-level
// `security` overrides the document default. `undefined` → default bearer.
function resolveSecurity(
  document: Record<string, unknown>,
  operation: Record<string, unknown>,
): SecurityPlacement | undefined {
  const requirements = isArray(operation.security)
    ? operation.security
    : isArray(document.security)
    ? document.security
    : undefined;
  if (requirements === undefined || requirements.length === 0) return undefined;
  const schemes = getSecuritySchemes(document);
  if (schemes === undefined) return undefined;
  for (const req of requirements) {
    if (!isObject(req)) continue;
    const name = Object.keys(req)[0];
    if (name === undefined) continue;
    const raw = schemes[name];
    const scheme = isObject(raw) ? deref(document, raw) : undefined;
    if (!isObject(scheme)) continue;
    const placement = mapSecurityScheme(scheme);
    if (placement !== undefined) return placement;
  }
  return undefined;
}

function extractBearerToken(headers: Record<string, string>): string | undefined {
  const auth = headers.Authorization ?? headers.authorization;
  return typeof auth === "string" ? /^Bearer\s+(.+)$/i.exec(auth)?.[1] : undefined;
}

// Relocate the resolved credential per the operation's placement. The provider
// hands us `Authorization: Bearer <token>`; this moves it where the scheme says
// (api-key header/query/cookie) or rewrites the scheme (basic). A bearer
// placement, a missing placement, or no bearer token present → no-op.
function applySecurity(
  placement: SecurityPlacement | undefined,
  headers: Record<string, string>,
  query: URLSearchParams,
  cookies: string[],
): void {
  if (placement === undefined) return;
  const token = extractBearerToken(headers);
  if (token === undefined || placement.kind === "bearer") return;
  if (placement.kind === "basic") {
    headers.Authorization = `Basic ${token}`;
    return;
  }
  delete headers.Authorization;
  if (placement.in === "header") headers[placement.name] = token;
  else if (placement.in === "query") query.set(placement.name, token);
  else cookies.push(`${placement.name}=${token}`);
}

// ── server URL (eve: openapi-spec.js) ────────────────────────────────────────

function substituteServerVariables(url: string, vars: Record<string, unknown>): string {
  return url.replace(/\{([^}]+)\}/g, (whole, name: string) => {
    const v = vars[name];
    return isObject(v) && typeof v.default === "string" ? v.default : whole;
  });
}

function extractOpenApiServerUrl(
  document: Record<string, unknown>,
  specSource: string | undefined,
): string | undefined {
  const servers = document.servers;
  if (!isArray(servers)) return undefined;
  for (const s of servers) {
    if (!isObject(s) || typeof s.url !== "string" || s.url.length === 0) continue;
    const url = isObject(s.variables) ? substituteServerVariables(s.url, s.variables) : s.url;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (typeof specSource === "string" && URL.canParse(specSource)) {
      try {
        return new URL(url, specSource).toString();
      } catch { /* fall through */ }
    }
  }
  return undefined;
}

function normalizeBasePath(basePath: string): string {
  const t = basePath.trim();
  if (t.length === 0 || t === "/") return "";
  return t.startsWith("/") ? t : `/${t}`;
}

function extractSwaggerScheme(document: Record<string, unknown>): string | undefined {
  const schemes = document.schemes;
  if (isArray(schemes)) {
    for (const s of schemes) if (s === "https" || s === "http") return s;
  }
  return undefined;
}

function extractSwaggerBaseUrl(
  document: Record<string, unknown>,
  specSource: string | undefined,
): string | undefined {
  const basePath = typeof document.basePath === "string" ? document.basePath : "";
  const host = typeof document.host === "string" && document.host.length > 0 ? document.host : "";
  const sourceUrl = typeof specSource === "string" && URL.canParse(specSource) ? new URL(specSource) : undefined;
  const scheme = extractSwaggerScheme(document) ?? sourceUrl?.protocol.replace(/:$/, "") ?? "https";
  if (host.length > 0) return `${scheme}://${host}${normalizeBasePath(basePath)}`;
  if (sourceUrl !== undefined) {
    const url = new URL(normalizeBasePath(basePath) || "/", sourceUrl.origin).toString();
    return url.endsWith("/") && normalizeBasePath(basePath).length === 0 ? url.slice(0, -1) : url;
  }
  return undefined;
}

function extractServerUrl(
  document: Record<string, unknown>,
  specSource: string | undefined,
): string | undefined {
  return extractOpenApiServerUrl(document, specSource) ?? extractSwaggerBaseUrl(document, specSource);
}

// ── spec parsing ─────────────────────────────────────────────────────────────

// v1: an inline document object or a JSON string. Remote-URL / file-path specs
// and YAML are deferred — a string that is not valid JSON gets a clear error.
function parseSpec(spec: unknown, connName: string): Record<string, unknown> {
  if (spec === undefined) {
    throw new Error(`OpenAPI connection "${connName}" is missing its "spec" source.`);
  }
  let doc: unknown = spec;
  if (typeof spec === "string") {
    try {
      doc = JSON.parse(spec);
    } catch {
      throw new Error(
        `OpenAPI connection "${connName}" spec is a string that is not valid JSON. v1 supports an ` +
          `inline spec object or a JSON string; remote URL / file-path specs and YAML are not yet supported.`,
      );
    }
  }
  if (!isObject(doc)) {
    throw new Error(`OpenAPI connection "${connName}" spec is not an OpenAPI document object.`);
  }
  return doc;
}

// ── operation assembly (eve: openapi-client.js) ──────────────────────────────

interface OpenApiOperation {
  toolName: string;
  method: HttpMethod;
  pathTemplate: string;
  description: string;
  parameters: OpenApiParameter[];
  requestBody: OpenApiRequestBody | undefined;
  inputSchema: Record<string, unknown>;
  security: SecurityPlacement | undefined;
}

// Swagger 2.0 keeps parameter schema keywords inline (no nested `schema`).
const SWAGGER_PARAMETER_SCHEMA_KEYS = [
  "default",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "items",
  "maximum",
  "maxItems",
  "maxLength",
  "minimum",
  "minItems",
  "minLength",
  "multipleOf",
  "pattern",
  "type",
  "uniqueItems",
];

function parameterSchema(document: Record<string, unknown>, param: Record<string, unknown>): Record<string, unknown> {
  if (isObject(param.schema)) return derefSchema(document, param.schema) as Record<string, unknown>;
  const swagger: Record<string, unknown> = {};
  for (const k of SWAGGER_PARAMETER_SCHEMA_KEYS) if (param[k] !== undefined) swagger[k] = param[k];
  return derefSchema(document, swagger) as Record<string, unknown>;
}

function resolveParameters(document: Record<string, unknown>, raw: readonly unknown[]): OpenApiParameter[] {
  const out: OpenApiParameter[] = [];
  for (const entry of raw) {
    const p = isObject(entry) ? deref(document, entry) : entry;
    if (!isObject(p)) continue;
    const loc = p.in;
    if ((loc !== "path" && loc !== "query" && loc !== "header" && loc !== "cookie") || typeof p.name !== "string") {
      continue;
    }
    out.push({
      name: p.name,
      location: loc,
      required: p.required === true || loc === "path",
      schema: parameterSchema(document, p),
      description: typeof p.description === "string" ? p.description : undefined,
    });
  }
  return out;
}

// Swagger 2.0 body parameter (`in: body`) fallback.
function swaggerBodyParam(document: Record<string, unknown>, raw: readonly unknown[]): OpenApiRequestBody | undefined {
  for (const entry of raw) {
    const p = isObject(entry) ? deref(document, entry) : entry;
    if (!isObject(p) || p.in !== "body") continue;
    const schema = isObject(p.schema) ? derefSchema(document, p.schema) as Record<string, unknown> : {};
    return { required: p.required === true, contentType: "application/json", schema };
  }
  return undefined;
}

function resolveRequestBody(
  document: Record<string, unknown>,
  node: unknown,
  params: readonly unknown[],
): OpenApiRequestBody | undefined {
  if (isObject(node)) {
    const rb = deref(document, node);
    if (isObject(rb) && isObject(rb.content)) {
      const content = rb.content;
      const contentType = "application/json" in content ? "application/json" : Object.keys(content)[0];
      if (contentType !== undefined) {
        const media = content[contentType];
        const schema = isObject(media) && isObject(media.schema)
          ? derefSchema(document, media.schema) as Record<string, unknown>
          : {};
        return { required: rb.required === true, contentType, schema };
      }
    }
  }
  return swaggerBodyParam(document, params);
}

function buildOperations(document: Record<string, unknown>): OpenApiOperation[] {
  const paths = document.paths;
  if (!isObject(paths)) return [];
  const ops: OpenApiOperation[] = [];
  const used = new Set<string>();
  for (const [pathTemplate, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    const sharedParams = isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const opNode = pathItem[method];
      if (!isObject(opNode)) continue;
      const toolName = uniqueName(operationName(opNode, method, pathTemplate), used);
      const opParams = isArray(opNode.parameters) ? opNode.parameters : [];
      const merged = [...sharedParams, ...opParams];
      const parameters = resolveParameters(document, merged);
      const requestBody = resolveRequestBody(document, opNode.requestBody, merged);
      ops.push({
        toolName,
        method,
        pathTemplate,
        description: operationDescription(opNode),
        parameters,
        requestBody,
        inputSchema: buildInputSchema(parameters, requestBody),
        security: resolveSecurity(document, opNode),
      });
    }
  }
  return ops;
}

// ── request building (eve: openapi-client.js #f) ─────────────────────────────

function appendQuery(query: URLSearchParams, name: string, value: unknown): void {
  if (isArray(value)) {
    for (const v of value) query.append(name, String(v));
    return;
  }
  query.append(name, String(value));
}

function joinPath(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function executeOperation(
  op: OpenApiOperation,
  baseUrl: string,
  baseHeaders: Record<string, string>,
  fetchFn: FetchLike,
  args: unknown,
): Promise<OpenApiToolResult> {
  // Clone so per-call path/query/security reshaping never mutates the shared,
  // per-turn resolved header set.
  const headers: Record<string, string> = { ...baseHeaders };
  let path = op.pathTemplate;
  const query = new URLSearchParams();
  const cookies: string[] = [];
  const input = isObject(args) ? args : {};

  for (const p of op.parameters) {
    const value = input[p.name];
    if (value == null) continue;
    if (p.location === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(String(value)));
    else if (p.location === "query") appendQuery(query, p.name, value);
    else if (p.location === "cookie") cookies.push(`${p.name}=${encodeURIComponent(String(value))}`);
    else headers[p.name] = String(value);
  }

  applySecurity(op.security, headers, query, cookies);

  if (cookies.length > 0) {
    const existing = headers.cookie ?? headers.Cookie;
    delete headers.Cookie;
    headers.cookie = [existing, ...cookies].filter((c) => !!c).join("; ");
  }

  const url = new URL(joinPath(baseUrl, path));
  url.search = query.toString();

  let body: string | undefined;
  if (op.requestBody !== undefined && input.body !== undefined) {
    body = JSON.stringify(input.body);
    headers["content-type"] = op.requestBody.contentType;
  }

  const res = await fetchFn(url, { method: op.method.toUpperCase(), headers, body });
  return { status: res.status, statusText: res.statusText, body: await readResponseBody(res) };
}

// ── entry point ──────────────────────────────────────────────────────────────

// Turn an OpenAPI connection into one realized tool per operation. `headers` is
// the provider's already-resolved outbound header set (static auth Bearer /
// header set) — the same value the MCP provider passes to realizeMcp; each
// operation's `security` then places that credential where the scheme dictates.
// The provider namespaces (`<conn>__<op>`), filters (allow/block), and marks
// approval on the returned tools, exactly as it does for MCP.
export function realizeOpenApi(
  conn: { name?: string; description: string; spec?: unknown; baseUrl?: string },
  headers: Record<string, string>,
  deps: OpenApiDeps = {},
): RealizedOpenApiTool[] {
  const connName = conn.name ?? "openapi";
  const document = parseSpec(conn.spec, connName);

  const override = typeof conn.baseUrl === "string" ? conn.baseUrl.trim() : "";
  const specSource = typeof conn.spec === "string" ? conn.spec : undefined;
  const baseUrl = override.length > 0 ? override : extractServerUrl(document, specSource);
  if (baseUrl === undefined) {
    throw new Error(
      `OpenAPI connection "${connName}" has no base URL: set "baseUrl" or ensure the document declares ` +
        `an absolute "servers" entry (OpenAPI) or "host" (Swagger).`,
    );
  }

  const fetchFn: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));

  return buildOperations(document).map((op) => ({
    name: op.toolName,
    description: op.description,
    inputSchema: op.inputSchema,
    execute: (input: unknown) => executeOperation(op, baseUrl, headers, fetchFn, input),
  }));
}
