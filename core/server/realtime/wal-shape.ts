// Pure transforms from pg-logical-replication's pgoutput messages into a
// wal2json-shaped change record. No DB / no side effects — unit-tested with
// fixtures and importable without DATABASE_URL.
//
// pgoutput message shapes (from the installed pg-logical-replication typings):
//   MessageInsert  { tag:"insert";  relation; new }
//   MessageUpdate  { tag:"update";  relation; key|null; old|null; new }
//   MessageDelete  { tag:"delete";  relation; key|null; old|null }
//   MessageTruncate{ tag:"truncate"; relations: MessageRelation[] }
//   MessageRelation{ schema; name; columns: RelationColumn[]; keyColumns }
//   RelationColumn { name; flags; typeOid; typeMod; typeSchema; typeName; parser }
// begin/commit/relation/message/origin/type are not per-row DML → null.

export interface Wal2JsonChange {
  action: "I" | "U" | "D" | "T";
  schema: string;
  table: string;
  columns?: { name: string; type: string; value: unknown }[];
  identity?: { name: string; type: string; value: unknown }[];
  // Primary-key columns (names + types, no values). REQUIRED by downstream
  // realtime.apply_rls: without `pk` it returns Error 400 "no primary key" and
  // emits an empty record. Empty [] when the table has no usable PK/replica
  // identity — apply_rls then legitimately reports no primary key.
  pk?: { name: string; type: string }[];
}

// Minimal structural shapes we depend on (kept local so this stays pure /
// import-free). The real messages carry more fields; we only read these.
interface Column {
  name: string;
  typeOid: number;
  typeName: string | null;
}
interface Relation {
  schema: string;
  name: string;
  columns: Column[];
  keyColumns: string[];
}

// Resolves a Postgres type name for a column. Default uses the parser-populated
// `typeName`; replication.ts can pass an oid→name Map lookup instead if the live
// stream leaves typeName null under protoVersion 1.
export type TypeResolver = (col: Column) => string;

const defaultResolver: TypeResolver = (col) => col.typeName ?? "text";

const ACTIONS: Record<string, Wal2JsonChange["action"]> = {
  insert: "I",
  update: "U",
  delete: "D",
};

function tuple(
  relation: Relation,
  row: Record<string, unknown>,
  resolve: TypeResolver,
): { name: string; type: string; value: unknown }[] {
  return relation.columns.map((col) => ({
    name: col.name,
    type: resolve(col),
    // undefined (column absent from a partial key/old tuple) normalizes to null
    value: col.name in row ? row[col.name] : null,
  }));
}

// Primary-key columns as {name, type} (no values), taken from the relation's
// keyColumns. Skips any keyColumn missing from columns (defensive; shouldn't
// happen). Empty when keyColumns is empty — we never fabricate a PK.
function pkColumns(
  relation: Relation,
  resolve: TypeResolver,
): { name: string; type: string }[] {
  return relation.keyColumns
    .map((name) => relation.columns.find((c) => c.name === name))
    .filter((c): c is Column => c !== undefined)
    .map((c) => ({ name: c.name, type: resolve(c) }));
}

// deno-lint-ignore no-explicit-any
export function shapeChange(log: any, resolve: TypeResolver = defaultResolver): Wal2JsonChange | null {
  const action = ACTIONS[log.tag as string];
  if (!action) return null; // begin/commit/relation/truncate/message/origin/type

  const rel = log.relation as Relation;
  const out: Wal2JsonChange = { action, schema: rel.schema, table: rel.name };

  // insert/update carry the full new tuple as columns.
  if (log.new) out.columns = tuple(rel, log.new, resolve);

  // update/delete identity: old is present only under REPLICA IDENTITY FULL;
  // otherwise key holds the PK columns (default replica identity).
  const identityRow = log.old ?? log.key;
  if (identityRow) out.identity = tuple(rel, identityRow, resolve);

  // pk (names + types, no values) — required by realtime.apply_rls on every
  // I/U/D. Resolved via the same type source as columns. Empty [] when the table
  // has no usable PK/replica identity; apply_rls then reports "no primary key".
  out.pk = pkColumns(rel, resolve);

  return out;
}

// Truncate carries relations[]; emit one Wal2JsonChange per truncated relation.
// deno-lint-ignore no-explicit-any
export function shapeTruncates(log: any): Wal2JsonChange[] {
  if (log.tag !== "truncate") return [];
  return (log.relations ?? []).map((rel: Relation) => ({
    action: "T" as const,
    schema: rel.schema,
    table: rel.name,
  }));
}

// commitTime is BigInt microseconds since the UNIX epoch. pg-logical-replication
// v2.5.0's binary-reader readTime() already shifts pgoutput's native
// Postgres-epoch (2000-01-01) value by +946684800000000 µs before we see it, so
// msg.commitTime is Unix-epoch µs — divide by 1000 to ms, no further offset.
export function commitTimeToIso(commitTime: bigint): string {
  return new Date(Number(commitTime / 1000n)).toISOString();
}
