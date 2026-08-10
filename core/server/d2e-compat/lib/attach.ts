const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_IDENTIFIER_LEN = 128;
// `${id}__srcdb` must also fit within MAX_IDENTIFIER_LEN; reserve the suffix length.
const SRCDB_SUFFIX = "__srcdb";
const MAX_SOURCE_ID_LEN = MAX_IDENTIFIER_LEN - SRCDB_SUFFIX.length;

export function isValidIdentifier(s: string): boolean {
  return s.length > 0 && s.length <= MAX_IDENTIFIER_LEN && IDENTIFIER_RE.test(s);
}

// Escape a single value for safe inclusion inside a single-quoted SQL string.
function sqlQuote(s: string): string {
  return s.replace(/'/g, "''");
}

// Strip trailing slashes so `${dir}/${id}.db` never doubles up, mirroring how
// config.ts normalizes BASE_PATH. Exported for unit tests (CACHE_DIR itself is
// frozen at import time, so the resolution can only be tested through this).
export function normalizeCacheDir(raw: string | undefined): string {
  // `||` not `??`: Deno.env.get returns "" for a var that is SET BUT EMPTY
  // (`TREX__CACHE_DIR=` in an env_file, or `=${UNSET_VAR}`). With `??` that ""
  // survives and every cache path resolves against the filesystem root.
  const dir = raw || "/usr/src/data/cache";
  return dir.replace(/\/+$/, "") || "/";
}

// NOTE: the other readers of these same .db files still hardcode "./data/cache"
// — plugins/runtime/ext/trex/js/trex_lib.js (#add_duckdb), the embedded trexsql
// WebAPI (trexsql.cache-path), and boot.ts's FHIR default. Under the image's
// WORKDIR /usr/src those resolve to this same directory, so the DEFAULT is
// consistent; overriding this var without moving those too would split the
// cache directory. Keep it equal to the container's cache mount.
export const CACHE_DIR = normalizeCacheDir(Deno.env.get("TREX__CACHE_DIR"));

const SECRET_SQL_KEYS = ["password", "passwd", "secret", "token", "credential", "authorization"];

/**
 * Strip credential values out of a DuckDB/libpq error string before it is
 * returned to a caller or logged. The postgres ATTACH below embeds the
 * decrypted source password in its connection string, and DuckDB echoes the
 * whole DSN back in "Unable to connect to Postgres at ..." errors.
 * Mirrors redactSecrets() in plugins/runtime/ext/trex/js/trex_lib.js, plus the
 * Snowflake PEM/passphrase clauses that use `KEY '...'` rather than `key=...`.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const key of SECRET_SQL_KEYS) {
    out = out.replace(
      new RegExp(`(${key}\\s*[=:]\\s*)('[^']*'|"[^"]*"|[^\\s'",;)]+)`, "gi"),
      "$1[REDACTED]",
    );
  }
  // Snowflake: PRIVATE_KEY '-----BEGIN ...', PRIVATE_KEY_PASSPHRASE 'pp'.
  out = out.replace(/(PRIVATE_KEY(?:_PASSPHRASE)?\s+)('[^']*'|"[^"]*")/gi, "$1[REDACTED]");
  // URI userinfo: scheme://user:secret@host
  return out.replace(/([a-z][a-z0-9+.-]*:\/\/[^:/?#\s]+:)([^@\s]+)(@)/gi, "$1[REDACTED]$3");
}

/**
 * trexdb.database.dialect stores "postgresql" (the schema default, and what
 * POST /trex/db/ writes), but the ensureSourceAttached branches below match
 * "postgres". Without this every postgres source falls through to the
 * unsupported-dialect skip. Mirrors nativeDialect() in dbm-sync.ts and
 * flowDialect() in prefect-sync.ts.
 */
export function normalizeDialect(dialect: string | null | undefined): string {
  const d = (dialect ?? "").trim().toLowerCase();
  return d === "postgresql" ? "postgres" : d;
}

export type ExecFn = (sql: string) => Promise<unknown> | unknown;

export interface AttachOpts {
  cacheDir?: string;
  createDbFileIfMissing?: boolean;
  exec: ExecFn;
}

function fileExists(p: string): boolean {
  try {
    return Deno.statSync(p).isFile;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

export async function ensureCacheAttached(
  cacheId: string,
  opts: AttachOpts,
): Promise<void> {
  if (!isValidIdentifier(cacheId)) {
    throw new Error(`invalid identifier: ${cacheId}`);
  }
  const dir = opts.cacheDir ?? CACHE_DIR;
  const createDbFileIfMissing = opts.createDbFileIfMissing ?? false;
  const filePath = `${dir}/${cacheId}.db`;
  if (!fileExists(filePath)) {
    if (!createDbFileIfMissing) return;
    // DuckDB's ATTACH creates the .db file but NOT its parent directory, so a
    // brand-new cache on a fresh volume fails with "Cannot open file ... No
    // such file or directory". trexsql's db.clj does the same mkdirs.
    // Best-effort: if the dir can't be created the ATTACH below reports why.
    try {
      Deno.mkdirSync(dir, { recursive: true });
    } catch { /* surfaced by the ATTACH */ }
  }
  const attachSql = `ATTACH IF NOT EXISTS '${filePath}' AS ${cacheId}`;
  await opts.exec(attachSql);
}

export interface SourceCredential {
  id: string;
  dialect: "postgres" | "bigquery" | "snowflake" | string;
  host: string;
  port?: number;
  name: string;
  adminUsername: string;
  adminPassword: string;
  // Snowflake key-pair extras (all from the trex.db `extra` jsonb, mirroring how
  // BigQuery stores its long service-account key). adminUsername = Snowflake user;
  // the PEM private key is `privateKey` (NOT adminPassword — a PEM is too long for
  // the RSA-encrypted, 420-char-capped credential store).
  warehouse?: string;
  schema?: string;
  role?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
}

// Pulls Snowflake-specific extras out of a trex.db row's `extra` (jsonb). `extra`
// stores the Internal object's CONTENTS directly — routes persist
// JSON.stringify(body.extra) and prefect-sync reads extra.<field> directly.
export function snowflakeExtrasFromRow(dbExtra: unknown): Pick<
  SourceCredential,
  "warehouse" | "schema" | "role" | "privateKey" | "privateKeyPassphrase"
> {
  // `extra` is a jsonb column. Depending on the pg type parser in this runtime it
  // may arrive already-parsed (object) or as a raw JSON string — normalize both.
  // deno-lint-ignore no-explicit-any
  let extra: any = dbExtra ?? {};
  if (typeof extra === "string") {
    try { extra = JSON.parse(extra || "{}"); } catch { extra = {}; }
  }
  return {
    warehouse: extra.warehouse,
    schema: extra.schema,
    role: extra.role,
    privateKey: extra.privateKey,
    privateKeyPassphrase: extra.privateKeyPassphrase,
  };
}

/**
 * Attach a source database as `<id>__srcdb`. Returns true when an ATTACH was
 * issued, false when the dialect has no source-attach mapping (HANA is queried
 * directly, so it has none) — callers must not report a skip as a success.
 */
export async function ensureSourceAttached(
  c: SourceCredential,
  opts: { exec: ExecFn },
): Promise<boolean> {
  if (!isValidIdentifier(c.id) || c.id.length > MAX_SOURCE_ID_LEN) {
    throw new Error(`invalid identifier: ${c.id}`);
  }
  const alias = `${c.id}${SRCDB_SUFFIX}`;
  const dialect = normalizeDialect(c.dialect);
  if (dialect === "postgres") {
    // Credentials are quote-escaped because they're interpolated inside the
    // single-quoted DuckDB ATTACH connection string. Identifier alias is
    // already validated above.
    const host = sqlQuote(c.host);
    const name = sqlQuote(c.name);
    const user = sqlQuote(c.adminUsername);
    const password = sqlQuote(c.adminPassword);
    const sql =
      `ATTACH IF NOT EXISTS 'host=${host} port=${c.port} dbname=${name} user=${user} password=${password}' AS ${alias} (TYPE postgres)`;
    await opts.exec(sql);
    return true;
  }
  if (dialect === "bigquery") {
    const host = sqlQuote(c.host);
    // An empty/blank dataset attaches the whole project, exposing every dataset
    // as a schema (queryable as `<alias>.<dataset>.<table>`). A specified
    // dataset pins the connection to that single schema (legacy behavior).
    const dataset = c.name?.trim() ?? "";
    const conn = dataset
      ? `project=${host} dataset=${sqlQuote(dataset)}`
      : `project=${host}`;
    const sql =
      `ATTACH IF NOT EXISTS '${conn}' AS ${alias} (TYPE bigquery, READ_ONLY)`;
    await opts.exec(sql);
    return true;
  }
  if (dialect === "snowflake") {
    // Confirmed against iqea-ai/duckdb-snowflake extension docs (community extension):
    // key-pair auth requires AUTH_TYPE 'key_pair' explicitly; PRIVATE_KEY is the PEM
    // key content (not a file path in this usage). ROLE is included as an optional
    // parameter — not explicitly documented but accepted by the extension.
    // The PEM private key comes from `extra` (c.privateKey); adminUsername = Snowflake user.
    if (!c.privateKey) {
      throw new Error(`snowflake key-pair auth requires a private key for ${c.id}`);
    }
    // The community snowflake extension is not autoloaded by DuckDB the way core
    // scanners are, so load it explicitly before CREATE SECRET (TYPE snowflake).
    // Preinstalled in the image (offline LOAD); fall back to a community install.
    try {
      await opts.exec("LOAD snowflake");
    } catch (_e) {
      await opts.exec("INSTALL snowflake FROM community");
      await opts.exec("LOAD snowflake");
    }
    const account = sqlQuote(c.host);
    const user = sqlQuote(c.adminUsername);
    const privateKey = sqlQuote(c.privateKey);
    const secretName = `${alias}_secret`;
    const parts = [
      `TYPE snowflake`,
      `ACCOUNT '${account}'`,
      `USER '${user}'`,
      `AUTH_TYPE 'key_pair'`,
      `PRIVATE_KEY '${privateKey}'`,
    ];
    if (c.privateKeyPassphrase) parts.push(`PRIVATE_KEY_PASSPHRASE '${sqlQuote(c.privateKeyPassphrase)}'`);
    if (c.warehouse) parts.push(`WAREHOUSE '${sqlQuote(c.warehouse)}'`);
    if (c.name) parts.push(`DATABASE '${sqlQuote(c.name)}'`);
    if (c.schema) parts.push(`SCHEMA '${sqlQuote(c.schema)}'`);
    if (c.role) parts.push(`ROLE '${sqlQuote(c.role)}'`);
    await opts.exec(`CREATE OR REPLACE SECRET ${secretName} (${parts.join(", ")})`);
    await opts.exec(
      `ATTACH IF NOT EXISTS '' AS ${alias} (TYPE snowflake, SECRET ${secretName}, READ_ONLY)`,
    );
    return true;
  }
  // No source-attach mapping for this dialect (e.g. HANA, which is queried
  // directly). Report the skip so callers don't claim it was attached.
  return false;
}

export interface EnsureAttachedInput {
  connections?: SourceCredential[];
  cacheIds?: string[];
}

export interface AttachRequest {
  cacheIds: string[];
  connectionIds: string[];
}

// Each id costs a DB round-trip and/or an ATTACH that permanently adds a
// catalog + open file handle to the process-wide DuckDB instance (session
// teardown never DETACHes), so the request must not be unbounded.
export const MAX_ATTACH_IDS = 64;

// Indexed loop rather than .some()/.every(): those skip array holes, which would
// let a sparse array through the type check and blow up as a TypeError inside
// isValidIdentifier instead of a clean validation error.
function parseIds(value: unknown, field: string, maxLen: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const id = value[i];
    if (typeof id !== "string") {
      throw new Error(`${field}[${i}] must be a string`);
    }
    if (!isValidIdentifier(id) || id.length > maxLen) {
      throw new Error(
        `invalid ${field} entry ${JSON.stringify(id)}: must match ` +
          `${IDENTIFIER_RE.source} and be at most ${maxLen} characters`,
      );
    }
    // Duplicates would re-run the same ATTACH; harmless but wasteful.
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function parseAttachBody(body: unknown): AttachRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("request body must be an object");
  }
  const input = body as Record<string, unknown>;
  // hasOwn, not `in`: `in` also walks the prototype chain.
  if (!Object.hasOwn(input, "cacheIds") && !Object.hasOwn(input, "connectionIds")) {
    throw new Error("request body must include cacheIds or connectionIds");
  }
  const rawCache = input.cacheIds;
  const rawConn = input.connectionIds;
  const total = (Array.isArray(rawCache) ? rawCache.length : 0) +
    (Array.isArray(rawConn) ? rawConn.length : 0);
  if (total > MAX_ATTACH_IDS) {
    throw new Error(`too many ids: ${total} (max ${MAX_ATTACH_IDS} per request)`);
  }
  const cacheIds = parseIds(rawCache, "cacheIds", MAX_IDENTIFIER_LEN);
  const connectionIds = parseIds(rawConn, "connectionIds", MAX_SOURCE_ID_LEN);
  // A body of `{}`, `{"cacheIds": null}` or `{"cacheIds": []}` would otherwise
  // attach nothing and still answer 200 — indistinguishable from success for a
  // caller that typo'd the field name and will fail later with
  // "Catalog ... does not exist", far from the cause.
  if (cacheIds.length === 0 && connectionIds.length === 0) {
    throw new Error("cacheIds and connectionIds are both empty");
  }
  return { cacheIds, connectionIds };
}

export async function ensureAttached(
  input: EnsureAttachedInput,
  opts: AttachOpts,
): Promise<void> {
  for (const c of input.connections ?? []) {
    await ensureSourceAttached(c, { exec: opts.exec });
  }
  for (const cid of input.cacheIds ?? []) {
    await ensureCacheAttached(cid, opts);
  }
}
