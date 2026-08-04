import { Router } from "express";
import express from "express";
import { join } from "jsr:@std/path@^1.0";
import { BASE_PATH } from "../config.ts";
import { verifyAccessToken } from "../auth/jwt.ts";
import { apiLimiter } from "../middleware/rate-limit.ts";

const router = Router();
router.use(express.json({ limit: "10mb" }));

const FUNCTIONS_DIR = Deno.env.get("FUNCTIONS_DIR") || "./functions";
const SLUG_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

interface FunctionMeta {
  slug: string;
  name: string;
  status: "ACTIVE" | "REMOVED";
  version: number;
  verify_jwt: boolean;
  entrypoint_path: string;
  import_map_path: string | null;
  created_at: number;
  updated_at: number;
}

async function requireAdmin(req: any): Promise<{ id: string; role: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  // Accept sbp_ tokens (Supabase CLI personal access tokens) via api_key table
  if (token.startsWith("sbp_")) {
    const { validateApiKey } = await import("../mcp/auth.ts");
    const user = await validateApiKey(token);
    if (user && user.role === "admin") {
      return { id: user.id, role: "admin" };
    }
    return null;
  }

  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const role = claims.role === "service_role" ? "admin" : (claims.app_metadata?.trex_role || "user");
  if (role !== "admin") return null;
  return { id: claims.sub, role };
}

async function readFunctionMeta(slug: string): Promise<FunctionMeta | null> {
  try {
    const metaPath = join(FUNCTIONS_DIR, slug, "function.json");
    const content = await Deno.readTextFile(metaPath);
    return JSON.parse(content);
  } catch {
    // Check if index.ts exists (legacy function without metadata)
    try {
      const indexPath = join(FUNCTIONS_DIR, slug, "index.ts");
      const stat = await Deno.stat(indexPath);
      const created = Math.floor((stat.birthtime?.getTime() || Date.now()) / 1000);
      return {
        slug,
        name: slug,
        status: "ACTIVE",
        version: 1,
        verify_jwt: true,
        entrypoint_path: "index.ts",
        import_map_path: null,
        created_at: created,
        updated_at: created,
      };
    } catch {
      return null;
    }
  }
}

async function writeFunctionMeta(slug: string, meta: FunctionMeta): Promise<void> {
  const metaPath = join(FUNCTIONS_DIR, slug, "function.json");
  await Deno.writeTextFile(metaPath, JSON.stringify(meta, null, 2));
}

router.get(`${BASE_PATH}/v1/projects/:ref/functions`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  try {
    const functions: FunctionMeta[] = [];
    for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
      if (!entry.isDirectory) continue;
      const meta = await readFunctionMeta(entry.name);
      if (meta && meta.status !== "REMOVED") {
        functions.push(meta);
      }
    }
    res.json(functions);
  } catch {
    res.json([]);
  }
});

router.get(`${BASE_PATH}/v1/projects/:ref/functions/:slug`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const meta = await readFunctionMeta(req.params.slug);
  if (!meta) {
    res.status(404).json({ error: "Function not found" });
    return;
  }
  // CLI expects entrypoint_path as file:/// URL
  const response: Record<string, unknown> = { ...meta };
  if (meta.entrypoint_path && !meta.entrypoint_path.startsWith("file://")) {
    response.entrypoint_path = `file:///${meta.entrypoint_path}`;
  }
  if (meta.import_map_path && !meta.import_map_path.startsWith("file://")) {
    response.import_map_path = `file:///${meta.import_map_path}`;
  }
  res.json(response);
});

router.get(`${BASE_PATH}/v1/projects/:ref/functions/:slug/body`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const { slug } = req.params;
  const meta = await readFunctionMeta(slug);
  if (!meta) {
    res.status(404).json({ error: "Function not found" });
    return;
  }

  const funcDir = join(FUNCTIONS_DIR, slug);

  // If ESZIP bundle exists, serve it (for supabase functions download)
  try {
    const eszipPath = join(funcDir, "esbuild.esz");
    const raw = await Deno.readFile(eszipPath);

    // Decompress EZBR → raw ESZIP
    const header = new TextDecoder().decode(raw.slice(0, 4));
    let eszip: Uint8Array;
    if (header === "EZBR") {
      const { brotliDecompressSync } = await import("node:zlib");
      eszip = new Uint8Array(brotliDecompressSync(raw.slice(4)));
    } else {
      eszip = raw;
    }

    res.type("application/octet-stream");
    res.send(Buffer.from(eszip));
    return;
  } catch {
    // No ESZIP — fall back to source code
  }

  try {
    const entrypoint = meta.entrypoint_path || "index.ts";
    const sourcePath = join(funcDir, entrypoint);
    const source = await Deno.readTextFile(sourcePath);
    res.type("text/plain").send(source);
  } catch {
    res.status(404).json({ error: "Function source not found" });
  }
});

