import { STATUS_CODE } from "jsr:@std/http@^1.0/status";
import { join } from "jsr:@std/path@^1.0";
import express from "express";
import { createServer, request as httpRequest } from "node:http";
import { grafserv } from "postgraphile/grafserv/express/v4";
import cors from "cors";
import { BASE_PATH } from "./config.ts";
import { pool } from "./db.ts";
import { authRouter } from "./auth/auth-router.ts";
import { ensureAuthKeys } from "./auth/api-keys.ts";
import { verifyAccessToken } from "./auth/jwt.ts";
import { createPostGraphile } from "./postgraphile.ts";
import { authContext } from "./middleware/auth-context.ts";
import { Plugins } from "./plugin/plugin.ts";
import { addPluginRoutes } from "./routes/plugin.ts";
import { functionsRouter } from "./routes/functions.ts";
import { cliLoginRouter } from "./routes/cli-login.ts";
import { fnmap } from "./plugin/function.ts";
import { apiLimiter } from "./middleware/rate-limit.ts";

console.log("main function started");
console.log(Deno.version);

addEventListener("beforeunload", () => {
  console.log("main worker exiting");
});

addEventListener("unhandledrejection", (ev) => {
  console.log(ev);
  ev.preventDefault();
});

const app = express();
app.set("trust proxy", true);
const server = createServer(app);

const trustedOrigins = (Deno.env.get("BETTER_AUTH_TRUSTED_ORIGINS") || "").split(",").filter(Boolean);
app.use(cors({
  origin: trustedOrigins.length > 0 ? trustedOrigins : false,
  credentials: true,
}));

// `TREX_DEBUG=studio` (or `=all`) turns on the verbose studio-dispatcher /
// graphql / storage diagnostics that are otherwise silent.
const _TREX_DEBUG = (Deno.env.get("TREX_DEBUG") || "").toLowerCase().split(",").map((s) => s.trim());
const DEBUG_STUDIO = _TREX_DEBUG.includes("studio") || _TREX_DEBUG.includes("all");
const DEBUG_GRAPHQL = _TREX_DEBUG.includes("graphql") || _TREX_DEBUG.includes("all");

// Body buffer for studio API requests — drains the request stream into a
// Buffer on `req.body` and marks `_body = true` so downstream body-parsers
// (notably the `express.json()` inside the globally-mounted cliLoginRouter)
// don't try to re-read the now-empty stream and 500 with
// "stream is not readable". `buildWorkerRequest` then forwards the buffered
// bytes to the sidecar.
//
// Per-content-type byte caps: JSON Studio API calls are small (a few KB);
// multipart deploys can be tens of MB. Whatever runs through, refuse with
// 413 once the appropriate cap is hit and tear the socket down so the
// remaining payload doesn't get buffered.
const STUDIO_BODY_MAX_JSON = 5 * 1024 * 1024;
const STUDIO_BODY_MAX_MULTIPART = 50 * 1024 * 1024;
app.use(["/plugins/trex/studio/api", "/plugins/trex/studio/api/*"], async (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  if (Buffer.isBuffer((req as any).body) && (req as any).body.length > 0) return next();
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  const isMultipart = ct.startsWith("multipart/");
  const limit = isMultipart ? STUDIO_BODY_MAX_MULTIPART : STUDIO_BODY_MAX_JSON;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of req as any) {
      const c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += c.length;
      if (total > limit) {
        try { (req as any).destroy?.(); } catch { /* ignore */ }
        res.status(413).json({
          error: "payload_too_large",
          error_description: `Body exceeds ${limit} bytes`,
        });
        return;
      }
      chunks.push(c);
    }
  } catch (e) {
    console.error("[studio-body-buffer] read error:", e);
    return next();
  }
  (req as any).body = Buffer.concat(chunks, total);
  (req as any)._body = true;
  if (DEBUG_STUDIO) {
    console.log(`[studio-body-buffer] ${req.method} ${req.originalUrl} read=${total}`);
  }
  next();
});

// Public settings endpoint — no auth required, only whitelisted keys
const PUBLIC_SETTING_KEYS = ["auth.selfRegistration", "auth.anonKey"];

