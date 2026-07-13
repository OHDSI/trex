// Ports the identifier-escaping helpers of src/PostgREST/Query/SqlFragment.hs
// (PostgREST v12.2.3) used by the transaction plumbing and config queries.

import type { QualifiedIdentifier } from "../schema-cache/types.ts";

/** Ports SqlFragment.hs escapeIdent (incl. trimNullChars). */
export function escapeIdent(x: string): string {
  const nul = x.indexOf("\0");
  const trimmed = nul === -1 ? x : x.slice(0, nul);
  return `"${trimmed.replaceAll('"', '""')}"`;
}

/** Ports SqlFragment.hs escapeIdentList — `"schema_1", "schema_2"`. */
export function escapeIdentList(idents: string[]): string {
  return idents.map(escapeIdent).join(", ");
}

/** Ports SqlFragment.hs fromQi — schema-qualified escaped identifier. */
export function fromQi(qi: QualifiedIdentifier): string {
  return (qi.schema === "" ? "" : `${escapeIdent(qi.schema)}.`) + escapeIdent(qi.name);
}