// Deploy function (Supabase CLI sends POST to /functions with query params)
router.post(`${BASE_PATH}/v1/projects/:ref/functions`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const slug = req.query.slug as string;
  if (!slug || !SLUG_PATTERN.test(slug)) {
    res.status(400).json({ error: "Invalid or missing slug" });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const funcDir = join(FUNCTIONS_DIR, slug);

  try {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    const bodyBuffer = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bodyBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    await Deno.mkdir(funcDir, { recursive: true });

    const bundlePath = join(funcDir, "esbuild.esz");
    await Deno.writeFile(bundlePath, bodyBuffer);

    // Also extract to index.ts if it looks like text (fallback for simple functions)
    const entrypointPath = (req.query.entrypoint_path as string) || "index.ts";
    const entrypointFile = entrypointPath.split("/").pop() || "index.ts";

    try {
      const text = new TextDecoder().decode(bodyBuffer);
      if (text.includes("Deno.serve") || text.includes("export default") || text.includes("export function")) {
        await Deno.writeTextFile(join(funcDir, entrypointFile), text);
      }
    } catch { /* binary bundle, skip text extraction */ }

    const existing = await readFunctionMeta(slug);
    const version = existing ? existing.version + 1 : 1;

    const meta: FunctionMeta = {
      slug,
      name: (req.query.name as string) || slug,
      status: "ACTIVE",
      version,
      verify_jwt: req.query.verify_jwt !== "false",
      entrypoint_path: entrypointFile,
      import_map_path: null,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await writeFunctionMeta(slug, meta);
    console.log(`[functions] Deployed ${slug} v${version} (${bodyBuffer.length} bytes)`);
    res.status(201).json(meta);
  } catch (err) {
    console.error(`[functions] Deploy error for ${slug}:`, err);
    res.status(500).json({ error: "Deploy failed", details: String(err) });
  }
});

// Deploy function (legacy /deploy path)
router.post(`${BASE_PATH}/v1/projects/:ref/functions/deploy`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const slug = (req.query.slug as string) || req.body?.slug;
  if (!slug || !SLUG_PATTERN.test(slug)) {
    res.status(400).json({ error: "Invalid or missing slug. Must match ^[A-Za-z][A-Za-z0-9_-]*$" });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const funcDir = join(FUNCTIONS_DIR, slug);

  try {
    // JSON body deployment: { slug, name?, body, verify_jwt?, entrypoint_path? }
    const { body: sourceCode, name, verify_jwt, entrypoint_path, import_map } = req.body || {};

    if (!sourceCode) {
      res.status(400).json({ error: "body (source code) is required" });
      return;
    }

    await Deno.mkdir(funcDir, { recursive: true });

    const entrypoint = entrypoint_path || "index.ts";
    await Deno.writeTextFile(join(funcDir, entrypoint), sourceCode);

    let importMapPath: string | null = null;
    if (import_map) {
      importMapPath = "deno.json";
      await Deno.writeTextFile(
        join(funcDir, "deno.json"),
        typeof import_map === "string" ? import_map : JSON.stringify(import_map, null, 2),
      );
    }

    const existing = await readFunctionMeta(slug);
    const version = existing ? existing.version + 1 : 1;
    const created_at = existing?.created_at || now;

    const meta: FunctionMeta = {
      slug,
      name: name || slug,
      status: "ACTIVE",
      version,
      verify_jwt: verify_jwt !== false,
      entrypoint_path: entrypoint,
      import_map_path: importMapPath,
      created_at,
      updated_at: now,
    };

    await writeFunctionMeta(slug, meta);

    console.log(`[functions] Deployed ${slug} v${version}`);
    res.status(201).json(meta);
  } catch (err) {
    console.error(`[functions] Deploy error for ${slug}:`, err);
    res.status(500).json({ error: "Deploy failed", details: String(err) });
  }
});

router.delete(`${BASE_PATH}/v1/projects/:ref/functions/:slug`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const { slug } = req.params;
  const funcDir = join(FUNCTIONS_DIR, slug);

  try {
    await Deno.stat(funcDir);
  } catch {
    res.status(404).json({ error: "Function not found" });
    return;
  }

  try {
    await Deno.remove(funcDir, { recursive: true });
    console.log(`[functions] Deleted ${slug}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[functions] Delete error for:", slug, err);
    res.status(500).json({ error: "Delete failed", details: String(err) });
  }
});

// ── Management API stubs (Supabase CLI compatibility) ────────────────────────
// These endpoints support `supabase link` and `supabase status` commands.
// The CLI sends Bearer token auth (service_role key or access token).

// GET /v1/organizations — list organizations
router.get(`${BASE_PATH}/v1/organizations`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  res.json([{
    id: "trex-org",
    name: "trex",
  }]);
});

// GET /v1/projects — list projects (used by `supabase login` to validate token)
router.get(`${BASE_PATH}/v1/projects`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const ref = "trexsqldefaultlocall";
  const { pool } = await import("../db.ts");

  let pgVersion = "16.0.0";
  try {
    const result = await pool.query("SHOW server_version");
    pgVersion = result.rows[0]?.server_version || pgVersion;
  } catch { /* use default */ }

  const dbHost = getDbHost();

  res.json([{
    id: ref,
    ref,
    name: "trex",
    organization_id: "trex-org",
    organization_slug: "trex",
    region: "local",
    created_at: new Date().toISOString(),
    status: "ACTIVE_HEALTHY",
    database: {
      host: dbHost,
      version: pgVersion,
      postgres_engine: "pg_trex",
      release_channel: "stable",
    },
  }]);
});

// POST /v1/projects/:ref/cli/login-role — create temporary DB login role (used by CLI for db connections)
router.post(`${BASE_PATH}/v1/projects/:ref/cli/login-role`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { pool } = await import("../db.ts");

  // Generate a temporary role name and password
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const roleName = `cli_login_${suffix}`;
  const password = crypto.randomUUID();

  try {
    // Create the temporary role with login privilege
    await pool.query(`CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}' IN ROLE postgres VALID UNTIL (NOW() + INTERVAL '1 hour')`);
    res.status(201).json({ role: roleName, password });
  } catch (err) {
    console.error("[mgmt] cli login-role error:", err);
    // If role creation fails, fall back to returning the default postgres credentials
    // from the DATABASE_URL so the CLI can still connect
    const dbUrl = Deno.env.get("EXTERNAL_DB_URL") || Deno.env.get("DATABASE_URL") || "";
    try {
      const parsed = new URL(dbUrl);
      res.status(201).json({ role: parsed.username || "postgres", password: decodeURIComponent(parsed.password || "") });
    } catch {
      res.status(500).json({ message: "Failed to create login role" });
    }
  }
});

