// @ts-nocheck - Deno edge function
/**
 * Thin Supabase Management API client abstraction.
 * Supports both local trex instance (default) and external Supabase cloud.
 */

import { decryptToken } from "../crypto.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

export interface SupabaseTarget {
  type: "local" | "cloud";
  baseUrl: string;        // Management API base: local trex URL or https://api.supabase.com
  projectRef: string;
  accessToken: string;    // service_role key (local) or user access token (cloud)
  supabaseUrl: string;    // Public Supabase URL for client config
  anonKey: string;
}

/**
 * Resolve deployment target from app config in the database.
 * For local: derives URL from request Host header, fetches keys from trex.setting.
 * For cloud: reads encrypted token from devx.integrations.
 */
export async function resolveTarget(
  sql: (q: string, p: unknown[]) => Promise<{ rows: any[] }>,
  userId: string,
  appId: string,
  req: Request,
): Promise<SupabaseTarget> {
  const appResult = await sql(
    `SELECT supabase_target, supabase_project_id FROM devx.apps WHERE id = $1 AND user_id = $2`,
    [appId, userId],
  );
  if (appResult.rows.length === 0) {
    throw new Error("App not found");
  }

  const { supabase_target: target, supabase_project_id: projectId } = appResult.rows[0];

  if (target === "cloud") {
    return resolveCloudTarget(sql, userId, projectId);
  }

  return resolveLocalTarget(sql, req);
}

async function resolveLocalTarget(
  sql: (q: string, p: unknown[]) => Promise<{ rows: any[] }>,
  req: Request,
): Promise<SupabaseTarget> {
  // Derive local trex base URL from the request
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const basePath = Deno.env.get("BASE_PATH") || "/trex";
  const baseUrl = `${proto}://${host}${basePath}`;

  // Fetch keys from trex.setting
  const keysResult = await sql(
    `SELECT key, value FROM trex.setting WHERE key IN ('auth.anonKey', 'auth.serviceRoleKey')`,
    [],
  );
  const keys: Record<string, string> = {};
  for (const row of keysResult.rows) {
    keys[row.key] = typeof row.value === "string" ? row.value : JSON.parse(row.value);
  }

  const serviceRoleKey = keys["auth.serviceRoleKey"];
  const anonKey = keys["auth.anonKey"];
  if (!serviceRoleKey || !anonKey) {
    throw new Error("Trex API keys not configured. Check trex.setting table.");
  }

  // Local project ref is arbitrary (trex accepts any ref)
  const projectRef = Deno.env.get("TREX_PROJECT_REF") || "local";

  return {
    type: "local",
    baseUrl,
    projectRef,
    accessToken: serviceRoleKey,
    supabaseUrl: baseUrl,
    anonKey,
  };
}

async function resolveCloudTarget(
  sql: (q: string, p: unknown[]) => Promise<{ rows: any[] }>,
  userId: string,
  projectId: string | null,
): Promise<SupabaseTarget> {
  if (!projectId) {
    throw new Error("No Supabase project configured for this app");
  }

  // Read encrypted access token from integrations
  const tokenResult = await sql(
    `SELECT encrypted_token, token_iv FROM devx.integrations WHERE user_id = $1 AND provider = 'supabase' LIMIT 1`,
    [userId],
  );
  if (tokenResult.rows.length === 0) {
    throw new Error("Supabase not connected. Add your access token in Settings.");
  }

  const accessToken = await decryptToken(
    tokenResult.rows[0].encrypted_token,
    tokenResult.rows[0].token_iv,
  );

  // Fetch API keys from Supabase Management API
  const keysRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectId}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!keysRes.ok) {
    throw new Error(`Failed to fetch Supabase API keys: ${keysRes.statusText}`);
  }
  const apiKeys = await keysRes.json();
  const anonKey = apiKeys.find((k: any) => k.name === "anon")?.api_key || "";
  const serviceKey = apiKeys.find((k: any) => k.name === "service_role")?.api_key || "";

  return {
    type: "cloud",
    baseUrl: "https://api.supabase.com",
    projectRef: projectId,
    accessToken,
    supabaseUrl: `https://${projectId}.supabase.co`,
    anonKey,
  };
}

/**
 * Deploy a single edge function to the target.
 */
