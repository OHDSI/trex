// Ports the inspect side of src/PostgREST/Query.hs (PostgREST v12.2.3):
// actionQuery for MaybeDb InspectPlan — per openapi-mode, the
// accessibleTables / accessibleFuncs / schemaDescription statements run in
// the request transaction (so the impersonated role's privileges apply on
// follow-privileges), or the schema cache is filtered by schema on
// ignore-privileges.

import type { PoolClient } from "pg";
import type { AuthResult } from "../auth/jwt.ts";
import type { AppConfig } from "../config.ts";
import type { ApiRequest } from "../parse/api-request.ts";
import type { InspectPlan } from "../plan/read-plan.ts";
import {
  ACCESSIBLE_FUNCS_SQL,
  ACCESSIBLE_TABLES_SQL,
  SCHEMA_DESCRIPTION_SQL,
} from "../schema-cache/sql.ts";
import { decodeFuncs, type FuncRow } from "../schema-cache/index.ts";
import type { RoutineMap, SchemaCache, TablesMap } from "../schema-cache/types.ts";
import { runQuery } from "./executor.ts";

/** The `Maybe (TablesMap, RoutineMap, Maybe Text)` of Query.hs MaybeDbResult. */
export interface InspectResult {
  tables: TablesMap;
  routines: RoutineMap;
  schemaDescription: string | null;
}

/**
 * Ports Query.hs actionQuery (MaybeDb InspectPlan). Returns null on
 * openapi-mode=disabled (upstream's Nothing; unreachable through app.ts,
 * where the root already 404s in that mode).
 */
export async function inspectQuery(
  plan: InspectPlan,
  config: AppConfig,
  apiReq: ApiRequest,
  authResult: AuthResult,
  sCache: SchemaCache,
): Promise<InspectResult | null> {
  if (config.openApiMode === "disabled") return null;
  const tSchema = plan.ipSchema;
  const followPriv = config.openApiMode === "follow-privileges";
  const { preferTransaction, preferTimezone } = apiReq.iPreferences;

  const outcome = await runQuery<InspectResult>({
    authResult,
    config,
    req: {
      path: apiReq.iPath,
      method: apiReq.iMethod,
      headers: Object.fromEntries(apiReq.iHeaders),
      cookies: Object.fromEntries(apiReq.iCookies),
    },
    schema: apiReq.iSchema,
    timezone: preferTimezone ?? undefined,
    preferTx: preferTransaction === null ? undefined : preferTransaction === "Commit" ? "commit" : "rollback",
    mainQuery: { text: SCHEMA_DESCRIPTION_SQL, values: [tSchema] },
    postRunner: async (client, main) => {
      const schemaDescription = (main.rows[0] as { description: string | null } | undefined)?.description ?? null;
      if (followPriv) {
        const [tables, routines] = await Promise.all([
          accessibleTables(client, tSchema, sCache),
          accessibleFuncs(client, tSchema, config.dbHoistedTxSettings),
        ]);
        return { tables, routines, schemaDescription };
      }
      // OAIgnorePriv: the whole schema cache, filtered by the request schema.
      const tables: TablesMap = new Map();
      for (const [key, tbl] of sCache.tables) {
        if (tbl.schema === tSchema) tables.set(key, tbl);
      }
      const routines: RoutineMap = new Map();
      for (const [key, procs] of sCache.routines) {
        if (procs.length > 0 && procs[0].schema === tSchema) routines.set(key, procs);
      }
      return { tables, routines, schemaDescription };
    },
  });
  return outcome.extra ?? null;
}

/** Query.hs: `HM.filterWithKey (\qi _ -> S.member qi tableAccess) dbTables`. */
async function accessibleTables(client: PoolClient, tSchema: string, sCache: SchemaCache): Promise<TablesMap> {
  const res = await client.query({ text: ACCESSIBLE_TABLES_SQL, values: [[tSchema]], rowMode: "array" });
  const access = new Set((res.rows as [string, string][]).map(([schema, name]) => `${schema}.${name}`));
  const tables: TablesMap = new Map();
  for (const [key, tbl] of sCache.tables) {
    if (access.has(`${tbl.schema}.${tbl.name}`)) tables.set(key, tbl);
  }
  return tables;
}

/** SchemaCache.hs accessibleFuncs, run in-tx (composite args come back via
 * row_to_json like the schema-cache loader does over the text protocol). */
async function accessibleFuncs(client: PoolClient, tSchema: string, hoisted: string[]): Promise<RoutineMap> {
  const text = `select row_to_json(_q) as r from (${ACCESSIBLE_FUNCS_SQL}) _q`;
  const res = await client.query({ text, values: [tSchema, hoisted], rowMode: "array" });
  return decodeFuncs((res.rows as [FuncRow][]).map((row) => row[0]));
}