// GET /v1/projects/:ref — project info
router.get(`${BASE_PATH}/v1/projects/:ref`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const ref = req.params.ref;
  const { pool } = await import("../db.ts");

  // Get Postgres version
  let pgVersion = "16.0.0";
  try {
    const result = await pool.query("SHOW server_version");
    pgVersion = result.rows[0]?.server_version || pgVersion;
  } catch { /* use default */ }

  // Resolve externally-reachable DB host
  const dbHost = getDbHost();

  res.json({
    id: ref,
    ref,
    name: "trex",
    organization_id: "trex-org",
    organization_slug: "trex",
    region: "local",
    created_at: new Date().toISOString(),
    status: "ACTIVE_HEALTHY",
    database: {
      host: dbHost,
      version: pgVersion,
      postgres_engine: "pg_trex",
      release_channel: "stable",
    },
  });
});

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// GET /v1/projects/:ref/api-keys — legacy anon/service_role + new publishable/secret keys
router.get(`${BASE_PATH}/v1/projects/:ref/api-keys`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { pool } = await import("../db.ts");
  const { getSbKeys } = await import("../auth/sb-keys.ts");
  try {
    const result = await pool.query(
      `SELECT key, value FROM trexdb.setting WHERE key IN ('auth.anonKey', 'auth.serviceRoleKey')`,
    );
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.key] = typeof row.value === "string" ? row.value : JSON.parse(row.value);
    }
    const sb = await getSbKeys();
    const secretHash = await sha256Hex(sb.secret.key);

    const reveal = req.query.reveal === "true";
    const keys = [
      {
        id: "anon",
        type: "legacy",
        name: "anon",
        api_key: reveal ? settings["auth.anonKey"] || null : null,
        prefix: settings["auth.anonKey"]?.slice(0, 20) || null,
        secret_jwt_template: { role: "anon" },
      },
      {
        id: "service_role",
        type: "legacy",
        name: "service_role",
        api_key: reveal ? settings["auth.serviceRoleKey"] || null : null,
        prefix: settings["auth.serviceRoleKey"]?.slice(0, 20) || null,
        secret_jwt_template: { role: "service_role" },
      },
      {
        id: sb.publishable.id,
        type: "publishable",
        name: "default",
        // Publishable keys are public — always return in full.
        api_key: sb.publishable.key,
        prefix: sb.publishable.key.slice(0, 20),
        inserted_at: sb.publishable.inserted_at,
      },
      {
        id: sb.secret.id,
        type: "secret",
        name: "default",
        api_key: reveal ? sb.secret.key : `${sb.secret.key.slice(0, 14)}...`,
        prefix: sb.secret.key.slice(0, 14),
        hash: secretHash,
        secret_jwt_template: { role: "service_role" },
        inserted_at: sb.secret.inserted_at,
      },
    ];

    res.json(keys);
  } catch (err) {
    console.error("[mgmt] api-keys error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /v1/projects/:ref/api-keys/:id — per-key fetch with ?reveal (Studio's reveal button)
router.get(`${BASE_PATH}/v1/projects/:ref/api-keys/:id`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { getSbKeys } = await import("../auth/sb-keys.ts");
  try {
    const sb = await getSbKeys();
    const reveal = req.query.reveal === "true";
    if (req.params.id === sb.publishable.id) {
      res.json({
        id: sb.publishable.id, type: "publishable", name: "default",
        api_key: sb.publishable.key, prefix: sb.publishable.key.slice(0, 20),
        inserted_at: sb.publishable.inserted_at,
      });
      return;
    }
    if (req.params.id === sb.secret.id) {
      res.json({
        id: sb.secret.id, type: "secret", name: "default",
        api_key: reveal ? sb.secret.key : `${sb.secret.key.slice(0, 14)}...`,
        prefix: sb.secret.key.slice(0, 14),
        hash: await sha256Hex(sb.secret.key),
        secret_jwt_template: { role: "service_role" },
        inserted_at: sb.secret.inserted_at,
      });
      return;
    }
    res.status(404).json({ message: "API key not found" });
  } catch (err) {
    console.error("[mgmt] api-key error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// trex keeps one publishable + one secret key; create/update/delete are not supported.
// Rotation is available via the GraphQL rotatePublishableKey/rotateSecretKey mutations.
for (const method of ["post", "patch", "delete"] as const) {
  const path = method === "post"
    ? `${BASE_PATH}/v1/projects/:ref/api-keys`
    : `${BASE_PATH}/v1/projects/:ref/api-keys/:id`;
  router[method](path, apiLimiter, async (req, res) => {
    const user = await requireAdmin(req);
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    res.status(501).json({
      message: "trex manages a single publishable/secret key pair; use the rotate mutations instead",
    });
  });
}

// GET /v1/projects/:ref/postgrest — PostgREST config
// Returns the live effective values: trexdb.setting postgrest.* rows (written
// by the PATCH handler below) merged over the PGRST_* env defaults, mirroring
// the @trex/postgrest plugin's precedence (defaults < env < trexdb.setting).
router.get(`${BASE_PATH}/v1/projects/:ref/postgrest`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // trexdb.setting layer (jsonb values come back parsed: number or string)
  const settings: Record<string, unknown> = {};
  try {
    const { pool } = await import("../db.ts");
    const result = await pool.query(
      `SELECT key, value FROM trexdb.setting WHERE key LIKE 'postgrest.%'`,
    );
    for (const row of result.rows) settings[row.key] = row.value;
  } catch (err) {
    console.error("[config] PostgREST settings read error:", err);
  }

  // PGRST_* env layer (empty strings count as unset, like the plugin)
  const env = (name: string): string | undefined => Deno.env.get(name) || undefined;
  const toInt = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };

  const maxRows = settings["postgrest.maxRows"] ?? env("PGRST_DB_MAX_ROWS");
  const dbSchema = settings["postgrest.dbSchema"] ?? env("PGRST_DB_SCHEMAS");
  const extraSearchPath = settings["postgrest.dbExtraSearchPath"] ?? env("PGRST_DB_EXTRA_SEARCH_PATH");
  const dbPool = settings["postgrest.dbPool"] ?? env("PGRST_DB_POOL");

  res.json({
    db_extra_search_path: extraSearchPath != null ? String(extraSearchPath) : "public,extensions",
    db_pool: dbPool != null ? toInt(dbPool) : null,
    db_schema: dbSchema != null ? String(dbSchema) : "public",
    max_rows: maxRows != null ? (toInt(maxRows) ?? 1000) : 1000,
  });
});

// GET /v1/projects/:ref/config/auth — GoTrue/Auth config
router.get(`${BASE_PATH}/v1/projects/:ref/config/auth`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const host = Deno.env.get("BETTER_AUTH_URL") || "http://localhost:8001";

  res.json({
    site_url: host,
    uri_allow_list: "",
    disable_signup: false,
    jwt_exp: 3600,
    mailer_autoconfirm: true,
    phone_autoconfirm: false,
    sms_provider: "twilio",
    external_email_enabled: true,
    external_phone_enabled: false,
    external_apple_enabled: false,
    external_azure_enabled: false,
    external_bitbucket_enabled: false,
    external_discord_enabled: false,
    external_facebook_enabled: false,
    external_github_enabled: false,
    external_gitlab_enabled: false,
    external_google_enabled: false,
    external_keycloak_enabled: false,
    external_linkedin_oidc_enabled: false,
    external_notion_enabled: false,
    external_slack_oidc_enabled: false,
    external_spotify_enabled: false,
    external_twitch_enabled: false,
    external_twitter_enabled: false,
    external_workos_enabled: false,
    external_zoom_enabled: false,
  });
});

// GET /v1/projects/:ref/config/database/postgres — Postgres config
router.get(`${BASE_PATH}/v1/projects/:ref/config/database/postgres`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({
    effective_cache_size: "4GB",
    maintenance_work_mem: "512MB",
    max_connections: 100,
    max_parallel_maintenance_workers: 2,
    max_parallel_workers: 4,
    max_parallel_workers_per_gather: 2,
    max_worker_processes: 8,
    shared_buffers: "1GB",
    statement_timeout: "120s",
    work_mem: "4MB",
  });
});

// GET /v1/projects/:ref/network-restrictions — network restrictions
router.get(`${BASE_PATH}/v1/projects/:ref/network-restrictions`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({
    config: {
      dbAllowedCidrs: ["0.0.0.0/0"],
    },
    old_config: {
      dbAllowedCidrs: ["0.0.0.0/0"],
    },
    status: "applied",
    entitlement: "allowed",
  });
});

