import { isValidSchemaIdent } from './postgres-engine.ts';

// Hyphen-free by design: `name` is interpolated UNQUOTED into `memory_<name>`
// which becomes a Postgres schema identifier (DDL + `SET search_path`). A
// hyphen is not a legal character in an unquoted Postgres identifier, so
// allowing it here would let a request 500 the DB instead of cleanly 404ing
// at the routing layer. Keep in lockstep with the tightened
// `isValidSchemaIdent` regex in postgres-engine.ts.
const NAME_RE = /^[a-z0-9][a-z0-9_]*$/;

/**
 * Match /memory/<name>/<rest...>; returns null for anything else or a bad name.
 *
 * `allowlist`, when provided, gates provisioning/routing to a FINITE,
 * operator-declared set of memory names (design §8): trex passes the
 * tpm-installed plugins' declared memory names via `GBRAIN_MEMORY_ALLOWLIST`
 * at spawn. Any name not in the allow-list returns null here — same as a
 * malformed name — so the route falls through to the standard 404, and no
 * arbitrary caller-supplied name can trigger schema auto-provisioning.
 * Omitting `allowlist` preserves the pre-allowlist behavior (back-compat for
 * callers/tests that don't gate).
 */
export function parseMemoryPath(
  pathname: string,
  allowlist?: Set<string>,
): { name: string; schema: string; rest: string } | null {
  const m = pathname.match(/^\/memory\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  const name = m[1];
  if (!NAME_RE.test(name)) return null;
  if (allowlist && !allowlist.has(name)) return null;
  const schema = `memory_${name}`;
  if (!isValidSchemaIdent(schema)) return null;
  return { name, schema, rest: m[2] ?? '/' };
}
