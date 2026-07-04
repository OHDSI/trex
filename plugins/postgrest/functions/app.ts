// Ports src/PostgREST/App.hs — the request pipeline.
//
// Pipeline: verify JWT → parse ApiRequest → plan → build SQL → execute →
// respond (upstream runs auth as a middleware before userApiRequest, so JWT
// errors win over parse errors).
//
// Phase 4b: GET/HEAD on tables/views (no embedded resources). Mutations,
// RPC, OpenAPI root and OPTIONS keep the 501 stub.

import { handleAdmin } from "./admin.ts";
import { authenticate } from "./auth/jwt.ts";
import { getConfig, reloadConfig } from "./config.ts";
import { PgrstError } from "./errors.ts";
import { userApiRequest } from "./parse/api-request.ts";
import { wrappedReadPlan } from "./plan/read-plan.ts";
import { readQuery } from "./query/read.ts";
import { readResponse } from "./response.ts";
import { getSchemaCache, type SchemaCacheListener, startListener } from "./schema-cache/index.ts";
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

    // App.hs postgrestResponse: auth middleware → userApiRequest →
    // actionPlan → runQuery → actionResponse.
    const config = await getConfig();
    const authResult = await authenticate(req.headers.get("Authorization"), config);
    const sCache = await getSchemaCache();
    const apiReq = userApiRequest(config, req, path, sCache.timezones);

    const act = apiReq.iAction;
    if (act.kind === "ActDb" && act.db.kind === "ActRelationRead") {
      const plan = wrappedReadPlan(act.db.qi, config, sCache, apiReq, act.db.headersOnly);
      const resultSet = await readQuery(plan, config, apiReq, authResult);
      return readResponse(resultSet, apiReq, plan);
    }

    // TODO(phase 6+): mutations, RPC, OpenAPI root, OPTIONS.
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