// GET /v1/projects/:ref/ssl-enforcement — SSL enforcement config
router.get(`${BASE_PATH}/v1/projects/:ref/ssl-enforcement`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  res.json({
    currentConfig: { database: false },
    appliedSuccessfully: true,
  });
});

// GET /v1/projects/:ref/config/database/pooler — connection pooler config
router.get(`${BASE_PATH}/v1/projects/:ref/config/database/pooler`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  // Return connection info derived from EXTERNAL_DB_URL, POOLER_URL, or DATABASE_URL
  // EXTERNAL_DB_URL is the externally-reachable connection string (for CLI clients outside the container)
  const poolerUrl = Deno.env.get("EXTERNAL_DB_URL") || Deno.env.get("POOLER_URL") || Deno.env.get("DATABASE_URL") || "";
  let dbHost = getDbHost();
  let dbName = "postgres";
  let dbPort = 5432;
  let dbUser = "postgres";
  let connString = poolerUrl;

  try {
    const parsed = new URL(poolerUrl);
    dbHost = parsed.hostname;
    dbName = parsed.pathname.slice(1) || "postgres";
    dbPort = parseInt(parsed.port || "5432");
    dbUser = parsed.username || "postgres";
  } catch { /* use defaults if URL parsing fails */ }

  res.json([{
    connection_string: connString,
    database_type: "PRIMARY",
    db_host: dbHost,
    db_name: dbName,
    db_port: dbPort,
    db_user: dbUser,
    default_pool_size: 15,
    identifier: req.params.ref,
    is_using_scram_auth: false,
    max_client_conn: 200,
    pool_mode: "session",
  }]);
});