app.get(`${BASE_PATH}/api/settings/public`, apiLimiter, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM trex.setting WHERE key = ANY($1)`,
      [PUBLIC_SETTING_KEYS]
    );
    const settings: Record<string, any> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch {
    // Table may not exist yet — return safe defaults
    res.json({ "auth.selfRegistration": false });
  }
});

// Web shell extension config — env-driven nav items.
// TREX_WEB_NAV_EXTRA is a JSON array of { path, label, plugin } entries.
// Each entry adds a top-nav link in the web shell that routes to a single-spa
// mount of the named plugin (loaded from /plugins/trex/<plugin>/<plugin>-spa.js).
app.get(`${BASE_PATH}/api/web-config`, apiLimiter, (_req, res) => {
  let navExtra: unknown[] = [];
  const raw = Deno.env.get("TREX_WEB_NAV_EXTRA");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) navExtra = parsed;
    } catch (err) {
      console.warn("[web-config] invalid TREX_WEB_NAV_EXTRA:", err);
    }
  }
  res.json({ navExtra });
});

// Mount GoTrue-compatible auth router
app.use(`${BASE_PATH}/auth/v1`, authRouter);

// Deno doesn't have `global` — polyfill for npm packages that expect Node.js
if (typeof (globalThis as any).global === "undefined") {
  (globalThis as any).global = globalThis;
}

// MCP server (before authContext — uses its own API key auth)
try {
  const { mountMcpServer } = await import("./mcp/index.ts");
  mountMcpServer(app);
  console.log(`MCP server mounted on ${BASE_PATH}/mcp`);
} catch (err) {
  console.error("MCP server failed to initialize:", err);
}

// Helper: extract user from Bearer token (for session-based admin endpoints)
async function getAuthUser(req: any): Promise<{ id: string; role: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  return { id: claims.sub, role: claims.app_metadata?.trex_role || "user" };
}

// API key management endpoint (Bearer-token authenticated)
app.post(`${BASE_PATH}/api/api-keys`, apiLimiter, express.json(), async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    const { generateApiKey } = await import("./mcp/auth.ts");
    const { name, expiresAt } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    let expiresDate: Date | undefined;
    if (expiresAt) {
      expiresDate = new Date(expiresAt);
      if (isNaN(expiresDate.getTime())) {
        res.status(400).json({ error: "Invalid expiresAt date" });
        return;
      }
    }
    const result = await generateApiKey(
      user.id,
      name,
      expiresDate,
    );
    res.json(result);
  } catch (err) {
    console.error("API key creation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get(`${BASE_PATH}/api/api-keys`, apiLimiter, async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    const result = await pool.query(
      `SELECT id, name, key_prefix, "lastUsedAt", "expiresAt", "revokedAt", "createdAt" FROM trex.api_key WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
      [user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("API key list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete(`${BASE_PATH}/api/api-keys/:id`, apiLimiter, async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    const result = await pool.query(
      `UPDATE trex.api_key SET "revokedAt" = NOW() WHERE id = $1 AND "userId" = $2 AND "revokedAt" IS NULL RETURNING id`,
      [req.params.id, user.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Key not found or already revoked" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("API key revoke error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate Supabase CLI compatible access token (sbp_ format)
app.post(`${BASE_PATH}/api/cli-token`, apiLimiter, express.json(), async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    const { generateApiKey } = await import("./mcp/auth.ts");
    const name = req.body?.name || "supabase-cli";
    const result = await generateApiKey(user.id, name, undefined, "sbp_");
    res.json({ access_token: result.key });
  } catch (err) {
    console.error("CLI token creation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dynamic plugin registration — register functions from a given directory.
// Loads code from disk and spawns workers, so it must require admin auth and
// strict containment within an allow-listed workspace directory (resolved via
// Deno.realPath to defeat `..` traversal and symlink escape).
app.post(`${BASE_PATH}/api/plugins/register`, apiLimiter, express.json(), async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    const { path: dirPath } = req.body || {};
    if (!dirPath || typeof dirPath !== "string") {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const allowedPrefixes = [
      Deno.env.get("DEVX_WORKSPACE_DIR") || "/tmp/devx-workspaces",
      "/var/devx-workspaces",
    ];
    let canonical: string;
    try {
      canonical = await Deno.realPath(dirPath);
    } catch {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    const resolvedPrefixes = (
      await Promise.all(
        allowedPrefixes.map(async (p) => {
          try {
            return await Deno.realPath(p);
          } catch {
            return null;
          }
        }),
      )
    ).filter((p): p is string => p !== null);
    const contained = resolvedPrefixes.some(
      (p) => canonical === p || canonical.startsWith(p + "/"),
    );
    if (!contained) {
      res.status(403).json({ error: "Path not in allowed workspace directory" });
      return;
    }
    const result = await Plugins.registerFromPath(app, canonical);
    if (result.ok) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error("Plugin registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin-only: get auth keys
app.get(`${BASE_PATH}/api/settings/auth-keys`, apiLimiter, async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    const result = await pool.query(
      `SELECT key, value FROM trex.setting WHERE key IN ('auth.anonKey', 'auth.serviceRoleKey')`,
    );
    const keys: Record<string, string> = {};
    for (const row of result.rows) {
      keys[row.key] = typeof row.value === "string" ? row.value : JSON.parse(row.value);
    }
    res.json(keys);
  } catch (err) {
    console.error("Auth keys error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PostgREST proxy — before authContext since PostgREST handles its own JWT verification
const POSTGREST_HOST = Deno.env.get("POSTGREST_HOST") || "postgrest";
const POSTGREST_PORT = Deno.env.get("POSTGREST_PORT") || "3000";

app.all(`${BASE_PATH}/rest/v1/*`, (req, res) => {
  const targetPath = req.originalUrl.replace(`${BASE_PATH}/rest/v1`, "") || "/";

  const headers: Record<string, string> = {};
  const forwardHeaders = [
    "authorization", "apikey", "prefer", "range", "content-type",
    "accept", "content-profile", "accept-profile", "x-client-info",
  ];
  for (const h of forwardHeaders) {
    if (req.headers[h]) {
      headers[h] = Array.isArray(req.headers[h]) ? req.headers[h].join(", ") : req.headers[h] as string;
    }
  }

  // supabase-js sends apikey header + Authorization header.
  // If no Authorization header, use apikey as Bearer token so PostgREST can determine the role.
  if (!headers["authorization"] && headers["apikey"]) {
    headers["authorization"] = `Bearer ${headers["apikey"]}`;
  }

  const proxyReq = httpRequest(
    {
      hostname: POSTGREST_HOST,
      port: parseInt(POSTGREST_PORT),
      path: targetPath,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 500);
      const skipHeaders = new Set(["transfer-encoding"]);
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!skipHeaders.has(key) && value !== undefined) {
          res.setHeader(key, value);
        }
      }
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    console.error("[postgrest-proxy] Error:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "PostgREST unavailable" });
    }
  });

  req.pipe(proxyReq);
});

// Supabase CLI subdomain routing — the CLI hits https://{ref}.trex.local/storage/v1/...
// without the BASE_PATH prefix. Rewrite to include the prefix so routes match.
if (BASE_PATH && BASE_PATH !== "/") {
  const supabasePaths = ["/storage/v1/", "/auth/v1/", "/rest/v1/", "/functions/v1/"];
  app.use((req, _res, next) => {
    if (!req.url.startsWith(BASE_PATH) && supabasePaths.some((p) => req.url.startsWith(p))) {
      req.url = `${BASE_PATH}${req.url}`;
      req.originalUrl = req.url;
    }
    next();
  });
}

// CLI login polling endpoint — no auth required (before authContext)
app.use(cliLoginRouter);

app.use(apiLimiter);
app.use(authContext);

// Admin-only gate for Studio's /api/** — the forwarder talks to the
// sidecar using its own SERVICE_KEY, so without this any unauthenticated
// caller would get full admin data. Static HTML/JS/CSS under
// /plugins/trex/studio/** isn't gated: it carries no data, and gating it
// would block the iframe's initial load before the cookie is even sent.
//
// `authContext` upstream has already decoded the sb-access-token cookie /
// Authorization header / apikey header and populated req.pgSettings.
app.use("/plugins/trex/studio/api", (req, res, next) => {
  const role = (req as any).pgSettings?.["app.user_role"];
  if (role === "admin") return next();
  res.status(role ? 403 : 401).json({
    error: role ? "forbidden" : "not_authenticated",
    error_description: "Studio API is admin-only",
  });
});

try {
// ---------------------------------------------------------------------------
// Studio URL rewriter for Next.js dynamic-segment routes.
// Studio's static export emits files with literal bracket-segment paths
// (e.g. /project/[ref]/index.html). The browser hits /project/default/...,
// so we rewrite incoming URLs to map any non-bracket segment in a dynamic
// position to its bracket-form sibling on disk. The walk is bounded by the
// build_static tree under plugins/studio/.
// ---------------------------------------------------------------------------
const STUDIO_STATIC_DIR = "/usr/src/plugins-dev/studio/build_static";

// Cache rewrite results — the static export tree is immutable at runtime,
// so once we've resolved a path we never need to re-scan it. Bounded so a
// flood of garbage URLs can't blow up memory.
const STUDIO_REWRITE_CACHE = new Map<string, string>();
const STUDIO_REWRITE_CACHE_MAX = 4096;

function rewriteStudioUrl(originalUrl: string): string {
  const cached = STUDIO_REWRITE_CACHE.get(originalUrl);
  if (cached !== undefined) return cached;
  const result = computeStudioRewrite(originalUrl);
  if (STUDIO_REWRITE_CACHE.size >= STUDIO_REWRITE_CACHE_MAX) {
    // Simple LRU-ish eviction: drop the oldest insertion.
    const firstKey = STUDIO_REWRITE_CACHE.keys().next().value;
    if (firstKey !== undefined) STUDIO_REWRITE_CACHE.delete(firstKey);
  }
  STUDIO_REWRITE_CACHE.set(originalUrl, result);
  return result;
}

function computeStudioRewrite(originalUrl: string): string {
  const queryIdx = originalUrl.indexOf("?");
  const pathOnly = queryIdx >= 0 ? originalUrl.slice(0, queryIdx) : originalUrl;
  const query = queryIdx >= 0 ? originalUrl.slice(queryIdx) : "";

  if (!pathOnly.startsWith("/plugins/trex/studio")) return originalUrl;
  // Skip /api/* — dispatched separately
  if (pathOnly.startsWith("/plugins/trex/studio/api")) return originalUrl;

  const stripped = pathOnly.slice("/plugins/trex/studio".length);
  const segments = stripped.split("/").filter(Boolean);
  if (segments.length === 0) return originalUrl;

  let cur = STUDIO_STATIC_DIR;
  const outSegs: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // Try literal child first
    const literal = `${cur}/${seg}`;
    let stat: any;
    try { stat = Deno.statSync(literal); } catch { stat = null; }
    if (stat?.isDirectory) {
      outSegs.push(seg);
      cur = literal;
      continue;
    }
    if (stat?.isFile) {
      // Last segment may be a file (e.g. .js, .css) — keep it as-is
      outSegs.push(seg);
      cur = literal;
      continue;
    }

    // No literal match — look for a bracket sibling at this level
    let bracket: string | null = null;
    let catchall: string | null = null;
    try {
      for (const e of Deno.readDirSync(cur)) {
        if (!e.isDirectory) continue;
        if (e.name.startsWith("[[...")) catchall = e.name;
        else if (e.name.startsWith("[") && e.name.endsWith("]")) bracket = e.name;
      }
    } catch { /* directory unreadable, give up */ }

    if (bracket) {
      outSegs.push(bracket);
      cur = `${cur}/${bracket}`;
      continue;
    }
    if (catchall) {
      // Catch-all eats everything that follows
      outSegs.push(catchall);
      return "/plugins/trex/studio/" + outSegs.join("/") + query;
    }
    // Nothing matched — return original (will 404 → SPA fallback)
    return originalUrl;
  }

  const rewritten = "/plugins/trex/studio/" + outSegs.join("/") + (pathOnly.endsWith("/") ? "/" : "") + query;
  return rewritten;
}

// Send the Studio root straight to the project page. Studio's static
// export emits a literal `[ref]` folder for dynamic routes; the index page's
// internal router.replace can't resolve `/project/[ref]` against an `as` of
// `/`, throws, and the page hangs. Skipping straight to /project/default
// avoids that path entirely.
app.get(["/plugins/trex/studio", "/plugins/trex/studio/"], (_req, res) => {
  res.redirect(302, "/plugins/trex/studio/project/default/");
});

app.use((req, _res, next) => {
  if (req.url.startsWith("/plugins/trex/studio")) {
    const next_url = rewriteStudioUrl(req.url);
    if (next_url !== req.url) req.url = next_url;
  }
  next();
});

// ---------------------------------------------------------------------------
// Studio dispatchers
// ---------------------------------------------------------------------------
// All /plugins/trex/studio/api/** requests proxy straight to the Studio Node
// sidecar (`STUDIO_INTERNAL_URL`, set up as the @trex/studio function plugin).
// Static UI assets under /plugins/trex/studio/** that aren't /api are served
// by the @trex/studio UI plugin from the baked-in Next.js static export.
//
// History: this used to route to per-category Deno function plugins
// (@trex/studio-api/functions/{pg-meta-a,pg-meta-b,projects,auth,…}) first
// and only fall through to the sidecar on worker failure. The Edge Runtime
// supervisor's hardcoded per-worker limits killed every worker on its first
// request with `connection closed before message completed`, so 100% of
// traffic fell through anyway — for the cost of an extra hop and a crash
// log per request. Removed the function-plugin tier (`plugins/studio-api/`)
// and the dispatcher fanout; the sidecar handles everything now.
// ---------------------------------------------------------------------------

// Build a Web Request for the function plugin from an Express req
function buildWorkerRequest(req: any, rewrittenPath?: string): globalThis.Request {
  const host = req.get("host") || "localhost";
  const protocol = req.protocol || "http";
  const path = rewrittenPath ?? req.originalUrl;
  const requestUrl = `${protocol}://${host}${path}`;
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (!val) continue;
    const lower = key.toLowerCase();
    if (lower === "accept-encoding" || lower === "content-length") continue;
    headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
  }
  let body: Blob | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body && (req.body as Buffer).length > 0) {
    // Copy the Buffer so subsequent calls (e.g. fall-through to the sidecar
    // after a function plugin call) still see the body. Passing a Buffer
    // directly to Blob can mark the source as transferred in some runtimes.
    body = new Blob([new Uint8Array(req.body as Buffer)]);
  }
  return new globalThis.Request(requestUrl, { method: req.method, headers, body });
}

// Stream a function plugin's Web Response back through Express. Avoids
// buffering large responses (Monaco editor chunks, multipart deploy fetches)
// in memory.
async function pipeWorkerResponse(workerResponse: globalThis.Response, res: any) {
  res.status(workerResponse.status);
  workerResponse.headers.forEach((value: string, key: string) => {
    const lower = key.toLowerCase();
    if (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  if (!workerResponse.body) { res.end(); return; }
  const reader = workerResponse.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
    try { res.end(); } catch { /* already ended (e.g. client disconnect) */ }
  }
}

// Redact obvious secrets before logging. Logs ship to disk/stdout and could
// be read by anyone with infra access; passwords, tokens, and admin keys
// must not appear in plain text. Best-effort — covers the JSON-body shape.
function redactForLog(s: string): string {
  return s
    .replace(/("(?:password|currentPassword|newPassword|access_token|refresh_token|apikey|api_key|service_role_key|anon_key|client_secret|token|otp|magiclink|secret)"\s*:\s*")[^"]*(")/gi, '$1***$2')
    .replace(/("authorization"\s*:\s*"Bearer\s+)[^"]*(")/gi, '$1***$2');
}

// Forward a request to the @trex/studio sidecar proxy plugin
async function forwardToStudioSidecar(req: any, res: any) {
  const handler = fnmap["@trex/studio/functions"];
  if (!handler) {
    res.status(503).json({ error: "Studio plugin not loaded" });
    return;
  }
  const sidecarPath = req.originalUrl.replace("/plugins/trex/studio", "/studio-proxy");
  const bodyLen = req.body && (req.body as Buffer).length ? (req.body as Buffer).length : 0;
  if (DEBUG_STUDIO) {
    console.log(`[studio-sidecar-fwd] ${req.method} ${sidecarPath} bodyLen=${bodyLen} ct=${req.headers["content-type"] ?? ""}`);
  }
  const webReq = buildWorkerRequest(req, sidecarPath);
  const workerResponse = await handler(webReq);
  // When the sidecar returns 4xx/5xx for an API call, log the request body
  // and response body so we can see what Studio sent. Gated behind
  // TREX_DEBUG=studio so the noise — and the secret-leak risk from logging
  // request bodies that contain passwords or tokens — stays out of normal
  // operation.
  if (DEBUG_STUDIO && workerResponse.status >= 400 && sidecarPath.startsWith("/studio-proxy/api/")) {
    const cloned = workerResponse.clone();
    try {
      const reqBody = bodyLen > 0 ? redactForLog((req.body as Buffer).toString("utf8").slice(0, 800)) : "";
      const resBody = redactForLog((await cloned.text()).slice(0, 800));
      console.log(`[studio-sidecar-${workerResponse.status >= 500 ? "5xx" : "4xx"}] ${req.method} ${sidecarPath} status=${workerResponse.status}\n  reqBody=${reqBody}\n  resBody=${resBody}`);
    } catch { /* ignore */ }
  }
  await pipeWorkerResponse(workerResponse, res);
}

// Studio polls /platform/notifications* on every page (every ~10s) — these
// are Supabase Cloud-only endpoints with no server route in self-hosted
// Studio. Return empty stubs so the browser console stays quiet.
app.get("/plugins/trex/studio/api/platform/notifications", (_req, res) => {
  res.status(200).json([]);
});
app.get("/plugins/trex/studio/api/platform/notifications/summary", (_req, res) => {
  res.status(200).json({ has_new: false, has_warning: false, has_critical: false });
});
app.post("/plugins/trex/studio/api/platform/notifications/archive-all", (_req, res) => {
  res.status(200).json([]);
});

app.all(
  ["/plugins/trex/studio/api", "/plugins/trex/studio/api/*"],
  async (req, res) => {
    try {
      await forwardToStudioSidecar(req, res);
    } catch (err) {
      console.error("[studio-api] Error:", err);
      res.status(500).json({ error: "Internal server error", message: String(err) });
    }
  },
);

// /plugins/trex/studio/** (non-API) is served by the @trex/studio UI plugin's
// static route, which points at plugins/studio/build_static/ — Studio's
// Next.js static export. No sidecar in the path.

  await Plugins.initPlugins(app);
  addPluginRoutes(app);
  console.log("Plugin system initialized");

  // Re-register devx app functions (dynamic plugins don't survive restarts)
  const WORKSPACE_DIR = Deno.env.get("DEVX_WORKSPACE_DIR") || "/tmp/devx-workspaces";
  try {
    const appsResult = await pool.query(
      `SELECT path FROM devx.apps WHERE path IS NOT NULL AND path != ''`,
    );
    let count = 0;
    for (const row of appsResult.rows) {
      const appPath = `${WORKSPACE_DIR}/${row.path}`;
      try {
        await Deno.stat(`${appPath}/package.json`);
        await Plugins.registerFromPath(app, appPath);
        count++;
      } catch { /* skip apps without package.json */ }
    }
    if (count > 0) console.log(`Re-registered ${count} devx app functions`);
  } catch { /* devx schema may not exist yet */ }
} catch (err) {
  console.error("Plugin system failed to initialize:", err);
}

// Supabase-compatible /storage/v1/* route — calls storage worker directly.
// Bypasses pluginAuthz because Supabase Storage handles its own JWT auth
// (required for public bucket access without a Bearer token).
// Use express.raw() to capture the raw body before any middleware consumes it.
app.all(`${BASE_PATH}/storage/v1/*`, express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  const handler = fnmap["@trex/storage/supabase-storage/functions"];
  if (!handler) {
    res.status(503).json({ error: "Storage plugin not loaded" });
    return;
  }
  try {
    const host = req.get("host") || "localhost";
    const protocol = req.protocol || "http";
    // Rewrite /trex/storage/v1/... to /storage-api/...
    const storagePath = req.originalUrl.replace(`${BASE_PATH}/storage/v1`, "/storage-api");
    const requestUrl = `${protocol}://${host}${storagePath}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) {
        const lower = key.toLowerCase();
        if (lower === "accept-encoding" || lower === "content-length") continue;
        headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
      }
    }

    let body: Blob | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      // req.body may be a Buffer (from express.raw) or an already-parsed
      // object (cliLoginRouter mounted upstream calls express.json() which
      // runs on every request that enters the router — including this one
      // — and short-circuits the raw parser). Handle both.
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        body = new Blob([req.body]);
      } else if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        body = new Blob([JSON.stringify(req.body)], { type: "application/json" });
        headers.set("content-type", "application/json");
      } else if (storagePath.startsWith("/storage-api/object/list/")) {
        // Supabase CLI sends POST to /object/list/ with empty body — inject defaults
        body = new Blob([JSON.stringify({ prefix: "", limit: 100, offset: 0 })], { type: "application/json" });
        headers.set("content-type", "application/json");
      } else if (headers.get("content-type")?.includes("application/json")) {
        body = new Blob(["{}"], { type: "application/json" });
      }
    }

    const webReq = new globalThis.Request(requestUrl, { method: req.method, headers, body });
    const workerResponse = await handler(webReq);

    res.status(workerResponse.status);
    workerResponse.headers.forEach((value: string, key: string) => {
      const lower = key.toLowerCase();
      if (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding") return;
      res.setHeader(key, value);
    });
    const responseBody = await workerResponse.text();
    res.send(responseBody);
  } catch (err) {
    console.error("[storage-proxy] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Supabase-compatible /pg/v1/* route — calls postgres-meta worker directly.
app.all(`${BASE_PATH}/pg/v1/*`, express.json({ limit: "5mb" }), async (req, res) => {
  const handler = fnmap["@trex/pg-meta/postgres-meta/functions"];
  if (!handler) {
    res.status(503).json({ error: "pg-meta plugin not loaded" });
    return;
  }
  try {
    const host = req.get("host") || "localhost";
    const protocol = req.protocol || "http";
    // Rewrite /trex/pg/v1/... to /pg-meta-api/...
    const metaPath = req.originalUrl.replace(`${BASE_PATH}/pg/v1`, "/pg-meta-api");
    const requestUrl = `${protocol}://${host}${metaPath}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) {
        const lower = key.toLowerCase();
        if (lower === "accept-encoding" || lower === "content-length") continue;
        headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
      }
    }

    let body: Blob | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const rawBody = JSON.stringify(req.body);
      if (rawBody && rawBody !== "undefined") {
        body = new Blob([rawBody], { type: "application/json" });
        headers.set("content-type", "application/json");
      }
    }

    const webReq = new globalThis.Request(requestUrl, { method: req.method, headers, body });
    const workerResponse = await handler(webReq);

    res.status(workerResponse.status);
    workerResponse.headers.forEach((value: string, key: string) => {
      const lower = key.toLowerCase();
      if (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding") return;
      res.setHeader(key, value);
    });
    const responseBody = await workerResponse.text();
    res.send(responseBody);
  } catch (err) {
    console.error("[pg-meta-proxy] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Run core schema migrations (SCHEMA_DIR) via direct PostgreSQL connection
try {
  const schemaDir = Deno.env.get("SCHEMA_DIR");
  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (schemaDir && databaseUrl) {
    const { Pool } = await import("pg");
    const { poolSsl } = await import("./lib/db-ssl.ts");
    const migrationPool = new Pool({ connectionString: databaseUrl, ...poolSsl(databaseUrl) });
    try {
      // Ensure trex schema exists
      await migrationPool.query("CREATE SCHEMA IF NOT EXISTS trex");
      await migrationPool.query(`CREATE TABLE IF NOT EXISTS trex._migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      // Read and apply migration files in order
      const files: string[] = [];
      for await (const entry of Deno.readDir(schemaDir)) {
        if (entry.isFile && entry.name.endsWith(".sql")) {
          files.push(entry.name);
        }
      }
      files.sort();

      let applied = 0;
      for (const file of files) {
        const version = file.replace(".sql", "");
        const check = await migrationPool.query(
          "SELECT 1 FROM trex._migrations WHERE version = $1",
          [version],
        );
        if (check.rows.length > 0) continue;

        const sql = await Deno.readTextFile(`${schemaDir}/${file}`);
        try {
          await migrationPool.query(sql);
          applied++;
          console.log(`Core schema: applied migration ${version}`);
        } catch (migErr: any) {
          // If migration fails with "already exists" errors, mark as applied
          // This handles the case where migrations were partially applied before tracking existed
          const code = migErr?.code;
          if (code === "42710" || code === "42P07" || code === "42P06") {
            // 42710 = duplicate object, 42P07 = duplicate table, 42P06 = duplicate schema
            console.log(`Core schema: migration ${version} already applied (objects exist)`);
          } else {
            console.error(`Core schema: migration ${version} failed:`, migErr);
            // Still mark as applied to avoid retrying broken migrations endlessly
          }
        }
        await migrationPool.query(
          "INSERT INTO trex._migrations (version) VALUES ($1) ON CONFLICT DO NOTHING",
          [version],
        );
      }
      console.log(applied > 0 ? `Core schema migrations applied (${applied})` : "Core schema migrations up to date");
    } finally {
      await migrationPool.end();
    }
  }
} catch (err) {
  console.error("Core schema migration failed:", err);
}


// One-shot bootstrap: encrypt any database_credential rows that still hold a
// plaintext password. Runs after core migrations so password_encrypted exists.
try {
  const tableCheck = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'trex' AND table_name = 'database_credential'
       AND column_name = 'password_encrypted'`,
  );
  if (tableCheck.rows.length > 0) {
    const stale = await pool.query(
      `SELECT id, password FROM trex.database_credential
       WHERE password_encrypted IS NULL AND password IS NOT NULL`,
    );
    if (stale.rows.length > 0) {
      const { encryptSecret } = await import("./auth/crypto.ts");
      let migrated = 0;
      for (const row of stale.rows) {
        try {
          const ct = await encryptSecret(row.password);
          await pool.query(
            `UPDATE trex.database_credential
             SET password_encrypted = $1, password = NULL, "updatedAt" = NOW()
             WHERE id = $2`,
            [ct, row.id],
          );
          migrated++;
        } catch (rowErr) {
          console.error(`[bootstrap] failed to encrypt credential ${row.id}:`, rowErr);
        }
      }
      console.log(`[bootstrap] Encrypted ${migrated}/${stale.rows.length} legacy database_credential password(s)`);
    }
  }
} catch (err) {
  console.error("[bootstrap] database_credential encryption migration failed:", err);
}

// Run plugin migrations after plugin discovery
try {
  const { runAllPluginMigrations } = await import("./plugin/migration.ts");
  await runAllPluginMigrations();
} catch (err) {
  console.error("Plugin migration execution failed:", err);
}

// Admin bootstrap banner — warn if no admin user and no ADMIN_EMAIL is set.
try {
  const adminCount = await pool.query(
    `SELECT COUNT(*)::INTEGER AS n FROM trex."user" WHERE role = 'admin' AND ("deletedAt" IS NULL)`,
  );
  const hasAdmin = (adminCount.rows[0]?.n ?? 0) > 0;
  const adminEmail = Deno.env.get("ADMIN_EMAIL");
  if (!hasAdmin && !adminEmail) {
    const banner = [
      "",
      "================================================================================",
      "  TREX BOOTSTRAP NOTICE: no admin user is configured.",
      "  Either set ADMIN_EMAIL=<your@email> in the environment so the next sign-up",
      "  is promoted to admin, or sign up the first account to bootstrap admin",
      "  via the first-user-promotion hook.",
      "================================================================================",
      "",
    ].join("\n");
    console.warn(banner);
  }
} catch (err) {
  console.error("[bootstrap] admin presence check failed:", err);
}

// Auto-create roles declared by plugins in the PostgreSQL role table
try {
  const { ensureRolesExist } = await import("./plugin/function.ts");
  await ensureRolesExist();
} catch (err) {
  console.error("Role auto-creation failed:", err);
}

// GraphQL diagnostic: log request body + status when PostGraphile returns
// 4xx so we can see which client query was rejected. Gated behind
// TREX_DEBUG=graphql to keep production logs clean.
if (DEBUG_GRAPHQL) {
  app.use(`${BASE_PATH}/graphql`, express.json({ limit: "1mb" }), (req, res, next) => {
    if (req.method !== "POST") return next();
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);
    const log = (body: any) => {
      if (res.statusCode >= 400) {
        try {
          const q = (req.body as any)?.query;
          const r = typeof body === "string" ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400);
          console.log(`[graphql-4xx] status=${res.statusCode} query=${String(q).slice(0,200)} resp=${r}`);
        } catch { /* ignore */ }
      }
    };
    res.json = ((body: any) => { log(body); return origJson(body); }) as any;
    res.send = ((body: any) => { log(body); return origSend(body); }) as any;
    next();
  });
}

const databaseUrl = Deno.env.get("DATABASE_URL");
if (databaseUrl) {
  try {
    const schemas = (Deno.env.get("PG_SCHEMA") || "trex").split(",");
    const pgl = createPostGraphile(databaseUrl, schemas);
    const serv = pgl.createServ(grafserv);
    await serv.addTo(app, server);
    console.log(`PostGraphile mounted on ${BASE_PATH}/graphql and ${BASE_PATH}/graphiql`);
  } catch (err) {
    console.error("PostGraphile failed to initialize:", err);
  }
} else {
  console.warn("DATABASE_URL not set — PostGraphile disabled");
}

// WebSocket upgrade handler for devx dev server proxy (Vite HMR)
server.on("upgrade", (req, socket, head) => {
  const urlPath = req.url || "";
  const proxyMatch = urlPath.match(/\/plugins\/\w+\/devx-api\/apps\/([^/]+)\/proxy(\/.*)?$/);
  if (!proxyMatch) return; // Not a devx proxy path — let other handlers (e.g. PostGraphile) handle it

  const appId = proxyMatch[1];
  const statusUrl = `http://localhost:8000/plugins/trex/devx-api/apps/${appId}/server/status`;

  const statusReq = httpRequest(statusUrl, {
    headers: { cookie: req.headers.cookie || "" },
  }, (statusRes) => {
    let data = "";
    statusRes.on("data", (chunk: string) => { data += chunk; });
    statusRes.on("end", () => {
      try {
        const status = JSON.parse(data);
        if (status.status !== "running") { socket.destroy(); return; }
        const port = status.url ? new URL(status.url).port : String(status.port);

        const proxyReq = httpRequest(`http://localhost:${port}${urlPath}`, {
          method: "GET",
          headers: { ...req.headers, host: `localhost:${port}` },
        });
        proxyReq.on("upgrade", (_proxyRes, proxySocket, proxyHead) => {
          socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Accept: ${_proxyRes.headers["sec-websocket-accept"]}\r\n` +
            ((_proxyRes.headers["sec-websocket-protocol"]) ? `Sec-WebSocket-Protocol: ${_proxyRes.headers["sec-websocket-protocol"]}\r\n` : "") +
            "\r\n"
          );
          if (proxyHead.length > 0) socket.write(proxyHead);
          proxySocket.pipe(socket);
          socket.pipe(proxySocket);
          proxySocket.on("error", () => socket.destroy());
          socket.on("error", () => proxySocket.destroy());
        });
        proxyReq.on("error", () => socket.destroy());
        proxyReq.end();
      } catch { socket.destroy(); }
    });
  });
  statusReq.on("error", () => socket.destroy());
  statusReq.end();
});

app.get(`${BASE_PATH}/_internal/health`, (_req, res) => {
  res.status(STATUS_CODE.OK).json({ message: "ok" });
});

app.get(`${BASE_PATH}/_internal/metric`, async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || user.role !== "admin") {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  const metric = await EdgeRuntime.getRuntimeMetrics();
  res.json(metric);
});

app.put(`${BASE_PATH}/_internal/upload`, async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }
    const dir = await Deno.makeTempDir();
    const path = join(dir, "index.ts");
    await Deno.writeTextFile(path, body);
    res.json({ path: dir });
  } catch (err) {
    console.error("[upload] Error:", err);
    res.status(STATUS_CODE.BadRequest).json({ error: "Bad request" });
  }
});

// Supabase-compatible edge function invocation: /functions/v1/:function_name
const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") || "./functions";
// Studio's deploy endpoint writes uploaded function files here. Shared with
// the studio sidecar via a docker volume.
const EDGE_FUNCTIONS_MANAGEMENT_FOLDER = Deno.env.get("EDGE_FUNCTIONS_MANAGEMENT_FOLDER");

// Cached Supabase-compatible env vars (populated after ensureAuthKeys)
let supabaseEnvVars: [string, string][] = [];

async function getSupabaseEnvVars(): Promise<[string, string][]> {
  const envVarsObj = Deno.env.toObject();
  const envVars: [string, string][] = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);
  // Inject Supabase-compatible vars if not already in process env
  for (const [key, value] of supabaseEnvVars) {
    if (!envVarsObj[key]) {
      envVars.push([key, value]);
    }
  }

  // Load user-defined secrets from DB
  try {
    const { loadSecretsForEnv } = await import("./routes/functions.ts");
    const secrets = await loadSecretsForEnv();
    for (const [key, value] of secrets) {
      if (!envVarsObj[key]) {
        envVars.push([key, value]);
      }
    }
  } catch { /* secrets table may not exist yet */ }

  return envVars;
}

async function invokeEdgeFunction(req: any, res: any) {
  const functionName = req.params.function_name;
  let servicePath: string;

  // Support /tmp/ paths for backward compat (runtime/bao plugins)
  if (functionName.startsWith("tmp")) {
    try {
      servicePath = await Deno.realPath(`/tmp/${functionName}`);
      if (!servicePath.startsWith("/tmp/")) {
        res.status(400).json({ error: "Invalid service path" });
        return;
      }
    } catch (err) {
      console.error("[edge-function] Path error:", err);
      res.status(STATUS_CODE.BadRequest).json({ error: "Invalid service path" });
      return;
    }
  } else {
    // Reject path-traversal attempts: function names must be simple slugs
    // (no `..`, no slashes, no URL-encoded delimiters). Even though Express
    // route params don't match across slashes, `..` is still a valid
    // single-segment value that would resolve a join() above the parent.
    if (!/^[A-Za-z0-9_-]+$/.test(functionName)) {
      res.status(400).json({ error: "Invalid function name" });
      return;
    }
    // Prefer Studio's management folder (functions deployed through the
    // dashboard land there); fall back to FUNCTIONS_DIR for legacy /
    // CLI-deployed functions.
    let resolved: string | undefined;
    const tryResolve = async (base: string) => {
      const candidate = join(base, functionName);
      try {
        const real = await Deno.realPath(candidate);
        const baseReal = await Deno.realPath(base);
        // Symlink containment: the resolved real path must live inside the
        // resolved base — defends against a function folder being a symlink
        // pointing somewhere sensitive.
        if (real === baseReal || real.startsWith(baseReal + "/")) return real;
      } catch { /* not found */ }
      return undefined;
    };
    if (EDGE_FUNCTIONS_MANAGEMENT_FOLDER) {
      resolved = await tryResolve(EDGE_FUNCTIONS_MANAGEMENT_FOLDER);
    }
    if (!resolved) {
      resolved = await tryResolve(FUNCTIONS_DIR);
    }
    if (!resolved) {
      res.status(404).json({ error: `Function ${functionName} not found` });
      return;
    }
    servicePath = resolved;
  }

  try {
    await Deno.stat(servicePath);
  } catch {
    res.status(404).json({ error: `Function ${functionName} not found` });
    return;
  }

  // Check verify_jwt from function metadata
  try {
    const metaPath = join(servicePath, "function.json");
    const metaContent = await Deno.readTextFile(metaPath);
    const meta = JSON.parse(metaContent);
    if (meta.verify_jwt !== false) {
      const authHeader = req.headers.authorization;
      const apikey = req.headers.apikey;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : apikey;
      if (!token) {
        res.status(401).json({ error: "Invalid JWT" });
        return;
      }
      const claims = await verifyAccessToken(token);
      if (!claims) {
        res.status(401).json({ error: "Invalid JWT" });
        return;
      }
    }
  } catch {
    // No function.json or parse error — default to requiring auth
    const authHeader = req.headers.authorization;
    const apikey = req.headers.apikey;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : apikey;
    if (token) {
      const claims = await verifyAccessToken(token);
      if (!claims) {
        res.status(401).json({ error: "Invalid JWT" });
        return;
      }
    }
  }

  // Check for import map
  let importMapPath: string | undefined;
  try {
    const denoJsonPath = join(servicePath, "deno.json");
    await Deno.stat(denoJsonPath);
    importMapPath = denoJsonPath;
  } catch { /* no import map */ }

  // Check for ESZIP bundle (deployed by Supabase CLI)
  // Format: EZBR magic (4 bytes) + Brotli-compressed ESZIP v2
  let maybeEszip: Uint8Array | undefined;
  let maybeEntrypoint: string | undefined;
  try {
    const eszipPath = join(servicePath, "esbuild.esz");
    const raw = await Deno.readFile(eszipPath);

    // Check for EZBR header and decompress
    const header = new TextDecoder().decode(raw.slice(0, 4));
    if (header === "EZBR") {
      const { brotliDecompressSync } = await import("node:zlib");
      maybeEszip = new Uint8Array(brotliDecompressSync(raw.slice(4)));
    } else {
      // Already raw eszip
      maybeEszip = raw;
    }

    // Read entrypoint from function.json metadata
    try {
      const metaContent = await Deno.readTextFile(join(servicePath, "function.json"));
      const meta = JSON.parse(metaContent);
      maybeEntrypoint = meta.entrypoint_path
        ? `file:///${meta.entrypoint_path}`
        : "file:///src/index.ts";
    } catch {
      maybeEntrypoint = "file:///src/index.ts";
    }
  } catch { /* no eszip bundle — use regular servicePath */ }

  const createWorker = async () => {
    const workerOpts: Record<string, unknown> = {
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      envVars: await getSupabaseEnvVars(),
      forceCreate: false,
      cpuTimeSoftLimitMs: 10000,
      cpuTimeHardLimitMs: 20000,
      importMapPath,
      context: {
        useReadSyncFileAPI: true,
        unstableSloppyImports: true,
      },
    };

    // If ESZIP bundle exists, pass it to the worker
    if (maybeEszip) {
      workerOpts.maybeEszip = maybeEszip;
      workerOpts.maybeEntrypoint = maybeEntrypoint;
    }

    return await EdgeRuntime.userWorkers.create(workerOpts);
  };

  const host = req.get("host") || "localhost";
  const protocol = req.protocol || "http";
  const webUrl = `${protocol}://${host}${req.originalUrl}`;
  const webHeaders = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) webHeaders.set(key, Array.isArray(val) ? val.join(", ") : val as string);
  }
  let reqBody: Blob | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    if (chunks.length > 0) reqBody = new Blob(chunks);
  }
  const webReq = new Request(webUrl, {
    method: req.method,
    headers: webHeaders,
    body: reqBody,
  });

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const worker = await createWorker();
      const controller = new AbortController();
      const workerResponse = await worker.fetch(webReq, { signal: controller.signal });

      res.status(workerResponse.status);
      workerResponse.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });

      // Support streaming (SSE)
      const contentType = workerResponse.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = workerResponse.body?.getReader();
        if (reader) {
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { res.end(); return; }
              res.write(value);
            }
          };
          pump().catch(() => res.end());
        } else {
          res.end();
        }
      } else {
        const body = await workerResponse.text();
        res.send(body);
      }
      return;
    } catch (e) {
      if (e instanceof Deno.errors.WorkerAlreadyRetired && attempt < MAX_RETRIES - 1) {
        continue;
      }
      console.error("[edge-function] Error:", e);
      res.status(STATUS_CODE.InternalServerError).json({ msg: "Internal server error" });
      return;
    }
  }
  res.status(STATUS_CODE.InternalServerError).json({ msg: "Worker unavailable after retries" });
}

app.all(`${BASE_PATH}/functions/v1/:function_name`, apiLimiter, invokeEdgeFunction);
app.all(`${BASE_PATH}/functions/v1/:function_name/*`, apiLimiter, invokeEdgeFunction);

// Function management API (Supabase CLI compatible)
app.use(functionsRouter);

// Serve self-hosted Shinylive assets (must be before SPA catch-all)
try {
  const shinyliveDistPath = join(Deno.cwd(), "shinylive");
  await Deno.stat(shinyliveDistPath);
  const serveShiny = (await import("express")).default.static;
  app.use(`${BASE_PATH}/shinylive`, serveShiny(shinyliveDistPath));
  console.log("Serving Shinylive assets from shinylive/");
} catch { /* shinylive assets not present — skip */ }

app.get("/", (_req, res) => {
  res.redirect("/plugins/trex/web/");
});

// Initialize auth keys (anon key, service_role key) + cache for edge functions
try {
  const authKeys = await ensureAuthKeys();
  console.log("[auth] Auth keys initialized");

  // Cache Supabase-compatible env vars for edge function workers
  const supabaseUrl = Deno.env.get("BETTER_AUTH_URL") || `http://localhost:8001${BASE_PATH}`;
  supabaseEnvVars = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_ANON_KEY", authKeys.anonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", authKeys.serviceRoleKey],
    ["SUPABASE_DB_URL", Deno.env.get("DATABASE_URL") || ""],
  ];
  console.log("[functions] Supabase-compatible env vars cached for edge functions");
} catch (err) {
  console.error("[auth] Failed to initialize auth keys:", err);
}

// Load SSO providers
try {
  const tableCheck = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'trex' AND table_name = 'sso_provider' LIMIT 1`
  );
  if (tableCheck.rows.length > 0) {
    const result = await pool.query(
      `SELECT id FROM trex.sso_provider WHERE enabled = true`
    );
    const names = result.rows.map((r: any) => r.id);
    console.log(`[auth] SSO providers: ${names.length > 0 ? names.join(", ") : "none"}`);
  }
} catch (err) {
  console.error("[auth] Failed to load SSO providers:", err);
}

// Bootstrap initial API key from env var (for Docker/CI)
const initialKeyName = Deno.env.get("TREX_INITIAL_API_KEY_NAME");
if (initialKeyName) {
  try {
    const existing = await pool.query("SELECT 1 FROM trex.api_key LIMIT 1");
    if (existing.rows.length === 0) {
      const { generateApiKey } = await import("./mcp/auth.ts");
      const adminResult = await pool.query(
        `SELECT id FROM trex."user" WHERE role = 'admin' ORDER BY "createdAt" ASC LIMIT 1`
      );
      if (adminResult.rows.length > 0) {
        const result = await generateApiKey(adminResult.rows[0].id, initialKeyName);
        console.log(`[mcp] Initial API key created: ${result.key.slice(0, 13)}...(redacted)`);
      }
    }
  } catch (err) {
    console.error("[mcp] Failed to bootstrap initial API key:", err);
  }
}

server.listen(8000, () => {
  console.log("server listening on port 8000");
});
