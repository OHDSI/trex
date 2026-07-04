// Ports src/PostgREST/App.hs — the request pipeline.
//
// Pipeline (built out across phases):
//   parse ApiRequest → verify JWT → plan → build SQL → execute → respond
//
// Phase 3: startup wiring (config + LISTEN channel) and the admin surface.
// API requests still get a 501 stub (never reachable in production until
// POSTGREST_MODE=plugin).

import { handleAdmin } from "./admin.ts";
import { getConfig, reloadConfig } from "./config.ts";
import { PgrstError } from "./errors.ts";
import { type SchemaCacheListener, startListener } from "./schema-cache/index.ts";
import { stripMount } from "./state.ts";

let startPromise: Promise<void> | null = null;
let listener: SchemaCacheListener | null = null;

async function start(): Promise<void> {
  const config = await getConfig();
  const dsn = Deno.env.get("PGRST_DB_URI");
  // AppState.hs: the LISTEN connection reloads the schema cache on
  // "reload schema" and the config on "reload config".
  if (config.dbChannelEnabled && dsn && listener === null) {
    listener = startListener(dsn, config.dbChannel, reloadConfig);
  }
}

/** Loads the config and starts the LISTEN connection once, on first request. */
export function ensureStarted(): Promise<void> {
  if (!startPromise) {
    startPromise = start().catch((err) => {
      console.error("[postgrest] startup failed:", err);
      startPromise = null; // retry on the next request
    });
  }
  return startPromise;
}

/** Test hook: stops the listener and re-arms the startup logic. */
export async function shutdownForTests(): Promise<void> {
  if (listener) {
    await listener.stop();
    listener = null;
  }
  startPromise = null;
}

/** Pure request handler — unit-testable without a listening socket. */
export async function handle(req: Request): Promise<Response> {
  try {
    await ensureStarted();

    const url = new URL(req.url);
    const path = stripMount(url.pathname);
    if (path === null) {
      return new Response(JSON.stringify({ message: "unknown mount path" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (path.startsWith("/admin")) {
      const adminResponse = await handleAdmin(path, req.method);
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
