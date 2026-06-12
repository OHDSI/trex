// @ts-nocheck - Deno edge function, not compiled by tsc

const BASE = Deno.env.get("FHIR_BASE_PATH") ?? "/trex/fhir";

/** Pure request handler — exported so unit tests can call it without a socket. */
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // The runtime mounts this worker under BASE; in production the worker
  // sees the path AFTER the mount. Strip the base prefix if present so the
  // same handler works in unit tests (which call /health directly) and mounted.
  const raw = url.pathname;
  const path = (raw.startsWith(BASE) ? raw.slice(BASE.length) : raw) || "/";
  if (path === "/health") {
    return Response.json({ status: "ok" });
  }
  return Response.json({ resourceType: "OperationOutcome" }, { status: 404 });
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