export async function deployFunction(
  target: SupabaseTarget,
  slug: string,
  sourceCode: string,
  importMap?: string,
): Promise<{ slug: string; version: number }> {
  const deployUrl = target.type === "local"
    ? `${target.baseUrl}/v1/projects/${target.projectRef}/functions/deploy?slug=${encodeURIComponent(slug)}`
    : `https://api.supabase.com/v1/projects/${target.projectRef}/functions/deploy?slug=${encodeURIComponent(slug)}`;

  const body: any = { slug, body: sourceCode };
  if (importMap) {
    body.import_map = importMap;
  }

  const res = await fetch(deployUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Deploy function "${slug}" failed: ${err}`);
  }

  return res.json();
}

/**
 * Execute a SQL migration against the target.
 * For local: uses sql() directly for better performance.
 * For cloud: uses the Supabase Management API.
 */
export async function executeMigration(
  target: SupabaseTarget,
  sqlContent: string,
  sql?: (q: string, p: unknown[]) => Promise<{ rows: any[] }>,
): Promise<void> {
  if (target.type === "local" && sql) {
    await sql(sqlContent, []);
    return;
  }

  // Cloud: POST to database query endpoint
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${target.projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.accessToken}`,
      },
      body: JSON.stringify({ query: sqlContent }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Migration failed: ${err}`);
  }
}

/**
 * Ensure a storage bucket exists.
 */
export async function ensureBucket(
  target: SupabaseTarget,
  bucketName: string,
  isPublic: boolean = true,
): Promise<void> {
  const storageBase = target.type === "local"
    ? `${target.supabaseUrl}/storage/v1`
    : `https://${target.projectRef}.supabase.co/storage/v1`;

  const res = await fetch(`${storageBase}/bucket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.accessToken}`,
      apikey: target.anonKey,
    },
    body: JSON.stringify({ id: bucketName, name: bucketName, public: isPublic }),
  });

  // 409 = already exists, which is fine
  if (!res.ok && res.status !== 409) {
    const err = await res.text();
    throw new Error(`Create bucket "${bucketName}" failed: ${err}`);
  }
}

/**
 * Upload a file to Supabase Storage.
 */
export async function uploadToStorage(
  target: SupabaseTarget,
  bucket: string,
  filePath: string,
  content: Uint8Array,
  contentType: string = "application/octet-stream",
): Promise<void> {
  const storageBase = target.type === "local"
    ? `${target.supabaseUrl}/storage/v1`
    : `https://${target.projectRef}.supabase.co/storage/v1`;

  const res = await fetch(`${storageBase}/object/${bucket}/${filePath}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${target.accessToken}`,
      apikey: target.anonKey,
      "x-upsert": "true",
    },
    body: content,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload "${filePath}" failed: ${err}`);
  }
}

/**
 * Get API keys for the target project.
 */
export async function getApiKeys(
  target: SupabaseTarget,
): Promise<{ anonKey: string; serviceRoleKey: string }> {
  if (target.type === "local") {
    // Already resolved during target creation
    return { anonKey: target.anonKey, serviceRoleKey: target.accessToken };
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${target.projectRef}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${target.accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch API keys: ${res.statusText}`);
  }
  const keys = await res.json();
  return {
    anonKey: keys.find((k: any) => k.name === "anon")?.api_key || "",
    serviceRoleKey: keys.find((k: any) => k.name === "service_role")?.api_key || "",
  };
}

/**
 * Collect edge function sources from app workspace.
 * Returns array of { slug, sourceCode, importMap? }.
 */
export async function collectFunctions(
  appWorkspacePath: string,
): Promise<{ slug: string; sourceCode: string; importMap?: string }[]> {
  const functionsDir = join(appWorkspacePath, "supabase", "functions");
  const functions: { slug: string; sourceCode: string; importMap?: string }[] = [];

  try {
    for await (const entry of Deno.readDir(functionsDir)) {
      if (!entry.isDirectory || entry.name.startsWith("_")) continue;

      const indexPath = join(functionsDir, entry.name, "index.ts");
      try {
        const sourceCode = await Deno.readTextFile(indexPath);
        let importMap: string | undefined;

        // Check for deno.json import map
        try {
          importMap = await Deno.readTextFile(join(functionsDir, entry.name, "deno.json"));
        } catch { /* no import map */ }

        functions.push({ slug: entry.name, sourceCode, importMap });
      } catch {
        // Skip functions without index.ts
      }
    }
  } catch {
    // No supabase/functions directory
  }

  return functions.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Collect SQL migration files from app workspace.
 * Returns sorted array of { name, content }.
 */
export async function collectMigrations(
  appWorkspacePath: string,
): Promise<{ name: string; content: string }[]> {
  const migrationsDir = join(appWorkspacePath, "supabase", "migrations");
  const migrations: { name: string; content: string }[] = [];

  try {
    for await (const entry of Deno.readDir(migrationsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
      const content = await Deno.readTextFile(join(migrationsDir, entry.name));
      migrations.push({ name: entry.name, content });
    }
  } catch {
    // No supabase/migrations directory
  }

  return migrations.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recursively collect files from a directory for upload.
 * Returns array of { path (relative), content, contentType }.
 */
export async function collectDistFiles(
  distDir: string,
  basePath: string = "",
): Promise<{ path: string; content: Uint8Array; contentType: string }[]> {
  const files: { path: string; content: Uint8Array; contentType: string }[] = [];

  try {
    for await (const entry of Deno.readDir(distDir)) {
      const fullPath = join(distDir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        const subFiles = await collectDistFiles(fullPath, relativePath);
        files.push(...subFiles);
      } else if (entry.isFile) {
        const content = await Deno.readFile(fullPath);
        const contentType = guessContentType(entry.name);
        files.push({ path: relativePath, content, contentType });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    txt: "text/plain",
    map: "application/json",
    wasm: "application/wasm",
  };
  return types[ext || ""] || "application/octet-stream";
}
