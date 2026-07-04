// Ports src/PostgREST/App.hs — the request pipeline.
//
// Pipeline: verify JWT → parse ApiRequest → plan → build SQL → execute →
// respond (upstream runs auth as a middleware before userApiRequest, so JWT
// errors win over parse errors).
//
// Phases 5–8: GET/HEAD on tables/views including resource embedding,
// mutations (POST/PATCH/PUT/DELETE incl. upserts), stored procedures
// (GET/HEAD/POST /rpc/fn), the OpenAPI root (GET/HEAD /, or the db-root-spec
// routine) and OPTIONS (Allow headers per table/routine/root).

import { handleAdmin } from "./admin.ts";
import { authenticate } from "./auth/jwt.ts";
import { getConfig, reloadConfig } from "./config.ts";
import { encodeOpenApi } from "./openapi.ts";
import { PgrstError } from "./errors.ts";
import { userApiRequest } from "./parse/api-request.ts";
import { callReadPlan } from "./plan/call-plan.ts";
import { mutateReadPlan } from "./plan/mutate-plan.ts";
import { inspectPlan, wrappedReadPlan } from "./plan/read-plan.ts";
import { invokeQuery } from "./query/call.ts";
import { inspectQuery } from "./query/openapi.ts";
import { readQuery } from "./query/read.ts";
import { writeQuery } from "./query/write.ts";
import {
  createResponse,
  deleteResponse,
  infoIdentResponse,
  infoProcResponse,
  infoRootResponse,
  invokeResponse,
  openApiResponse,
  readResponse,
  singleUpsertResponse,
  updateResponse,
} from "./response.ts";
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
    const apiReq = userApiRequest(config, req, path, sCache.timezones, await req.text());

    const act = apiReq.iAction;
    if (act.kind === "ActDb" && act.db.kind === "ActRelationRead") {
      const plan = wrappedReadPlan(act.db.qi, config, sCache, apiReq, act.db.headersOnly);
      const resultSet = await readQuery(plan, config, apiReq, authResult);
      return readResponse(resultSet, apiReq, plan);
    }

    if (act.kind === "ActDb" && act.db.kind === "ActRelationMut") {
      const plan = mutateReadPlan(act.db.mutation, apiReq, act.db.qi, config, sCache);
      const resultSet = await writeQuery(plan, config, apiReq, authResult);
      switch (plan.mrMutation) {
        case "MutationCreate":
          return createResponse(resultSet, apiReq, plan);
        case "MutationUpdate":
          return updateResponse(resultSet, apiReq, plan);
        case "MutationSingleUpsert":
          return singleUpsertResponse(resultSet, apiReq, plan);
        case "MutationDelete":
          return deleteResponse(resultSet, apiReq, plan);
      }
    }

    // Bad RPC methods (PATCH/PUT/DELETE) already threw PGRST101 in getAction.
    if (act.kind === "ActDb" && act.db.kind === "ActRoutine") {
      const plan = callReadPlan(act.db.qi, config, sCache, apiReq, act.db.invMethod);
      const resultSet = await invokeQuery(plan, config, apiReq, authResult);
      return invokeResponse(resultSet, apiReq, plan);
    }

    // GET/HEAD / — the OpenAPI root (db-root-spec roots route as ActRoutine).
    if (act.kind === "ActDb" && act.db.kind === "ActSchemaRead") {
      const plan = inspectPlan(apiReq, act.db.headersOnly, act.db.schema);
      const result = await inspectQuery(plan, config, apiReq, authResult, sCache);
      const body = result === null ? null : encodeOpenApi(
        config,
        sCache.relationships,
        [...result.tables.values()],
        [...result.routines.values()].flat(),
        result.schemaDescription,
      );
      return openApiResponse(body, plan.ipHdrsOnly, apiReq);
    }

    // OPTIONS — the NoDb info plans (Response.hs info*Response).
    if (act.kind === "ActRelationInfo") return infoIdentResponse(act.qi, sCache);
    if (act.kind === "ActRoutineInfo") {
      // Upstream plans OPTIONS /rpc/fn through callReadPlan (RoutineInfoPlan),
      // so unknown functions 404 and overload resolution applies.
      const plan = callReadPlan(act.qi, config, sCache, apiReq, act.invMethod);
      return infoProcResponse(plan.crProc);
    }
    return infoRootResponse();
  } catch (err) {
    if (err instanceof PgrstError) return err.response();
    console.error("[postgrest] unhandled error:", err);
    return new Response(
      JSON.stringify({ code: "PGRSTX00", message: String(err), details: null, hint: null }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
