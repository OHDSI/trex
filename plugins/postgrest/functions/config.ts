// Ports src/PostgREST/Config.hs, Config/JSPath.hs and Config/Database.hs
// (PostgREST v12.2.3) for the config keys the plugin uses, plus the trex
// Studio settings layer (trexdb.setting).
//
// Precedence (lowest to highest): built-in defaults < PGRST_* env vars <
// trexdb.setting postgrest.* rows < in-db pgrst.* role settings. The last
// layer matches PostgREST's documented rule that in-db config overrides
// everything; trexdb.setting slots between env and pgrst.* as a trex-specific
// extension.

import type { Pool } from "pg";
import { getPool } from "./db.ts";
import { DEFAULT_HOISTED_TX_SETTINGS, type QualifiedIdentifier, toQi } from "./schema-cache/index.ts";
import { fromQi } from "./query/fragments.ts";

// ---------------------------------------------------------------------------
// JSPath — ports Config/JSPath.hs
// ---------------------------------------------------------------------------

/** JSPath expression, e.g. .property, [0] — Config/JSPath.hs JSPathExp. */
export type JSPathExp = { kind: "key"; key: string } | { kind: "idx"; idx: number };

/** Full jspath, e.g. .property[0].attr.detail */
export type JSPath = JSPathExp[];

const KEY_CHAR = /[\p{L}\p{N}_$@]/u; // Parsec alphaNum <|> oneOf "_$@"

/**
 * Ports Config/JSPath.hs pRoleClaimKey / pJSPath: a leading period, then
 * period-separated segments of a key (bare word or double-quoted) with an
 * optional [idx]. Throws on parse failure like the Haskell parser fails.
 */
export function parseRoleClaimKey(input: string): JSPath {
  const fail = (detail: string): never => {
    throw new Error(`failed to parse role-claim-key value (${input}): ${detail}`);
  };
  let i = 0;
  const out: JSPath = [];
  if (input[i] !== ".") fail("expecting period (.)");
  i++;
  if (i >= input.length) return out; // "." parses as the empty path (sepBy zero)
  for (;;) {
    // pJSPKey: quoted value or 1+ of [alphanumeric _$@]
    let key = "";
    if (input[i] === '"') {
      i++;
      while (i < input.length && input[i] !== '"') key += input[i++];
      if (input[i] !== '"') fail("unterminated quoted attribute name");
      i++;
    } else {
      while (i < input.length && KEY_CHAR.test(input[i])) key += input[i++];
      if (key === "") fail("expecting attribute name [a..z0..9_$@]");
    }
    out.push({ kind: "key", key });
    // optional pJSPIdx: [0..n]
    if (input[i] === "[") {
      i++;
      let digits = "";
      while (i < input.length && input[i] >= "0" && input[i] <= "9") digits += input[i++];
      if (digits === "" || input[i] !== "]") fail("expecting array index [0..n]");
      i++;
      out.push({ kind: "idx", idx: Number.parseInt(digits, 10) });
    }
    if (i >= input.length) return out;
    if (input[i] !== ".") fail("expecting period (.)");
    i++;
  }
}

// ---------------------------------------------------------------------------
// AppConfig — ports Config.hs AppConfig (plugin-relevant fields)
// ---------------------------------------------------------------------------

export type DbTxEnd = "commit" | "commit-allow-override" | "rollback" | "rollback-allow-override";
export type OpenApiMode = "follow-privileges" | "ignore-privileges" | "disabled";
export type IsolationLevel = "read committed" | "repeatable read" | "serializable";

/** Config/Database.hs RoleSettings: role → (setting → value). */
export type RoleSettings = Record<string, Record<string, string>>;
/** Config/Database.hs RoleIsolationLvl. */
export type RoleIsolationLvl = Record<string, IsolationLevel>;

