// Ports the transaction plumbing of src/PostgREST/Query.hs (PostgREST
// v12.2.3): one pooled connection runs
//   BEGIN (isolation level + read-only mode per Plan.hs txMode)
//   → setPgLocals (a single `select set_config(...), ...` statement)
//   → runPreReq (db-pre-request function)
//   → the main query
//   → COMMIT / ROLLBACK (db-tx-end + Prefer: tx= override semantics).

import type { Pool, PoolClient, QueryResult } from "pg";
import type { AuthResult } from "../auth/jwt.ts";
import type { AppConfig, IsolationLevel } from "../config.ts";
import { getPool } from "../db.ts";
import { connectionError, fromPgError, type PgServerError, PgrstError, poolAcquisitionTimeout } from "../errors.ts";
import { escapeIdentList, fromQi } from "./fragments.ts";

export type PreferTransaction = "commit" | "rollback";

/** ApiRequest.hs fields that become request.* GUCs. */
export interface RequestContext {
  /** Raw request path (ApiRequest.hs iPath). */
  path: string;
  /** Raw method (ApiRequest.hs iMethod); also drives the transaction mode. */
  method: string;
  /** Folded-lowercase header map, Cookie excluded (ApiRequest.hs iHdrs). */
  headers: Record<string, string>;
  /** Parsed Cookie pairs (ApiRequest.hs iCkies). */
  cookies: Record<string, string>;
  /** Kept for phases 4+ (query building); not used by the executor. */
  searchParams?: URLSearchParams;
}

export interface MainQuery {
  text: string;
  values?: unknown[];
  /**
   * Disable node-postgres' type parsers for the main query's result values —
   * every column arrives as its raw wire text. Used for EXPLAIN statements
   * (application/vnd.pgrst.plan), where FORMAT JSON output must stay
   * byte-faithful instead of being parsed into JS objects.
   */
  rawTypes?: boolean;
}

export interface RunQueryOptions<T = void> {
  authResult: AuthResult;
  config: AppConfig;
  req: RequestContext;
  /** Request schema (ApiRequest.hs iSchema); defaults to the first db-schema. */
  schema?: string;
  /** Plan.hs: POST RPC of a stable/immutable function also runs READ ONLY. */
  isReadonlyRpc?: boolean;
  /** RPC function's isolation level (Routine.hs pdIsoLvl) — beats the role's. */
  funcIsoLvl?: IsolationLevel;
  /** Override for the impersonated role's hoisted settings (defaults to config.roleSettings[role]). */
  roleSettings?: Record<string, string>;
  /** RPC function's hoisted SET settings (Routine.hs pdFuncSettings). */
  funcSettings?: [string, string][];
  /** Prefer: timezone= (already validated against the timezone cache). */
  timezone?: string;
  /** Prefer: tx=commit|rollback — only honored when db-tx-end allows override. */
  preferTx?: PreferTransaction;
  mainQuery: MainQuery;
  /** Runs in-tx after setPgLocals + pre-request, before the main query. */
  preRunner?: (client: PoolClient) => Promise<void>;
  /**
   * Runs in-tx after the main query. TODO(phase 4): used to run the EXPLAIN
   * count-estimate statements (Query.hs resultSetWTotal) in the same tx.
   */
  postRunner?: (client: PoolClient, main: QueryResult) => Promise<T>;
}

export interface RunQueryOutcome<T = void> {
  main: QueryResult;
  extra: T | undefined;
  /** false when the transaction was rolled back (db-tx-end / Prefer: tx=rollback). */
  committed: boolean;
}

/** Plan.hs planTxMode: GET/HEAD (reads, inspect) and read-only RPC run READ ONLY. */
function txReadOnly(method: string, isReadonlyRpc: boolean): boolean {
  return method === "GET" || method === "HEAD" || isReadonlyRpc;
}

/** Query.hs planIsoLvl: function iso level, else the role's, else read committed. */
function txIsolationLevel(opts: RunQueryOptions<unknown>): IsolationLevel {
  return opts.funcIsoLvl ?? opts.config.roleIsolationLvl[opts.authResult.role] ?? "read committed";
}

/**
 * Ports Query.hs setPgLocals as one parameterized `select set_config(...)`.
 * GUC order matches upstream exactly: search_path, role settings (before the
 * impersonated role so `GRANT SET ... TO authenticator` applies — see
 * PostgREST/postgrest#3045), role, request.jwt.claims, request.method,
 * request.path, request.headers, request.cookies, timezone (only with
 * Prefer: timezone=), function settings, app settings.
 */
