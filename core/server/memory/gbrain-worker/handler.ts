// Thin, framework-free Deno fetch handler serving `/memory/<name>/mcp`
// (and `/memory/<name>/health`) directly against gbrain's Deno-native core
// (vendor/gbrain, patched P1-P5 — see vendor/gbrain/PATCHES.md). Ports the
// routing LOGIC of gbrain's now-dead Bun HTTP transport
// (vendor/gbrain/src/mcp/http-transport.ts's `/memory` branch +
// `handleMcpBody`) into a pure `(req: Request) => Promise<Response>` with no
// DB-backed access_tokens table, no CORS, no rate limiting, no request log —
// this is an internal trex-to-gbrain-core hop behind the control server, not
// a public transport. Auth is a single shared-secret bearer token
// (opts.token), supplied by the caller (H3's worker entry / control server).
//
// H2 scope: the handler + its test only. Wiring this into a `Deno.serve`
// entry point + staging it as a real edge worker is H3.
import type { PostgresEngine } from "gbrain/core/postgres-engine.ts";
import { dispatchToolCall } from "gbrain/mcp/dispatch.ts";
import { parseMemoryPath } from "gbrain/core/multi-tenant.ts";

// Matches vendor/gbrain/src/version.ts's VERSION shape closely enough for
// `initialize` responses; not import-mapped to gbrain's own VERSION const to
// avoid pulling package.json JSON-import machinery into this thin worker for
// a cosmetic field. Bump alongside vendor/gbrain upgrades if it drifts.
const SERVER_VERSION = "trex-memory-worker";

export interface CreateMemoryHandlerOpts {
  engine: PostgresEngine;
  /** Finite, operator-declared set of memory names this worker may serve. */
  allowlist: Set<string>;
  /** Shared-secret bearer token for the internal trex -> gbrain-core hop. */
  token: string;
  /**
   * Optional mount-prefix to strip before routing, mirroring how
   * core/server/agents/service/handler.ts anchors on TREX_AGENT_BASE. H2
   * keeps this simple: a plain string prefix read once at construction time
   * (the caller resolves it from env / plugin config); if the incoming path
   * doesn't start with it, the request 404s before any /memory/ matching.
   */
  basePath?: string;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function notFound(): Response {
  return jsonResponse({ error: "not_found" }, { status: 404 });
}

// Constant-time string compare (equal-length fast path via XOR-accumulate;
// falls back to a length check that necessarily leaks length, same as any
// bearer-token comparison — not worse than the reference http-transport.ts,
// which compares via a DB hash lookup instead).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function checkBearer(req: Request, token: string): boolean {
  // Fail closed when GBRAIN_MEMORY_TOKEN is unset ("" would otherwise match
  // an empty presented secret) — this check is the route's only auth gate.
  if (!token) return false;
  // `Headers.get` is case-insensitive per the Fetch spec, so a single
  // lowercase lookup already covers `Authorization`/`authorization`/etc. —
  // no separate-case fallback needed.
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const presented = header.slice("Bearer ".length);
  return timingSafeEqual(presented, token);
}

interface JsonRpcBody {
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
  id?: unknown;
}

/**
 * The JSON-RPC body handler: parse -> initialize / notifications/initialized
 * / tools/list / tools/call -> Response. Direct port of http-transport.ts's
 * `handleMcpBody`, minus the auth/rate-limit/CORS/logging concerns that live
 * one layer up in `createMemoryHandler` (this worker's bearer check already
 * ran by the time this is called) and minus `tools/list`'s tool-defs table
 * (not needed for H2 — the handler doesn't yet expose tool discovery; add
 * `buildToolDefs(operations)` here if/when a caller needs it).
 */
async function handleMcpBody(
  req: Request,
  engine: PostgresEngine,
  schema: string,
): Promise<Response> {
  let body: JsonRpcBody;
  try {
    body = JSON.parse(await req.text());
  } catch (e) {
    // No `id` is available yet (the body didn't parse), so echo `id: null`
    // per JSON-RPC convention for requests whose id couldn't be determined —
    // still shaped like the other JSON-RPC responses below (jsonrpc + id).
    // Do NOT echo the parse error's message back to the caller — a caught
    // error's text can carry stack/internal detail (js/stack-trace-exposure).
    // Static client message; nothing server-side worth logging for a bad body.
    void e;
    return jsonResponse(
      {
        error: "parse_error",
        message: "invalid JSON body",
        jsonrpc: "2.0",
        id: null,
      },
      { status: 400 },
    );
  }

  const { method, params, id } = body;

  if (method === "initialize") {
    return jsonResponse({
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "gbrain", version: SERVER_VERSION },
        capabilities: { tools: {} },
      },
      jsonrpc: "2.0",
      id,
    });
  }

  if (method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }

  if (method === "tools/list") {
    // H2 doesn't wire buildToolDefs(operations) — see doc comment above.
    return jsonResponse({ result: { tools: [] }, jsonrpc: "2.0", id });
  }

  if (method === "tools/call") {
    const toolName = params?.name ?? "unknown";
    const args = params?.arguments ?? {};
    const result = await engine.withSchema(schema, (scoped) =>
      dispatchToolCall(scoped, toolName, args, { schema, sourceId: "default" })
    );
    return jsonResponse({ result, jsonrpc: "2.0", id });
  }

  return jsonResponse(
    { error: "unknown_method", message: `Unknown method: ${method}`, jsonrpc: "2.0", id },
    { status: 400 },
  );
}