export interface AppConfig {
  /** Keys are the PGRST_APP_SETTINGS_* suffixes; GUC name is `app.settings.<key>`. */
  appSettings: Record<string, string>;
  dbAggregatesEnabled: boolean;
  dbAnonRole: string | null;
  dbChannel: string;
  dbChannelEnabled: boolean;
  dbConfig: boolean;
  dbExtraSearchPath: string[];
  dbHoistedTxSettings: string[];
  dbMaxRows: number | null;
  dbPlanEnabled: boolean;
  dbPool: number;
  /** Seconds; db-pool-acquisition-timeout. */
  dbPoolAcquisitionTimeout: number;
  dbPreConfig: QualifiedIdentifier | null;
  dbPreRequest: QualifiedIdentifier | null;
  /** Parsed for parity; node-postgres has no session prepared-statement mode. */
  dbPreparedStatements: boolean;
  /** db-root-spec: a function whose result replaces the OpenAPI root. */
  dbRootSpec: QualifiedIdentifier | null;
  /** Non-empty; the first schema is the default one. */
  dbSchemas: string[];
  dbTxEnd: DbTxEnd;
  jwtAud: string | null;
  jwtRoleClaimKey: JSPath;
  /** Raw configured value; base64 decoding happens in auth/jwt.ts parseSecret. */
  jwtSecret: string | null;
  jwtSecretIsBase64: boolean;
  openApiMode: OpenApiMode;
  openApiSecurityActive: boolean;
  openApiServerProxyUri: string | null;
  /** server-cors-allowed-origins: null allows any origin (wai-cors corsOrigins Nothing). */
  serverCorsAllowedOrigins: string[] | null;
  /** server-host/server-port only feed the OpenAPI host here (the plugin does not listen itself). */
  serverHost: string;
  serverPort: number;
  serverTimingEnabled: boolean;
  roleSettings: RoleSettings;
  roleIsolationLvl: RoleIsolationLvl;
}

// ---------------------------------------------------------------------------
// Value coercions — port Config.hs coerceText/coerceInt/coerceBool/splitOnCommas
// ---------------------------------------------------------------------------

/** Config.hs coerceBool: true/false in any case, or an integer (>0 is true). */
function coerceBool(s: string): boolean | undefined {
  const alpha = s.replace(/[^\p{L}]/gu, "").toLowerCase();
  if (alpha === "true") return true;
  if (alpha === "false") return false;
  if (/^-?\d+$/.test(s.trim())) return Number.parseInt(s.trim(), 10) > 0;
  return undefined;
}

/** Config.hs coerceInt via readMaybe: strict decimal integer. */
function coerceInt(s: string): number | undefined {
  return /^-?\d+$/.test(s.trim()) ? Number.parseInt(s.trim(), 10) : undefined;
}

/** Config.hs splitOnCommas: comma-separated, whitespace-stripped. */
function splitOnCommas(s: string): string[] {
  return s.split(",").map((t) => t.trim());
}

// ---------------------------------------------------------------------------
// Layered resolution — ports Config.hs overrideFromDbOrEnvironment
// ---------------------------------------------------------------------------

export interface ConfigSources {
  /** PGRST_* environment variables (verbatim names). */
  env: Record<string, string>;
  /** trexdb.setting values keyed by dashed config key (see trexSettingsToSource). */
  trex?: Record<string, string>;
  /** In-db pgrst.* settings keyed by underscore name without prefix (e.g. "db_max_rows"). */
  db?: Record<string, string>;
}

function lookupKey(sources: ConfigSources, key: string): string | undefined {
  const underscore = key.replaceAll("-", "_");
  return sources.db?.[underscore] ?? sources.trex?.[key] ?? sources.env[`PGRST_${underscore.toUpperCase()}`];
}

