import { assertEquals } from "jsr:@std/assert";
import { commitTimeToIso, shapeChange, shapeTruncates } from "./wal-shape.ts";

// Fixtures mirror the EXACT pg-logical-replication pgoutput message shapes
// (from node_modules/.../pgoutput.types.d.ts): MessageRelation.columns are
// RelationColumn{name, flags, typeOid, typeMod, typeSchema, typeName, parser}.
// We include typeName so the default resolver (col.typeName) works.
const relation = {
  tag: "relation",
  relationOid: 16400,
  schema: "public",
  name: "todos",
  replicaIdentity: "default",
  columns: [
    { name: "id", flags: 1, typeOid: 23, typeMod: -1, typeSchema: null, typeName: "int4", parser: (x: unknown) => x },
    { name: "title", flags: 0, typeOid: 25, typeMod: -1, typeSchema: null, typeName: "text", parser: (x: unknown) => x },
  ],
  keyColumns: ["id"],
} as any;

// Default resolver: use col.typeName directly (populated by the pgoutput parser).
const resolve = (col: any) => (col.typeName as string | null) ?? "text";

Deno.test("shapes insert", () => {
  const c = shapeChange({ tag: "insert", relation, new: { id: 1, title: "a" } } as any, resolve)!;
  assertEquals(c, {
    action: "I",
    schema: "public",
    table: "todos",
    columns: [
      { name: "id", type: "int4", value: 1 },
      { name: "title", type: "text", value: "a" },
    ],
    pk: [{ name: "id", type: "int4" }],
  });
});

Deno.test("shapes update with identity from old (REPLICA IDENTITY FULL)", () => {
  const c = shapeChange(
    { tag: "update", relation, key: null, old: { id: 1, title: "a" }, new: { id: 1, title: "b" } } as any,
    resolve,
  )!;
  assertEquals(c.action, "U");
  assertEquals(c.columns, [
    { name: "id", type: "int4", value: 1 },
    { name: "title", type: "text", value: "b" },
  ]);
  assertEquals(c.identity, [
    { name: "id", type: "int4", value: 1 },
    { name: "title", type: "text", value: "a" },
  ]);
  assertEquals(c.pk, [{ name: "id", type: "int4" }]);
});

Deno.test("shapes update with identity from key (default replica identity)", () => {
  const c = shapeChange(
    { tag: "update", relation, key: { id: 1, title: null }, old: null, new: { id: 1, title: "b" } } as any,
    resolve,
  )!;
  assertEquals(c.action, "U");
  // identity comes from key when old is null; missing values normalize to null
  assertEquals(c.identity, [
    { name: "id", type: "int4", value: 1 },
    { name: "title", type: "text", value: null },
  ]);
});

Deno.test("shapes delete (identity only, no columns)", () => {
  const c = shapeChange({ tag: "delete", relation, key: { id: 1, title: null }, old: null } as any, resolve)!;
  assertEquals(c.action, "D");
  assertEquals(c.columns, undefined);
  assertEquals(c.identity, [
    { name: "id", type: "int4", value: 1 },
    { name: "title", type: "text", value: null },
  ]);
  assertEquals(c.pk, [{ name: "id", type: "int4" }]);
});

Deno.test("pk is [] when the relation has no key columns (no PK)", () => {
  const relNoPk = { ...relation, keyColumns: [] } as any;
  const c = shapeChange({ tag: "insert", relation: relNoPk, new: { id: 1, title: "a" } } as any, resolve)!;
  assertEquals(c.pk, []);
});

Deno.test("ignores begin/commit/relation/message/origin/type tags", () => {
  assertEquals(shapeChange({ tag: "begin" } as any, resolve), null);
  assertEquals(shapeChange({ tag: "commit" } as any, resolve), null);
  assertEquals(shapeChange({ tag: "relation" } as any, resolve), null);
  assertEquals(shapeChange({ tag: "message" } as any, resolve), null);
  assertEquals(shapeChange({ tag: "origin" } as any, resolve), null);
  assertEquals(shapeChange({ tag: "type" } as any, resolve), null);
  // truncate is not a per-row DML change; shapeChange returns null (use shapeTruncates)
  assertEquals(shapeChange({ tag: "truncate" } as any, resolve), null);
});

Deno.test("resolver falls back to 'text' for null typeName", () => {
  const relNoType = {
    ...relation,
    columns: [{ name: "id", flags: 1, typeOid: 23, typeName: null, parser: (x: unknown) => x }],
  } as any;
  const c = shapeChange({ tag: "insert", relation: relNoType, new: { id: 7 } } as any, resolve)!;
  assertEquals(c.columns, [{ name: "id", type: "text", value: 7 }]);
});

Deno.test("shapeTruncates emits one T change per truncated relation", () => {
  const rel2 = { ...relation, schema: "public", name: "notes" } as any;
  const changes = shapeTruncates(
    { tag: "truncate", cascade: false, restartIdentity: false, relations: [relation, rel2] } as any,
  );
  assertEquals(changes, [
    { action: "T", schema: "public", table: "todos" },
    { action: "T", schema: "public", table: "notes" },
  ]);
});

Deno.test("shapeTruncates returns [] for non-truncate tags", () => {
  assertEquals(shapeTruncates({ tag: "insert" } as any), []);
});

Deno.test("commitTimeToIso converts Unix-epoch microseconds to ISO", () => {
  // pg-logical-replication's readTime() already returns Unix-epoch microseconds,
  // so the input is unix_ms * 1000 (no Postgres-epoch offset).
  // 2024-01-01T00:00:00.000Z: unix ms = 1704067200000 → µs = 1704067200000000
  assertEquals(commitTimeToIso(1704067200000000n), "2024-01-01T00:00:00.000Z");
  // 2026-07-04T12:30:45.678Z: unix ms = 1783168245678 → µs = 1783168245678000
  assertEquals(commitTimeToIso(1783168245678000n), "2026-07-04T12:30:45.678Z");
  // Unix epoch itself => 0 microseconds
  assertEquals(commitTimeToIso(0n), "1970-01-01T00:00:00.000Z");
});