// GET /v1/projects/:ref/config/storage — storage config
router.get(`${BASE_PATH}/v1/projects/:ref/config/storage`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({
    fileSizeLimit: 52428800, // 50MB
    features: {
      imageTransformation: { enabled: false },
    },
  });
});

// GET /v1/projects/:ref/billing/addons — billing addons stub (required by supabase config push)
router.get(`${BASE_PATH}/v1/projects/:ref/billing/addons`, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({
    selected_addons: [],
    available_addons: [],
  });
});

// ── Secrets endpoints (Supabase CLI: supabase secrets list/set/unset) ────────

// GET /v1/projects/:ref/secrets — list secrets (name + hash, no plaintext)
router.get(`${BASE_PATH}/v1/projects/:ref/secrets`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const { pool } = await import("../db.ts");
    const result = await pool.query(
      `SELECT name, value_hash, "updatedAt" FROM trexdb.secret ORDER BY name`,
    );
    const secrets = result.rows
      .filter((r: any) => !r.name.startsWith("SUPABASE_"))
      .map((r: any) => ({
        name: r.name,
        value: r.value_hash,
        updated_at: r.updatedAt,
      }));
    res.json(secrets);
  } catch (err) {
    console.error("[secrets] List error:", err);
    res.json([]);
  }
});

// POST /v1/projects/:ref/secrets — create/update secrets
router.post(`${BASE_PATH}/v1/projects/:ref/secrets`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const secrets = req.body;
  if (!Array.isArray(secrets) || secrets.length === 0) {
    res.status(400).json({ message: "Body must be an array of {name, value}" });
    return;
  }

  try {
    const { pool } = await import("../db.ts");
    const { encryptSecret, hashSecret } = await import("../auth/crypto.ts");

    for (const { name, value } of secrets) {
      if (!name || typeof value !== "string") continue;
      const encrypted = await encryptSecret(value);
      const hash = await hashSecret(value);
      await pool.query(
        `INSERT INTO trexdb.secret (name, value_encrypted, value_hash, "updatedAt")
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (name) DO UPDATE SET value_encrypted = $2, value_hash = $3, "updatedAt" = NOW()`,
        [name, encrypted, hash],
      );
    }

    // Invalidate secrets cache
    secretsCache = null;

    console.log(`[secrets] Upserted ${secrets.length} secret(s)`);
    res.status(201).json({});
  } catch (err) {
    console.error("[secrets] Set error:", err);
    res.status(500).json({ message: "Failed to set secrets", details: String(err) });
  }
});

// DELETE /v1/projects/:ref/secrets — delete secrets by name
router.delete(`${BASE_PATH}/v1/projects/:ref/secrets`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const names = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    res.status(400).json({ message: "Body must be an array of secret names" });
    return;
  }

  try {
    const { pool } = await import("../db.ts");
    await pool.query(
      `DELETE FROM trexdb.secret WHERE name = ANY($1)`,
      [names],
    );

    // Invalidate secrets cache
    secretsCache = null;

    console.log(`[secrets] Deleted secrets: ${names.join(", ")}`);
    res.status(200).end();
  } catch (err) {
    console.error("[secrets] Unset error:", err);
    res.status(500).json({ message: "Failed to unset secrets", details: String(err) });
  }
});

// ── Secrets cache for edge function env injection ────────────────────────────

let secretsCache: { entries: [string, string][]; fetchedAt: number } | null = null;
const SECRETS_CACHE_TTL_MS = 30_000; // 30 seconds