/** Builds the effective AppConfig from layered sources; throws on invalid values. */
export function resolveConfig(sources: ConfigSources): AppConfig {
  // Config.hs optWithAlias: the primary key's whole chain wins over the alias's.
  const raw = (key: string, alias?: string): string | undefined => {
    const v = lookupKey(sources, key);
    return v !== undefined ? v : alias !== undefined ? lookupKey(sources, alias) : undefined;
  };
  // optString filters empty strings out (unset ${VAR} templates expand to "").
  const str = (key: string, alias?: string): string | undefined => {
    const v = raw(key, alias);
    return v === "" ? undefined : v;
  };
  const bool = (key: string, def: boolean, alias?: string): boolean => {
    const v = raw(key, alias);
    const b = v === undefined ? undefined : coerceBool(v);
    return b ?? def;
  };
  const int = (key: string, alias?: string): number | undefined => {
    const v = raw(key, alias);
    return v === undefined ? undefined : coerceInt(v);
  };
  const list = (key: string, def: string[], alias?: string): string[] => {
    const v = raw(key, alias);
    return v === undefined ? def : splitOnCommas(v);
  };
  const enumStr = <T extends string>(key: string, def: T, allowed: readonly T[], what: string): T => {
    const v = str(key);
    if (v === undefined) return def;
    if ((allowed as readonly string[]).includes(v)) return v as T;
    throw new Error(`Invalid ${what}. Check your configuration.`);
  };

  const appSettings: Record<string, string> = {};
  for (const [k, v] of Object.entries(sources.env)) {
    if (k.startsWith("PGRST_APP_SETTINGS_")) appSettings[k.slice("PGRST_APP_SETTINGS_".length)] = v;
  }

  const preRequest = str("db-pre-request", "pre-request");
  const preConfig = str("db-pre-config");
  const rootSpec = str("db-root-spec", "root-spec");
  const roleClaimKey = str("jwt-role-claim-key", "role-claim-key");

  return {
    appSettings,
    dbAggregatesEnabled: bool("db-aggregates-enabled", false),
    dbAnonRole: str("db-anon-role") ?? null,
    dbChannel: str("db-channel") ?? "pgrst",
    dbChannelEnabled: bool("db-channel-enabled", true),
    dbConfig: bool("db-config", true),
    dbExtraSearchPath: list("db-extra-search-path", ["public"]),
    dbHoistedTxSettings: list("db-hoisted-tx-settings", DEFAULT_HOISTED_TX_SETTINGS),
    dbMaxRows: int("db-max-rows", "max-rows") ?? null,
    dbPlanEnabled: bool("db-plan-enabled", false),
    dbPool: int("db-pool") ?? 10,
    dbPoolAcquisitionTimeout: int("db-pool-acquisition-timeout") ?? 10,
    dbPreConfig: preConfig !== undefined ? toQi(preConfig) : null,
    dbPreRequest: preRequest !== undefined ? toQi(preRequest) : null,
    dbPreparedStatements: bool("db-prepared-statements", true),
    dbRootSpec: rootSpec !== undefined ? toQi(rootSpec) : null,
    dbSchemas: list("db-schemas", ["public"], "db-schema"),
    dbTxEnd: enumStr(
      "db-tx-end",
      "commit",
      ["commit", "commit-allow-override", "rollback", "rollback-allow-override"] as const,
      "transaction termination",
    ),
    jwtAud: str("jwt-aud") ?? null,
    jwtRoleClaimKey: roleClaimKey !== undefined ? parseRoleClaimKey(roleClaimKey) : [{ kind: "key", key: "role" }],
    jwtSecret: str("jwt-secret") ?? null,
    jwtSecretIsBase64: bool("jwt-secret-is-base64", false, "secret-is-base64"),
    openApiMode: enumStr(
      "openapi-mode",
      "follow-privileges",
      ["follow-privileges", "ignore-privileges", "disabled"] as const,
      "openapi-mode",
    ),
    openApiSecurityActive: bool("openapi-security-active", false),
    openApiServerProxyUri: str("openapi-server-proxy-uri") ?? null,
    // Config.hs parseCORSAllowedOrigins: unset -> Nothing (any origin);
    // otherwise split on commas and strip whitespace.
    serverCorsAllowedOrigins: (() => {
      const orig = str("server-cors-allowed-origins");
      return orig === undefined ? null : orig.split(",").map((s) => s.trim());
    })(),
    serverHost: str("server-host") ?? "!4",
    serverPort: int("server-port") ?? 3000,
    serverTimingEnabled: bool("server-timing-enabled", false),
    roleSettings: {},
    roleIsolationLvl: {},
  };
}

/** Ports Config.hs readPGRSTEnvironment: only PGRST_-prefixed vars. */
export function pgrstEnvironment(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(Deno.env.toObject())) {
    if (k.startsWith("PGRST_")) out[k] = v;
  }
  return out;
}

