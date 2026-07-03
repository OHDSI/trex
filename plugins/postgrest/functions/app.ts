// Ports src/PostgREST/App.hs — the request pipeline.
//
// Pipeline (built out across phases):
//   parse ApiRequest → verify JWT → plan → build SQL → execute → respond
//
// Phase 1: routing shell only. Admin endpoints work; API requests get a 501
// stub (never reachable in production until POSTGREST_MODE=plugin).

import { PgrstError } from "./errors.ts";
import { handleAdmin } from "./admin.ts";
import { stripMount } from "./state.ts";

/** Pure request handler — unit-testable without a listening socket. */
export async function handle(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = stripMount(url.pathname);
    if (path === null) {
      return new Response(JSON.stringify({ message: "unknown mount path" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path.startsWith("/admin")) {
      const adminResponse = handleAdmin(path, req.method);
      if (adminResponse) return adminResponse;
    }

    // TODO(phase 4+): ApiRequest parse → auth → plan → query → response.
    return new Response(
      JSON.stringify({ message: "PostgREST plugin: endpoint not implemented yet" }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof PgrstError) return err.response();
    console.error("[postgrest] unhandled error:", err);
    return new Response(
      JSON.stringify({ code: "PGRSTX00", message: String(err), details: null, hint: null }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