export function buildSetPgLocals(opts: RunQueryOptions<unknown>): { text: string; values: unknown[] } {
  const { config, authResult, req } = opts;
  const values: unknown[] = [];
  const param = (v: string): string => {
    values.push(v);
    return `$${values.length}`;
  };
  // SqlFragment.hs setConfigWithConstantName / setConfigWithDynamicName
  const constant = (name: string, v: string): string => `set_config('${name}', ${param(v)}, true)`;
  const dynamic = (name: string, v: string): string => `set_config(${param(name)}, ${param(v)}, true)`;

  const schema = opts.schema ?? config.dbSchemas[0];
  const frags: string[] = [];
  frags.push(constant("search_path", escapeIdentList([schema, ...config.dbExtraSearchPath])));
  const roleSettings = opts.roleSettings ?? config.roleSettings[authResult.role] ?? {};
  for (const [k, v] of Object.entries(roleSettings)) frags.push(dynamic(k, v));
  frags.push(constant("role", authResult.role));
  frags.push(constant("request.jwt.claims", JSON.stringify(authResult.claims)));
  frags.push(constant("request.method", req.method));
  frags.push(constant("request.path", req.path));
  frags.push(constant("request.headers", JSON.stringify(req.headers)));
  frags.push(constant("request.cookies", JSON.stringify(req.cookies)));
  if (opts.timezone !== undefined) frags.push(constant("timezone", opts.timezone));
  for (const [k, v] of opts.funcSettings ?? []) frags.push(dynamic(k, v));
  for (const [k, v] of Object.entries(config.appSettings)) frags.push(dynamic(`app.settings.${k}`, v));
  return { text: `select ${frags.join(", ")}`, values };
}

/**
 * Query.hs optionalRollback: Prefer: tx= is only parsed when db-tx-end allows
 * override (Preferences.hs fromHeaders); with a rollback-all db-tx-end only an
 * allowed tx=commit keeps the transaction.
 */
function txRollsBack(config: AppConfig, preferTx: PreferTransaction | undefined): boolean {
  const allowOverride = config.dbTxEnd.endsWith("allow-override");
  const pref = allowOverride ? preferTx : undefined;
  const rollbackAll = config.dbTxEnd.startsWith("rollback");
  return pref === "rollback" || (rollbackAll && pref !== "commit");
}

/** Acquires a pooled client; PGRST003 on db-pool-acquisition-timeout. */
async function acquireClient(pool: Pool, timeoutSeconds: number): Promise<PoolClient> {
  let timer: number | undefined;
  const connecting = pool.connect();
  try {
    return await Promise.race([
      connecting,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(poolAcquisitionTimeout()), timeoutSeconds * 1000);
      }),
    ]);
  } catch (err) {
    // do not leak the client if connect settles after the timeout fired
    connecting.then((c: PoolClient) => c.release()).catch(() => {});
    if (err instanceof PgrstError) throw err;
    throw connectionError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** SQLSTATE-bearing errors → Error.hs PgError mapping; rest → PGRST000. */
function mapQueryError(authed: boolean, err: unknown): PgrstError {
  if (err instanceof PgrstError) return err;
  const code = (err as PgServerError).code;
  if (typeof code === "string" && (code === "PGRST" || /^[0-9A-Z]{5}$/.test(code))) {
    return fromPgError(authed, err as PgServerError);
  }
  return connectionError(err instanceof Error ? err.message : String(err));
}

/** Ports Query.hs runQuery: the whole request lifecycle on one connection. */
export async function runQuery<T = void>(opts: RunQueryOptions<T>): Promise<RunQueryOutcome<T>> {
  const { config, authResult, req } = opts;
  const client = await acquireClient(getPool(), config.dbPoolAcquisitionTimeout);
  let began = false;
  try {
    const mode = txReadOnly(req.method, opts.isReadonlyRpc ?? false) ? "READ ONLY" : "READ WRITE";
    await client.query(`BEGIN ISOLATION LEVEL ${txIsolationLevel(opts).toUpperCase()} ${mode}`);
    began = true;

    const locals = buildSetPgLocals(opts);
    await client.query(locals);

    // Query.hs runPreReq
    if (config.dbPreRequest !== null) {
      await client.query(`select ${fromQi(config.dbPreRequest)}()`);
    }
    if (opts.preRunner) await opts.preRunner(client);

    const main = await client.query({
      text: opts.mainQuery.text,
      values: opts.mainQuery.values ?? [],
      ...(opts.mainQuery.rawTypes ? { types: { getTypeParser: () => (v: string) => v } } : {}),
    });
    const extra = opts.postRunner ? await opts.postRunner(client, main) : undefined;

    const rollsBack = txRollsBack(config, opts.preferTx);
    if (rollsBack) {
      // optionalRollback: force deferred constraints before discarding
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    return { main, extra, committed: !rollsBack };
  } catch (err) {
    if (began) await client.query("ROLLBACK").catch(() => {});
    throw mapQueryError(authResult.authed, err);
  } finally {
    client.release();
  }
}