/** Parses the config from PGRST_* env vars only (no in-db layers). */
export function readEnvConfig(env: Record<string, string> = pgrstEnvironment()): AppConfig {
  return resolveConfig({ env });
}

// ---------------------------------------------------------------------------
// In-db config — ports Config/Database.hs
// ---------------------------------------------------------------------------

// Config/Database.hs dbSettingsNames (queried verbatim; only the ones present
// in AppConfig get applied by resolveConfig).
const DB_SETTINGS_NAMES = [
  "db_aggregates_enabled",
  "db_anon_role",
  "db_pre_config",
  "db_extra_search_path",
  "db_max_rows",
  "db_plan_enabled",
  "db_pre_request",
  "db_prepared_statements",
  "db_root_spec",
  "db_schemas",
  "db_tx_end",
  "db_hoisted_tx_settings",
  "jwt_aud",
  "jwt_role_claim_key",
  "jwt_secret",
  "jwt_secret_is_base64",
  "jwt_cache_max_lifetime",
  "openapi_mode",
  "openapi_security_active",
  "openapi_server_proxy_uri",
  "server_cors_allowed_origins",
  "server_trace_header",
  "server_timing_enabled",
].map((n) => `pgrst.${n}`);

/**
 * Ports Config/Database.hs queryDbSettings: pgrst.* settings of the connected
 * role (role-in-database beats role-only beats pre-config function values).
 * Returns a ConfigSources.db record.
 */
export async function queryDbSettings(pool: Pool, preConfig: QualifiedIdentifier | null): Promise<Record<string, string>> {
  const preConfigF = preConfig === null ? "" : `
        UNION
        SELECT
          null as database,
          x as k,
          current_setting(x, true) as v
        FROM unnest($1) x
        JOIN ${fromQi(preConfig)}() _ ON TRUE`;
  const sql = `
      WITH
      role_setting AS (
        SELECT setdatabase as database,
               unnest(setconfig) as setting
        FROM pg_catalog.pg_db_role_setting
        WHERE setrole = CURRENT_USER::regrole::oid
          AND setdatabase IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = CURRENT_CATALOG))
      ),
      kv_settings AS (
        SELECT database,
               substr(setting, 1, strpos(setting, '=') - 1) as k,
               substr(setting, strpos(setting, '=') + 1) as v
        FROM role_setting
        ${preConfigF}
      )
      SELECT DISTINCT ON (key)
             replace(k, 'pgrst.', '') AS key,
             v AS value
      FROM kv_settings
      WHERE k = ANY($1) AND v IS NOT NULL
      ORDER BY key, database DESC NULLS LAST`;
  const res = await pool.query(sql, [DB_SETTINGS_NAMES]);
  const out: Record<string, string> = {};
  for (const row of res.rows as { key: string; value: string }[]) out[row.key] = row.value;
  return out;
}

/**
 * Ports Config/Database.hs queryRoleSettings: rolconfig of roles the
 * connected user is a member of, restricted to user-settable parameters —
 * these are the per-role settings Query.hs setPgLocals applies on
 * impersonation (values are lowercased by the query, as upstream).
 */
export async function queryRoleSettings(pool: Pool): Promise<{ roleSettings: RoleSettings; roleIsolationLvl: RoleIsolationLvl }> {
  const verRes = await pool.query("select current_setting('server_version_num')::int as v");
  const pgVer = (verRes.rows[0] as { v: number }).v;
  const privFilter = pgVer >= 150000
    ? "and (ps.context = 'user' or has_parameter_privilege(current_user::regrole::oid, ps.name, 'set')) "
    : "and ps.context = 'user' ";
  const sql = `
      with
      role_setting as (
        select r.rolname, unnest(r.rolconfig) as setting
        from pg_auth_members m
        join pg_roles r on r.oid = m.roleid
        where member = current_user::regrole::oid
      ),
      kv_settings AS (
        SELECT
          rolname,
          substr(setting, 1, strpos(setting, '=') - 1) as key,
          lower(substr(setting, strpos(setting, '=') + 1)) as value
        FROM role_setting
      ),
      iso_setting AS (
        SELECT rolname, value
        FROM kv_settings
        WHERE key = 'default_transaction_isolation'
      )
      select
        kv.rolname,
        i.value as iso_lvl,
        coalesce(json_agg(json_build_array(kv.key, kv.value)) filter (where key <> 'default_transaction_isolation'), '[]') as role_settings
      from kv_settings kv
      join pg_settings ps on ps.name = kv.key ${privFilter}
      left join iso_setting i on i.rolname = kv.rolname
      group by kv.rolname, i.value`;
  const res = await pool.query(sql);
  const roleSettings: RoleSettings = {};
  const roleIsolationLvl: RoleIsolationLvl = {};
  for (const row of res.rows as { rolname: string; iso_lvl: string | null; role_settings: [string, string][] }[]) {
    const settings: Record<string, string> = {};
    for (const [k, v] of row.role_settings) settings[k] = v;
    roleSettings[row.rolname] = settings;
    if (row.iso_lvl !== null) roleIsolationLvl[row.rolname] = toIsolationLevel(row.iso_lvl);
  }
  return { roleSettings, roleIsolationLvl };
}

