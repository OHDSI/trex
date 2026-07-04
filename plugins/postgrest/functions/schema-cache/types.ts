// Ports src/PostgREST/SchemaCache/{Identifiers,Table,Relationship,Routine,Representations}.hs
// (PostgREST v12.2.3) — the schema-cache data model.
//
// Haskell HashMaps keyed by QualifiedIdentifier become TS Maps keyed by the
// string produced by the key helpers below (qiKey/relsMapKey/repKey).

// --------------------------------------------------------------------------
// Identifiers.hs
// --------------------------------------------------------------------------

/** A pg identifier with a prepended schema name. schema "" means search_path-resolved. */
export interface QualifiedIdentifier {
  schema: string;
  name: string;
}

/** Ports Identifiers.hs dumpQi — also used as the Map key for tables/routines. */
export function qiKey(qi: QualifiedIdentifier): string {
  return (qi.schema === "" ? "" : `${qi.schema}.`) + qi.name;
}

/** Ports Identifiers.hs toQi. Only handles the schema.identifier case, like upstream. */
export function toQi(txt: string): QualifiedIdentifier {
  const dot = txt.indexOf(".");
  if (dot === -1) return { schema: "", name: txt };
  return { schema: txt.slice(0, dot), name: txt.slice(dot + 1) };
}

export function qiEq(a: QualifiedIdentifier, b: QualifiedIdentifier): boolean {
  return a.schema === b.schema && a.name === b.name;
}

// --------------------------------------------------------------------------
// Table.hs
// --------------------------------------------------------------------------

export interface Column {
  name: string;
  description: string | null;
  nullable: boolean;
  /** Base type for domains in pg_catalog (colType upstream). */
  dataType: string;
  /** format_type of the declared type (colNominalType upstream). */
  nominalType: string;
  maxLen: number | null;
  default: string | null;
  enumVals: string[];
}

/**
 * Upstream Table only stores tableIsView :: Bool; we keep the relkind so
 * views and materialized views are distinguishable (see TABLES_SQL deviation).
 */
export type TableKind = "table" | "view" | "matview";

export interface Table {
  schema: string;
  name: string;
  description: string | null;
  kind: TableKind;
  // What can be done on the table/view; unrelated to granted privileges.
  insertable: boolean;
  updatable: boolean;
  deletable: boolean;
  pkCols: string[];
  /** Ordered by attnum, like upstream's InsOrdHashMap. */
  columns: Column[];
}

/** Upstream tableIsView (relkind in ('v','m')). */
export function tableIsView(t: Table): boolean {
  return t.kind !== "table";
}

/** Keyed by qiKey({schema, name}). */
export type TablesMap = Map<string, Table>;

// --------------------------------------------------------------------------
// Relationship.hs
// --------------------------------------------------------------------------

/** (table column, foreign table column) pair of an FK. */
export type ColumnPair = [string, string];

/** Junction table of an M2M relationship. */
export interface Junction {
  table: QualifiedIdentifier;
  constraint1: string;
  constraint2: string;
  colsSource: ColumnPair[];
  colsTarget: ColumnPair[];
}

export type Cardinality =
  | { tag: "O2M"; constraint: string; columns: ColumnPair[] }
  | { tag: "M2O"; constraint: string; columns: ColumnPair[] }
  // O2O is a refinement over M2O; with isParent == false it behaves like M2O.
  | { tag: "O2O"; constraint: string; columns: ColumnPair[]; isParent: boolean }
  | { tag: "M2M"; junction: Junction };

/** Upstream `Relationship{..}` constructor: an FK-derived relationship. */
export interface FkRelationship {
  kind: "fk";
  table: QualifiedIdentifier;
  foreignTable: QualifiedIdentifier;
  isSelf: boolean;
  cardinality: Cardinality;
  tableIsView: boolean;
  foreignTableIsView: boolean;
}

/** Upstream `ComputedRelationship{..}`: a function `f(table) returns ftable`. */
export interface ComputedRelationship {
  kind: "computed";
  function: QualifiedIdentifier;
  table: QualifiedIdentifier;
  foreignTable: QualifiedIdentifier;
  tableAlias: QualifiedIdentifier;
  toOne: boolean;
  isSelf: boolean;
}

export type Relationship = FkRelationship | ComputedRelationship;

/** Ports Relationship.hs relIsToOne. */
export function relIsToOne(rel: Relationship): boolean {
  if (rel.kind === "computed") return rel.toOne;
  return rel.cardinality.tag === "M2O" || rel.cardinality.tag === "O2O";
}

/**
 * Key of RelationshipsMap: (source table, foreign table *schema*). The
 * foreign table name is dropped upstream to support "column as target"
 * disambiguation (see SchemaCache.hs getOverrideRelationshipsMap).
 */
