// pg Pool factory for the PostgREST plugin.
//
// The SSL helpers below are copied from core/server/lib/db-ssl.ts — plugins
// must not import from core/server, so we duplicate the small policy here:
// when sslmode=require/prefer/verify-* is in the connection string, verify
// the server certificate; DB_TLS_INSECURE=1 opts into rejectUnauthorized:
// false and DB_TLS_CA_PATH supplies a custom CA bundle.

import { Pool } from "pg";

export interface SslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

let cachedCa: string | undefined;
let cachedCaLoaded = false;

function loadCa(): string | undefined {
  if (cachedCaLoaded) return cachedCa;
  cachedCaLoaded = true;
  const caPath = Deno.env.get("DB_TLS_CA_PATH");
  if (!caPath) return undefined;
  try {
    cachedCa = Deno.readTextFileSync(caPath);
  } catch (err) {
    console.warn(`[postgrest] DB_TLS_CA_PATH=${caPath} could not be read:`, err);
    cachedCa = undefined;
  }
  return cachedCa;
}

function isTruthy(val: string | undefined): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function needsSsl(connectionString: string): boolean {
  return (
    connectionString.includes("sslmode=require") ||
    connectionString.includes("sslmode=prefer") ||
    connectionString.includes("sslmode=verify-ca") ||
    connectionString.includes("sslmode=verify-full")
  );
}

/** Builds the {ssl: ...} fragment for a pg Pool/Client config; {} when no SSL is needed. */
export function poolSsl(connectionString: string | undefined): { ssl?: SslOptions } {
  if (!connectionString || !needsSsl(connectionString)) return {};
  const opts: SslOptions = { rejectUnauthorized: !isTruthy(Deno.env.get("DB_TLS_INSECURE")) };
  const ca = loadCa();
  if (ca) opts.ca = ca;
  return { ssl: opts };
}

export function createPool(connectionString: string, max: number): Pool {
  return new Pool({ connectionString, max, ...poolSsl(connectionString) });
}

let pool: Pool | null = null;

/** Lazy singleton Pool from PGRST_DB_URI, sized by PGRST_DB_POOL (default 10). */
export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = Deno.env.get("PGRST_DB_URI");
  if (!connectionString) {
    throw new Error("PGRST_DB_URI environment variable is required");
  }
  const max = Number.parseInt(Deno.env.get("PGRST_DB_POOL") ?? "10", 10);
  pool = createPool(connectionString, Number.isNaN(max) ? 10 : max);
  return pool;
}

/** Test hook: drains and clears the singleton pool. */
export async function closePoolForTests(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