/**
 * Builds the pure fetch handler for `/memory/<name>/mcp` +
 * `/memory/<name>/health`. Every other path (including a bare `/memory` or a
 * memory name outside `opts.allowlist`) 404s — the allow-list gate mirrors
 * gbrain's `GBRAIN_MEMORY_ALLOWLIST` design (design §8): memories are a
 * FINITE set declared by tpm-installed plugins, never an arbitrary
 * caller-supplied name.
 */
export function createMemoryHandler(
  opts: CreateMemoryHandlerOpts,
): (req: Request) => Promise<Response> {
  const { engine, allowlist, token, basePath = "" } = opts;

  return async (req: Request): Promise<Response> => {
    try {
      const url = new URL(req.url);
      let path = url.pathname;

      if (basePath) {
        // Boundary-safe prefix check: a bare `startsWith` would let
        // `/apiFOO` match a `basePath` of `/api`. Require an exact match or
        // a `/`-delimited continuation.
        if (path !== basePath && !path.startsWith(basePath + "/")) return notFound();
        path = path.slice(basePath.length) || "/";
      }

      // Parse the path SHAPE first, without consulting the allow-list, so
      // routing (health vs mcp, method) doesn't yet reveal allow-list
      // membership. `parseMemoryPath` still rejects malformed names / bad
      // schema idents here — that's a syntactic 404 (same for every caller,
      // authenticated or not), not an allow-list leak.
      const mem = parseMemoryPath(path);
      if (!mem) return notFound();

      if (mem.rest === "/health") {
        // /health stays unauthenticated by design (matches the vendored
        // http-transport.ts: liveness probes shouldn't need a bearer
        // token), so there's no bearer-vs-allowlist ordering concern here —
        // the allow-list gate can run immediately.
        if (!allowlist.has(mem.name)) return notFound();
        if (req.method !== "GET") return notFound();
        try {
          await engine.withSchema(mem.schema, (e) => e.executeRaw("SELECT 1"));
        } catch {
          return jsonResponse({ status: "unhealthy", memory: mem.name }, { status: 503 });
        }
        return jsonResponse({ status: "ok", memory: mem.name });
      }

      if (mem.rest !== "/mcp") return notFound();
      if (req.method !== "POST") {
        return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
      }

      // Bearer check BEFORE the allow-list evaluation: this is the
      // enumeration-oracle fix. An unauthenticated (missing/wrong token)
      // request must get the same 401 whether `mem.name` is a declared
      // memory or not — otherwise 401-vs-404 lets a caller with no
      // credentials enumerate which memories exist.
      if (!checkBearer(req, token)) {
        return jsonResponse(
          { error: "invalid_token", message: "Bearer token required" },
          { status: 401 },
        );
      }

      if (!allowlist.has(mem.name)) return notFound();

      // Auto-provision on first touch (idempotent — provisionSchema caches
      // "already provisioned" in-process and re-checks via advisory lock).
      try {
        await engine.provisionSchema(mem.name);
      } catch (e) {
        // Log the detail server-side; return a generic message so error/stack
        // internals aren't exposed to the caller (js/stack-trace-exposure).
        console.error(`[memory-worker] provisionSchema(${mem.name}) failed:`, e);
        return jsonResponse(
          { error: "provision_failed", message: "provisioning failed" },
          { status: 500 },
        );
      }

      return await handleMcpBody(req, engine, mem.schema);
    } catch (e) {
      // Backstop for anything that throws outside the narrower try/catches
      // above — notably `engine.withSchema`'s transactional setup
      // (conn.begin + SET LOCAL) inside `handleMcpBody`'s `tools/call`
      // branch, which runs before `dispatchToolCall`'s own internal catch.
      // A thrown error must never escape this returned handler function.
      // Log the detail server-side; return a generic message so error/stack
      // internals aren't exposed to the caller (js/stack-trace-exposure).
      console.error("[memory-worker] unhandled error:", e);
      return jsonResponse(
        {
          error: "internal_error",
          message: "internal error",
          jsonrpc: "2.0",
          id: null,
        },
        { status: 500 },
      );
    }
  };
}
