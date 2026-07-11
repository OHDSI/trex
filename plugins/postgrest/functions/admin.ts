// Ports src/PostgREST/Admin.hs — health/inspection endpoints.
//
// PostgREST serves these on a separate admin port; here they live under
// /admin/* on the authenticated plugin mount (/plugins/trex/postgrest/admin/*).

import { getConfig } from "./config.ts";
import { getSchemaCache } from "./schema-cache/index.ts";

/**
 * Handles /admin/* paths. `path` is the in-API path (e.g. "/admin/live").
 * Returns null for unknown admin paths.
 */
export async function handleAdmin(path: string, method: string): Promise<Response | null> {
  if (method !== "GET" && method !== "HEAD") return null;
  switch (path) {
    case "/admin/live":
      // The worker responding at all means the event loop is alive.
      return new Response(null, { status: 200 });
    case "/admin/ready":
      // Admin.hs isReady: 503 until the schema cache has loaded.
      try {
        await getSchemaCache();
        return new Response(null, { status: 200 });
      } catch {
        return new Response(null, { status: 503 });
      }
    case "/admin/config": {
      // Admin.hs config reply (Config.hs toText dump) — effective config as
      // JSON with the JWT secret redacted.
      const config = await getConfig();
      const redacted = { ...config, jwtSecret: config.jwtSecret === null ? null : "<redacted>" };
      return new Response(JSON.stringify(redacted, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    case "/admin/schema_cache":
      // TODO(phase 4+): dump the loaded schema cache (needs JSON encoders).
      return new Response(JSON.stringify({ error: "not implemented" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    case "/admin/metrics":
      // Deliberately stubbed — trex has its own metrics story.
      return new Response("metrics not supported", { status: 501 });
    default:
      return null;
  }
}