export function relsMapKey(table: QualifiedIdentifier, foreignSchema: string): string {
  return `${qiKey(table)}|${foreignSchema}`;
}

export type RelationshipsMap = Map<string, Relationship[]>;

// --------------------------------------------------------------------------
// Routine.hs
// --------------------------------------------------------------------------

/** Upstream PgType: Scalar qi | Composite qi isDomainAlias. */
export interface PgType {
  qi: QualifiedIdentifier;
  composite: boolean;
  /** Only meaningful when composite: the composite is a domain alias. */
  compositeAlias: boolean;
}

/** Upstream RetType: Single PgType | SetOf PgType. */
export interface RetType {
  kind: "single" | "setof";
  pgType: PgType;
}

export type FuncVolatility = "volatile" | "stable" | "immutable";

export interface RoutineParam {
  name: string;
  type: string;
  /** Type that ignores length limits (e.g. "character varying" for "character"). */
  typeMaxLength: string;
  required: boolean;
  variadic: boolean;
}

export interface Routine {
  schema: string;
  name: string;
  description: string | null;
  params: RoutineParam[];
  returnType: RetType;
  volatility: FuncVolatility;
  hasVariadic: boolean;
  /** From proconfig default_transaction_isolation; upstream toIsolationLevel. */
  isolationLvl: "read committed" | "repeatable read" | "serializable" | null;
  /** Hoisted proconfig settings as (name, value) pairs. */
  funcSettings: [string, string][];
}

/** Keyed by qiKey; each entry holds all overloads ordered by ascending param count. */
export type RoutineMap = Map<string, Routine[]>;

export function funcReturnsSingle(proc: Routine): boolean {
  return proc.returnType.kind === "single";
}

export function funcReturnsScalar(proc: Routine): boolean {
  return proc.returnType.kind === "single" && !proc.returnType.pgType.composite;
}

export function funcReturnsSetOfScalar(proc: Routine): boolean {
  return proc.returnType.kind === "setof" && !proc.returnType.pgType.composite;
}

export function funcReturnsCompositeAlias(proc: Routine): boolean {
  return proc.returnType.pgType.composite && proc.returnType.pgType.compositeAlias;
}

export function funcReturnsSingleComposite(proc: Routine): boolean {
  return proc.returnType.kind === "single" && proc.returnType.pgType.composite;
}

export function funcReturnsVoid(proc: Routine): boolean {
  const { kind, pgType } = proc.returnType;
  return kind === "single" && !pgType.composite && pgType.qi.schema === "pg_catalog" && pgType.qi.name === "void";
}

export function funcTableName(proc: Routine): string | null {
  return proc.returnType.pgType.composite ? proc.returnType.pgType.qi.name : null;
}

// --------------------------------------------------------------------------
// Representations.hs
// --------------------------------------------------------------------------

/** A domain cast usable to present/parse a field (data representation). */
export interface DataRepresentation {
  sourceType: string;
  targetType: string;
  function: string;
}

/** Key of RepresentationsMap: upstream (source type, target type) tuple. */
export function repKey(sourceType: string, targetType: string): string {
  return `${sourceType}->${targetType}`;
}

export type RepresentationsMap = Map<string, DataRepresentation>;

// --------------------------------------------------------------------------
// SchemaCache.hs — ViewKeyDependency + the cache itself
// --------------------------------------------------------------------------

/** PKDep = PK dependency, FKDep = FK dependency, FKDepRef = FK reference dependency. */
export type KeyDepType = "PKDep" | "FKDep" | "FKDepRef";

/**
 * A view PK/FK dependency detected on its source table. Each table column can
 * be referenced by several view columns, hence the string[] second element.
 */
export interface ViewKeyDependency {
  table: QualifiedIdentifier;
  view: QualifiedIdentifier;
  constraint: string;
  type: KeyDepType;
  /** (table column, view columns referencing it) pairs. */
  cols: [string, string[]][];
}

/**
 * Custom media-type handler row (mediaHandlers query). Resolution into
 * upstream's MediaHandlerMap (builtins, MTAny fallback) is deferred to the
 * media-type phase; we keep the raw introspection result.
 */
export interface MediaHandlerRow {
  handler: QualifiedIdentifier;
  target: QualifiedIdentifier;
  mediaType: string;
  resolvedMediaType: string;
}

export interface SchemaCache {
  tables: TablesMap;
  relationships: RelationshipsMap;
  routines: RoutineMap;
  representations: RepresentationsMap;
  mediaHandlers: MediaHandlerRow[];
  timezones: Set<string>;
}