export async function loadSecretsForEnv(): Promise<[string, string][]> {
  const now = Date.now();
  if (secretsCache && (now - secretsCache.fetchedAt) < SECRETS_CACHE_TTL_MS) {
    return secretsCache.entries;
  }

  try {
    const { pool } = await import("../db.ts");
    const { decryptSecret } = await import("../auth/crypto.ts");
    const result = await pool.query(
      `SELECT name, value_encrypted FROM trexdb.secret ORDER BY name`,
    );
    const entries: [string, string][] = [];
    for (const row of result.rows) {
      try {
        const plaintext = await decryptSecret(row.value_encrypted);
        entries.push([row.name, plaintext]);
      } catch {
        console.error(`[secrets] Failed to decrypt secret: ${row.name}`);
      }
    }
    secretsCache = { entries, fetchedAt: now };
    return entries;
  } catch {
    // Table may not exist yet
    return [];
  }
}

// ── Config PATCH/PUT endpoints (Supabase CLI: supabase config push) ──────────
// CLI uses PATCH for some endpoints and PUT for others, so we register both.

// Helper to upsert settings into trexdb.setting
async function upsertSettings(body: Record<string, any>, mappings: Record<string, string | { key: string; transform?: (v: any) => any }>) {
  const { pool } = await import("../db.ts");
  for (const [field, mapping] of Object.entries(mappings)) {
    if (!(field in body)) continue;
    const key = typeof mapping === "string" ? mapping : mapping.key;
    const transform = typeof mapping === "object" ? mapping.transform : undefined;
    const value = transform ? transform(body[field]) : body[field];
    await pool.query(
      `INSERT INTO trexdb.setting (key, value, "updatedAt") VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = NOW()`,
      [key, JSON.stringify(value)],
    );
  }
}

