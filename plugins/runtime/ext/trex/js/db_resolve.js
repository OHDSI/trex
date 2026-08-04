/**
 * Alias resolution for DatabaseManager.getConnection().
 *
 * Kept free of `ext:` imports so it is unit-testable under plain `deno test`
 * (trex_lib.js pulls in ext:core/mod.js and cannot be imported outside the
 * runtime).
 *
 * A getConnection() alias is not always a credentialed database id. It can be:
 *   - a credentialed db_id     -> dialect + publication come from the row;
 *   - `cdw_config_svc`         -> the built-in duckdb file database;
 *   - a dataset cache_id       -> attached as `ATTACH '<dir>/<id>.db' AS <id>`
 *                                 (core/server/d2e-compat/lib/attach.ts), so
 *                                 the alias IS the duckdb catalog name.
 * Only the first has a row in dbcredentials, so absence of a row is normal and
 * must resolve rather than throw.
 */

export const CDW_DUCKDB_FILE_DATABASE_CODE = "cdw_config_svc";

function findCredential(credentials, dbId) {
  if (!Array.isArray(credentials)) return undefined;
  return credentials.find((c) => c && c.id === dbId);
}

/** Dialect for `dbId`, defaulting to duckdb for any alias without a credential row. */
export function resolveDialect(credentials, dbId) {
  if (dbId === CDW_DUCKDB_FILE_DATABASE_CODE) return "duckdb";
  return findCredential(credentials, dbId)?.dialect ?? "duckdb";
}

/**
 * Catalog name to query: `<db_id>_<publication>` for a credentialed database
 * that declares one, else `dbId` unchanged, which is what a cache_id needs.
 */
export function resolveFirstPublication(credentials, dbId) {
  const publication = findCredential(credentials, dbId)?.publications?.[0]?.publication;
  return publication ? `${dbId}_${publication}` : `${dbId}`;
}
