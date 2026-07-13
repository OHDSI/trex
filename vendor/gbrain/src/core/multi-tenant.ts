import { isValidSchemaIdent } from './postgres-engine.ts';

// Hyphen-free by design: `name` is interpolated UNQUOTED into `memory_<name>`
// which becomes a Postgres schema identifier (DDL + `SET search_path`). A
// hyphen is not a legal character in an unquoted Postgres identifier, so
// allowing it here would let a request 500 the DB instead of cleanly 404ing
// at the routing layer. Keep in lockstep with the tightened
// `isValidSchemaIdent` regex in postgres-engine.ts.
const NAME_RE = /^[a-z0-9][a-z0-9_]*$/;

/** Match /memory/<name>/<rest...>; returns null for anything else or a bad name. */
export function parseMemoryPath(pathname: string): { name: string; schema: string; rest: string } | null {
  const m = pathname.match(/^\/memory\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  const name = m[1];
  if (!NAME_RE.test(name)) return null;
  const schema = `memory_${name}`;
  if (!isValidSchemaIdent(schema)) return null;
  return { name, schema, rest: m[2] ?? '/' };
}