/** Config/Database.hs toIsolationLevel (unknown values → read committed). */
export function toIsolationLevel(value: string): IsolationLevel {
  return value === "repeatable read" || value === "serializable" ? value : "read committed";
}

// ---------------------------------------------------------------------------
// trex Studio settings (trexdb.setting) — trex-specific config layer
// ---------------------------------------------------------------------------

const TREX_SETTING_KEYS: Record<string, string> = {
  "postgrest.maxRows": "db-max-rows",
  "postgrest.dbSchema": "db-schemas",
  "postgrest.dbExtraSearchPath": "db-extra-search-path",
  "postgrest.dbPool": "db-pool",
};

/** Maps trexdb.setting rows to a ConfigSources.trex record (dashed keys). */
export function trexSettingsToSource(rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = TREX_SETTING_KEYS[row.key];
    if (key !== undefined) out[key] = row.value;
  }
  return out;
}

/** Reads trexdb.setting; tolerates the table/schema not existing. */
export async function queryTrexSettings(pool: Pool): Promise<Record<string, string>> {
  try {
    const res = await pool.query("select key, value from trexdb.setting where key like 'postgrest.%'");
    return trexSettingsToSource(res.rows as { key: string; value: string }[]);
  } catch (err) {
    // 42P01 undefined_table / 3F000 invalid_schema_name: not a trex Studio db
    const code = (err as { code?: string }).code;
    if (code === "42P01" || code === "3F000") return {};
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Effective config: env + in-db layers + role settings
// ---------------------------------------------------------------------------

/**
 * Loads the in-db layers and resolves the effective config:
 * defaults < env < trexdb.setting < pgrst.* db settings. Role settings /
 * isolation levels are loaded regardless of db-config (Query.hs needs them
 * for every impersonated role), like PostgREST's connection worker does.
 */
export async function loadDbConfig(pool: Pool, env: Record<string, string> = pgrstEnvironment()): Promise<AppConfig> {
  const envConfig = resolveConfig({ env });
  const trex = await queryTrexSettings(pool);
  const db = envConfig.dbConfig ? await queryDbSettings(pool, envConfig.dbPreConfig) : {};
  const { roleSettings, roleIsolationLvl } = await queryRoleSettings(pool);
  const config = resolveConfig({ env, trex, db });
  config.roleSettings = roleSettings;
  config.roleIsolationLvl = roleIsolationLvl;
  return config;
}

let configPromise: Promise<AppConfig> | null = null;

async function loadEffectiveConfig(): Promise<AppConfig> {
  const envConfig = readEnvConfig();
  try {
    return await loadDbConfig(getPool());
  } catch (err) {
    console.error("[postgrest] in-db config load failed; using env config:", err);
    return envConfig;
  }
}

/** Lazy effective-config singleton. Env parse errors reject the promise. */
export function getConfig(): Promise<AppConfig> {
  if (!configPromise) configPromise = loadEffectiveConfig();
  return configPromise;
}

/** Listener "reload config" hook: the next getConfig() re-reads everything. */
export function reloadConfig(): void {
  configPromise = null;
}

/** Test hook. */
export function resetConfigForTests(): void {
  configPromise = null;
}
