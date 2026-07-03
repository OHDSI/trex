// Ports src/PostgREST/Admin.hs — health/inspection endpoints.
//
// PostgREST serves these on a separate admin port; here they live under
// /admin/* on the authenticated plugin mount (/plugins/trex/postgrest/admin/*).

/**
 * Handles /admin/* paths. `path` is the in-API path (e.g. "/admin/live").
 * Returns null for unknown admin paths.
 */
export function handleAdmin(path: string, method: string): Response | null {
  if (method !== "GET" && method !== "HEAD") return null;
  switch (path) {
    case "/admin/live":
      // The worker responding at all means the event loop is alive.
      return new Response(null, { status: 200 });
    case "/admin/ready":
      // TODO(phase 2): report 503 until the schema cache has loaded and the
      // database connection is established, like Admin.hs `isReady`.
      return new Response(null, { status: 200 });
    case "/admin/config":
      // TODO(phase 3): dump effective config (secrets redacted).
      return new Response(JSON.stringify({ error: "not implemented" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    case "/admin/schema_cache":
      // TODO(phase 2): dump the loaded schema cache.
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