// Config update handlers (registered for both PATCH and PUT — CLI uses either)
const updateAuthConfig = async (req: any, res: any) => {
  const user = await requireAdmin(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  try {
    const body = req.body || {};
    await upsertSettings(body, {
      disable_signup: { key: "auth.selfRegistration", transform: (v: boolean) => !v },
      jwt_exp: { key: "auth.jwtExpiry" },
      site_url: { key: "auth.siteUrl" },
      uri_allow_list: { key: "auth.uriAllowList" },
      mailer_autoconfirm: { key: "auth.mailerAutoconfirm" },
    });

    const host = Deno.env.get("BETTER_AUTH_URL") || "http://localhost:8001";
    res.json({
      site_url: body.site_url ?? host,
      uri_allow_list: body.uri_allow_list ?? "",
      disable_signup: body.disable_signup ?? false,
      jwt_exp: body.jwt_exp ?? 3600,
      mailer_autoconfirm: body.mailer_autoconfirm ?? true,
      phone_autoconfirm: body.phone_autoconfirm ?? false,
      sms_provider: body.sms_provider ?? "twilio",
      external_email_enabled: body.external_email_enabled ?? true,
      external_phone_enabled: body.external_phone_enabled ?? false,
    });
  } catch (err) {
    console.error("[config] Auth update error:", err);
    res.status(500).json({ message: "Failed to update auth config" });
  }
};
router.patch(`${BASE_PATH}/v1/projects/:ref/config/auth`, updateAuthConfig);
router.put(`${BASE_PATH}/v1/projects/:ref/config/auth`, updateAuthConfig);

const updateDbConfig = async (req: any, res: any) => {
  const user = await requireAdmin(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  try {
    const body = req.body || {};
    await upsertSettings(body, {
      max_connections: "database.maxConnections",
      statement_timeout: "database.statementTimeout",
      shared_buffers: "database.sharedBuffers",
      work_mem: "database.workMem",
    });

    res.json({
      effective_cache_size: body.effective_cache_size ?? "4GB",
      maintenance_work_mem: body.maintenance_work_mem ?? "512MB",
      max_connections: body.max_connections ?? 100,
      max_parallel_maintenance_workers: body.max_parallel_maintenance_workers ?? 2,
      max_parallel_workers: body.max_parallel_workers ?? 4,
      max_parallel_workers_per_gather: body.max_parallel_workers_per_gather ?? 2,
      max_worker_processes: body.max_worker_processes ?? 8,
      shared_buffers: body.shared_buffers ?? "1GB",
      statement_timeout: body.statement_timeout ?? "120s",
      work_mem: body.work_mem ?? "4MB",
    });
  } catch (err) {
    console.error("[config] Database update error:", err);
    res.status(500).json({ message: "Failed to update database config" });
  }
};
router.patch(`${BASE_PATH}/v1/projects/:ref/config/database/postgres`, updateDbConfig);
router.put(`${BASE_PATH}/v1/projects/:ref/config/database/postgres`, updateDbConfig);

const updatePostgrestConfig = async (req: any, res: any) => {
  const user = await requireAdmin(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  try {
    const body = req.body || {};
    await upsertSettings(body, {
      max_rows: "postgrest.maxRows",
      db_schema: "postgrest.dbSchema",
      db_extra_search_path: "postgrest.dbExtraSearchPath",
      db_pool: "postgrest.dbPool",
    });

    // Nudge the @trex/postgrest plugin to re-read its config live — it LISTENs
    // on the pgrst channel like upstream PostgREST. Best-effort: on failure the
    // new values still apply on the next config load.
    try {
      const { pool } = await import("../db.ts");
      await pool.query("NOTIFY pgrst, 'reload config'");
    } catch (err) {
      console.error("[config] PostgREST reload notify failed:", err);
    }

    res.json({
      db_extra_search_path: body.db_extra_search_path ?? "public,extensions",
      db_pool: body.db_pool ?? null,
      db_schema: body.db_schema ?? "public",
      max_rows: body.max_rows ?? 1000,
    });
  } catch (err) {
    console.error("[config] PostgREST update error:", err);
    res.status(500).json({ message: "Failed to update PostgREST config" });
  }
};
router.patch(`${BASE_PATH}/v1/projects/:ref/postgrest`, updatePostgrestConfig);
router.put(`${BASE_PATH}/v1/projects/:ref/postgrest`, updatePostgrestConfig);

const updateStorageConfig = async (req: any, res: any) => {
  const user = await requireAdmin(req);
  if (!user) { res.status(401).json({ message: "Unauthorized" }); return; }

  try {
    const body = req.body || {};
    if ("fileSizeLimit" in body) {
      await upsertSettings(body, { fileSizeLimit: "storage.fileSizeLimit" });
    }

    res.json({
      fileSizeLimit: body.fileSizeLimit ?? 52428800,
      features: {
        imageTransformation: { enabled: body.features?.imageTransformation?.enabled ?? false },
      },
    });
  } catch (err) {
    console.error("[config] Storage update error:", err);
    res.status(500).json({ message: "Failed to update storage config" });
  }
};
router.patch(`${BASE_PATH}/v1/projects/:ref/config/storage`, updateStorageConfig);
router.put(`${BASE_PATH}/v1/projects/:ref/config/storage`, updateStorageConfig);

// ── Helper: resolve externally-reachable DB host ─────────────────────────────

function getDbHost(): string {
  // EXTERNAL_DB_URL takes priority (for CLI clients outside the container)
  const url = Deno.env.get("EXTERNAL_DB_URL") || Deno.env.get("POOLER_URL") || Deno.env.get("DATABASE_URL") || "";
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

// ── Type generation endpoint (Supabase CLI: supabase gen types) ──────────────

const PG_TO_TS: Record<string, string> = {
  int2: "number", int4: "number", int8: "number",
  float4: "number", float8: "number", numeric: "number",
  text: "string", varchar: "string", char: "string", bpchar: "string",
  uuid: "string", name: "string", citext: "string",
  bool: "boolean",
  json: "Json", jsonb: "Json",
  timestamp: "string", timestamptz: "string", date: "string",
  time: "string", timetz: "string", interval: "string",
  bytea: "string",
  inet: "string", cidr: "string", macaddr: "string",
  oid: "number",
  void: "undefined",
};

function pgTypeToTs(udtName: string, isNullable: boolean, enumTypes: Set<string>): string {
  let tsType: string;
  if (udtName.startsWith("_")) {
    // Array type — strip leading underscore to get element type
    const elemUdt = udtName.slice(1);
    const elemTs = enumTypes.has(elemUdt)
      ? `Database[string]["Enums"]["${elemUdt}"]`
      : (PG_TO_TS[elemUdt] || "unknown");
    tsType = `${elemTs}[]`;
  } else if (enumTypes.has(udtName)) {
    tsType = `Database[string]["Enums"]["${udtName}"]`;
  } else {
    tsType = PG_TO_TS[udtName] || "unknown";
  }
  return isNullable ? `${tsType} | null` : tsType;
}

router.get(`${BASE_PATH}/v1/projects/:ref/types/typescript`, apiLimiter, async (req, res) => {
  const user = await requireAdmin(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const includedSchemas = ((req.query.included_schemas as string) || "public")
    .split(",")
    .map(s => s.trim().replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean);

  try {
    const { pool } = await import("../db.ts");

    const colResult = await pool.query(
      `SELECT table_schema, table_name, column_name, is_nullable, column_default, udt_name
       FROM information_schema.columns
       WHERE table_schema = ANY($1)
       ORDER BY table_schema, table_name, ordinal_position`,
      [includedSchemas],
    );

    // Fetch views to distinguish Tables vs Views
    const viewResult = await pool.query(
      `SELECT table_schema, table_name
       FROM information_schema.views
       WHERE table_schema = ANY($1)`,
      [includedSchemas],
    );
    const viewSet = new Set(viewResult.rows.map((r: any) => `${r.table_schema}.${r.table_name}`));

    const enumResult = await pool.query(
      `SELECT n.nspname AS schema, t.typname AS name, e.enumlabel AS value
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       JOIN pg_namespace n ON t.typnamespace = n.oid
       WHERE n.nspname = ANY($1)
       ORDER BY n.nspname, t.typname, e.enumsortorder`,
      [includedSchemas],
    );
    const enumsBySchema: Record<string, Record<string, string[]>> = {};
    const enumTypes = new Set<string>();
    for (const row of enumResult.rows) {
      if (!enumsBySchema[row.schema]) enumsBySchema[row.schema] = {};
      if (!enumsBySchema[row.schema][row.name]) enumsBySchema[row.schema][row.name] = [];
      enumsBySchema[row.schema][row.name].push(row.value);
      enumTypes.add(row.name);
    }

    const funcResult = await pool.query(
      `SELECT n.nspname AS schema, p.proname AS name,
              pg_get_function_arguments(p.oid) AS args,
              t.typname AS return_type, p.proretset AS returns_set
       FROM pg_proc p
       JOIN pg_namespace n ON p.pronamespace = n.oid
       JOIN pg_type t ON p.prorettype = t.oid
       WHERE n.nspname = ANY($1)
         AND p.prokind = 'f'
       ORDER BY n.nspname, p.proname`,
      [includedSchemas],
    );

    type ColInfo = { column_name: string; is_nullable: string; column_default: string | null; udt_name: string };
    const tablesBySchema: Record<string, Record<string, ColInfo[]>> = {};
    for (const row of colResult.rows) {
      if (!tablesBySchema[row.table_schema]) tablesBySchema[row.table_schema] = {};
      if (!tablesBySchema[row.table_schema][row.table_name]) tablesBySchema[row.table_schema][row.table_name] = [];
      tablesBySchema[row.table_schema][row.table_name].push(row);
    }

    const lines: string[] = [];
    lines.push(`export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]`);
    lines.push(``);
    lines.push(`export type Database = {`);

    for (const schema of includedSchemas) {
      lines.push(`  ${schema}: {`);

      // Tables
      lines.push(`    Tables: {`);
      const tables = tablesBySchema[schema] || {};
      for (const [tableName, columns] of Object.entries(tables)) {
        if (viewSet.has(`${schema}.${tableName}`)) continue;
        lines.push(`      ${tableName}: {`);

        // Row
        lines.push(`        Row: {`);
        for (const col of columns) {
          const nullable = col.is_nullable === "YES";
          const tsType = pgTypeToTs(col.udt_name, nullable, enumTypes);
          lines.push(`          ${col.column_name}: ${tsType}`);
        }
        lines.push(`        }`);

        // Insert
        lines.push(`        Insert: {`);
        for (const col of columns) {
          const nullable = col.is_nullable === "YES";
          const hasDefault = col.column_default !== null;
          const tsType = pgTypeToTs(col.udt_name, nullable, enumTypes);
          const optional = (nullable || hasDefault) ? "?" : "";
          lines.push(`          ${col.column_name}${optional}: ${tsType}`);
        }
        lines.push(`        }`);

        // Update
        lines.push(`        Update: {`);
        for (const col of columns) {
          const nullable = col.is_nullable === "YES";
          const tsType = pgTypeToTs(col.udt_name, nullable, enumTypes);
          lines.push(`          ${col.column_name}?: ${tsType}`);
        }
        lines.push(`        }`);

        lines.push(`      }`);
      }
      lines.push(`    }`);

      // Views
      lines.push(`    Views: {`);
      for (const [tableName, columns] of Object.entries(tables)) {
        if (!viewSet.has(`${schema}.${tableName}`)) continue;
        lines.push(`      ${tableName}: {`);
        lines.push(`        Row: {`);
        for (const col of columns) {
          const tsType = pgTypeToTs(col.udt_name, true, enumTypes); // view columns always nullable
          lines.push(`          ${col.column_name}: ${tsType}`);
        }
        lines.push(`        }`);
        lines.push(`      }`);
      }
      lines.push(`    }`);

      // Functions
      lines.push(`    Functions: {`);
      const funcs = (funcResult.rows as any[]).filter(f => f.schema === schema);
      for (const func of funcs) {
        const returnTs = PG_TO_TS[func.return_type] || "unknown";
        const setOf = func.returns_set ? "[]" : "";
        lines.push(`      ${func.name}: {`);
        lines.push(`        Args: ${func.args ? `Record<string, unknown>` : `Record<string, never>`}`);
        lines.push(`        Returns: ${returnTs}${setOf}`);
        lines.push(`      }`);
      }
      lines.push(`    }`);

      // Enums
      lines.push(`    Enums: {`);
      const enums = enumsBySchema[schema] || {};
      for (const [enumName, values] of Object.entries(enums)) {
        lines.push(`      ${enumName}: ${values.map(v => `"${v}"`).join(" | ")}`);
      }
      lines.push(`    }`);

      // CompositeTypes (stub)
      lines.push(`    CompositeTypes: {`);
      lines.push(`      [_ in never]: never`);
      lines.push(`    }`);

      lines.push(`  }`);
    }

    lines.push(`}`);
    lines.push(``);

    res.type("text/plain").header("X-Content-Type-Options", "nosniff").send(lines.join("\n"));
  } catch (err) {
    console.error("[types] Generation error:", err);
    res.status(500).json({ message: "Failed to generate types", details: String(err) });
  }
});

export { router as functionsRouter };
