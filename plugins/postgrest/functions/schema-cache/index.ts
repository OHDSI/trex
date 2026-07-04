// Ports src/PostgREST/SchemaCache.hs (PostgREST v12.2.3) — querySchemaCache:
// runs the introspection queries in a single read-only transaction and
// assembles the schema cache — plus the plugin's cache lifecycle (singleton,
// invalidate/reload, LISTEN-based invalidation).

import { Client, type Pool, type PoolClient } from "pg";
import { noSchemaCacheError } from "../errors.ts";
import { getPool, poolSsl } from "../db.ts";
import {
  ALL_FUNCTIONS_SQL,
  COMPUTED_RELS_SQL,
  DATA_REPRESENTATIONS_SQL,
  M2O_AND_O2O_RELS_SQL,
  MEDIA_HANDLERS_SQL,
  TABLES_SQL,
  TIMEZONES_SQL,
  VIEWS_KEY_DEPENDENCIES_SQL,
} from "./sql.ts";
import {
  type Cardinality,
  type Column,
  type ColumnPair,
  type ComputedRelationship,
  type DataRepresentation,
  type FkRelationship,
  type FuncVolatility,
  qiEq,
  qiKey,
  type QualifiedIdentifier,
  type Relationship,
  type RelationshipsMap,
  relsMapKey,
  repKey,
  type RetType,
  type Routine,
  type RoutineMap,
  type SchemaCache,
  type Table,
  type TablesMap,
  type ViewKeyDependency,
} from "./types.ts";

export * from "./types.ts";

// Upstream default for db-hoisted-tx-settings (Config.hs defaultHoistedAllowList).
export const DEFAULT_HOISTED_TX_SETTINGS = [
  "statement_timeout",
  "plan_filter.statement_cost_limit",
  "default_transaction_isolation",
];

// --------------------------------------------------------------------------
// Query execution
//
// hasql decodes composite arrays over the binary protocol; node-postgres uses
// the text protocol, where anonymous-record arrays are impractical to parse.
// To keep the ported SQL verbatim we wrap queries that return composite
// arrays in `row_to_json` (nested `row(...)` values become {"f1":..,"f2":..}
// objects) and read scalar-only queries positionally with rowMode "array".
// --------------------------------------------------------------------------

async function jsonRows<T>(client: PoolClient, sql: string, values: unknown[]): Promise<T[]> {
  const text = `select row_to_json(_q) as r from (${sql}) _q`;
  const res = await client.query({ text, values, rowMode: "array" });
  return (res.rows as [T][]).map((row) => row[0]);
}

async function arrayRows(client: PoolClient, sql: string, values: unknown[]): Promise<unknown[][]> {
  const res = await client.query({ text: sql, values, rowMode: "array" });
  return res.rows as unknown[][];
}

// Row shapes produced by row_to_json; fN keys come from anonymous row(...).
interface ColumnRec {
  f1: string; // column_name
  f2: string | null; // description
  f3: boolean; // is_nullable
  f4: string; // data_type
  f5: string; // nominal_data_type
  f6: number | null; // character_maximum_length
  f7: string | null; // column_default
  f8: string[]; // enum vals
}

interface TableRow {
  table_schema: string;
  table_name: string;
  table_description: string | null;
  is_view: boolean;
  insertable: boolean;
  updatable: boolean;
  deletable: boolean;
  pk_cols: string[];
  columns: ColumnRec[];
  relkind: string;
}

interface RelRow {
  table_schema: string;
  table_name: string;
  foreign_table_schema: string;
  foreign_table_name: string;
  is_self: boolean;
  constraint_name: string;
  cols_and_fcols: { f1: string; f2: string }[];
  one_to_one: boolean;
}

interface KeyDepRow {
  table_schema: string;
  table_name: string;
  view_schema: string;
  view_name: string;
  constraint_name: string;
  constraint_type: string;
  column_dependencies: { f1: string; f2: string[] }[];
}

interface FuncRow {
  proc_schema: string;
  proc_name: string;
  proc_description: string | null;
  args: { f1: string; f2: string; f3: string; f4: boolean; f5: boolean }[];
  schema: string;
  name: string;
  rettype_is_setof: boolean;
  rettype_is_composite: boolean;
  rettype_is_composite_alias: boolean;
  provolatile: string;
  hasvariadic: boolean;
  transaction_isolation_level: string | null;
  kvs: { f1: string; f2: string }[];
}

// --------------------------------------------------------------------------
// Row decoding (SchemaCache.hs decodeTables/decodeRels/decodeViewKeyDeps/
// decodeFuncs/decodeRepresentations)
// --------------------------------------------------------------------------

function decodeTables(rows: TableRow[]): TablesMap {
  const tables: TablesMap = new Map();
  for (const row of rows) {
    const columns: Column[] = row.columns.map((c) => ({
      name: c.f1,
      description: c.f2,
      nullable: c.f3,
      dataType: c.f4,
      nominalType: c.f5,
      maxLen: c.f6,
      default: c.f7,
      enumVals: c.f8,
    }));
    const table: Table = {
      schema: row.table_schema,
      name: row.table_name,
      description: row.table_description,
      kind: row.relkind === "v" ? "view" : row.relkind === "m" ? "matview" : "table",
      insertable: row.insertable,
      updatable: row.updatable,
      deletable: row.deletable,
      pkCols: row.pk_cols,
      columns,
    };
    tables.set(qiKey({ schema: table.schema, name: table.name }), table);
  }
  return tables;
}

function decodeRels(rows: RelRow[]): FkRelationship[] {
  return rows.map((row) => {
    const columns: ColumnPair[] = row.cols_and_fcols.map((c) => [c.f1, c.f2]);
    const constraint = row.constraint_name;
    return {
      kind: "fk",
      table: { schema: row.table_schema, name: row.table_name },
      foreignTable: { schema: row.foreign_table_schema, name: row.foreign_table_name },
      isSelf: row.is_self,
      cardinality: row.one_to_one
        ? { tag: "O2O", constraint, columns, isParent: false }
        : { tag: "M2O", constraint, columns },
      tableIsView: false,
      foreignTableIsView: false,
    };
  });
}

function decodeViewKeyDeps(rows: KeyDepRow[]): ViewKeyDependency[] {
  return rows.map((row) => ({
    table: { schema: row.table_schema, name: row.table_name },
    view: { schema: row.view_schema, name: row.view_name },
    constraint: row.constraint_name,
    type: row.constraint_type === "p" ? "PKDep" : row.constraint_type === "f" ? "FKDep" : "FKDepRef",
    cols: row.column_dependencies.map((c) => [c.f1, c.f2]),
  }));
}

function parseVolatility(v: string): FuncVolatility {
  return v === "i" ? "immutable" : v === "s" ? "stable" : "volatile";
}

// Ports Config/Database.hs toIsolationLevel.
function toIsolationLevel(level: string | null): Routine["isolationLvl"] {
  if (level === null) return null;
  return level === "repeatable read" || level === "serializable" ? level : "read committed";
}

function decodeFuncs(rows: FuncRow[]): RoutineMap {
  const funcs: RoutineMap = new Map();
  for (const row of rows) {
    const returnType: RetType = {
      kind: row.rettype_is_setof ? "setof" : "single",
      pgType: {
        qi: { schema: row.schema, name: row.name },
        composite: row.rettype_is_composite,
        compositeAlias: row.rettype_is_composite && row.rettype_is_composite_alias,
      },
    };
    const routine: Routine = {
      schema: row.proc_schema,
      name: row.proc_name,
      description: row.proc_description,
      params: row.args.map((a) => ({ name: a.f1, type: a.f2, typeMaxLength: a.f3, required: a.f4, variadic: a.f5 })),
      returnType,
      volatility: parseVolatility(row.provolatile),
      hasVariadic: row.hasvariadic,
      isolationLvl: toIsolationLevel(row.transaction_isolation_level),
      funcSettings: row.kvs.map((kv) => [kv.f1, kv.f2]),
    };
    const key = qiKey({ schema: routine.schema, name: routine.name });
    const overloads = funcs.get(key);
    if (overloads) overloads.push(routine);
    else funcs.set(key, [routine]);
  }
  // Overloads ordered by least params first (Routine.hs Ord instance).
  for (const overloads of funcs.values()) overloads.sort((a, b) => a.params.length - b.params.length);
  return funcs;
}

function decodeComputedRels(rows: unknown[][]): ComputedRelationship[] {
  return rows.map((row) => {
    const [schema, name, tSchema, tName, ftSchema, ftName, singleRow, isSelf] = row as [
      string,
      string,
      string,
      string,
      string,
      string,
      boolean,
      boolean,
    ];
    return {
      kind: "computed",
      function: { schema, name },
      table: { schema: tSchema, name: tName },
      foreignTable: { schema: ftSchema, name: ftName },
      tableAlias: { schema: "", name: "" },
      toOne: singleRow,
      isSelf,
    };
  });
}

function decodeRepresentations(rows: unknown[][]): Map<string, DataRepresentation> {
  const reps = new Map<string, DataRepresentation>();
  for (const row of rows) {
    const [sourceType, targetType, func] = row as [string, string, string];
    reps.set(repKey(sourceType, targetType), { sourceType, targetType, function: func });
  }
  return reps;
}

// --------------------------------------------------------------------------
// Assembly (SchemaCache.hs addViewM2OAndO2ORels/addInverseRels/addM2MRels/
// addViewPrimaryKeys/getOverrideRelationshipsMap/removeInternal)
// --------------------------------------------------------------------------

const swapPairs = (cols: ColumnPair[]): ColumnPair[] => cols.map(([a, b]) => [b, a]);

/**
 * Ports the `expandKeyDepCols` local of addViewM2OAndO2ORels: the cartesian
 * product over each key column's view-column references, first column varying
 * slowest (list-monad traverse order).
 */
export function expandKeyDepCols(kdc: [string, string[]][]): ColumnPair[][] {
  let combos: string[][] = [[]];
  for (const [, viewCols] of kdc) {
    const next: string[][] = [];
    for (const combo of combos) {
      for (const viewCol of viewCols) next.push([...combo, viewCol]);
    }
    combos = next;
  }
  return combos.map((combo) => combo.map((viewCol, i) => [kdc[i][0], viewCol] as ColumnPair));
}

/**
 * Ports SchemaCache.hs addViewM2OAndO2ORels — adds M2O/O2O relationships for
 * views over tables (viewTableM2O), tables to views (tableViewM2O) and views
 * to views (viewViewM2O), derived from the views' FK key dependencies.
 */
export function addViewM2OAndO2ORels(keyDeps: ViewKeyDependency[], rels: Relationship[]): Relationship[] {
  const out = [...rels];
  for (const rel of rels) {
    if (rel.kind !== "fk") continue;
    const card = rel.cardinality;
    const isM2O = card.tag === "M2O";
    const isO2O = card.tag === "O2O" && !card.isParent;
    if (!isM2O && !isO2O) continue;
    const cons = card.constraint;
    const relCols = card.columns;
    const buildCard = (columns: ColumnPair[]): Cardinality =>
      isM2O ? { tag: "M2O", constraint: cons, columns } : { tag: "O2O", constraint: cons, columns, isParent: false };
    const viewTableRels = keyDeps.filter(
      (kd) => qiEq(kd.table, rel.table) && kd.constraint === cons && kd.type === "FKDep",
    );
    const tableViewRels = keyDeps.filter(
      (kd) => qiEq(kd.table, rel.foreignTable) && kd.constraint === cons && kd.type === "FKDepRef",
    );
    for (const vwTbl of viewTableRels) {
      for (const keyDepColsVwTbl of expandKeyDepCols(vwTbl.cols)) {
        out.push({
          kind: "fk",
          table: vwTbl.view,
          foreignTable: rel.foreignTable,
          isSelf: false,
          cardinality: buildCard(keyDepColsVwTbl.map(([, vCol], i) => [vCol, relCols[i][1]])),
          tableIsView: true,
          foreignTableIsView: false,
        });
      }
    }
    for (const tblVw of tableViewRels) {
      for (const keyDepColsTblVw of expandKeyDepCols(tblVw.cols)) {
        out.push({
          kind: "fk",
          table: rel.table,
          foreignTable: tblVw.view,
          isSelf: false,
          cardinality: buildCard(relCols.map(([tCol], i) => [tCol, keyDepColsTblVw[i][1]])),
          tableIsView: false,
          foreignTableIsView: true,
        });
      }
    }
    for (const vwTbl of viewTableRels) {
      for (const keyDepColsVwTbl of expandKeyDepCols(vwTbl.cols)) {
        for (const tblVw of tableViewRels) {
          for (const keyDepColsTblVw of expandKeyDepCols(tblVw.cols)) {
            out.push({
              kind: "fk",
              table: vwTbl.view,
              foreignTable: tblVw.view,
              isSelf: qiEq(vwTbl.view, tblVw.view),
              cardinality: buildCard(keyDepColsVwTbl.map(([, vCol1], i) => [vCol1, keyDepColsTblVw[i][1]])),
              tableIsView: true,
              foreignTableIsView: true,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Ports SchemaCache.hs addInverseRels — O2M inversions of M2O, O2O inversions. */
export function addInverseRels(rels: Relationship[]): Relationship[] {
  const m2oInverses: Relationship[] = [];
  const o2oInverses: Relationship[] = [];
  for (const rel of rels) {
    if (rel.kind !== "fk") continue;
    const card = rel.cardinality;
    if (card.tag === "M2O") {
      m2oInverses.push({
        kind: "fk",
        table: rel.foreignTable,
        foreignTable: rel.table,
        isSelf: rel.isSelf,
        cardinality: { tag: "O2M", constraint: card.constraint, columns: swapPairs(card.columns) },
        tableIsView: rel.foreignTableIsView,
        foreignTableIsView: rel.tableIsView,
      });
    } else if (card.tag === "O2O") {
      o2oInverses.push({
        kind: "fk",
        table: rel.foreignTable,
        foreignTable: rel.table,
        isSelf: rel.isSelf,
        cardinality: {
          tag: "O2O",
          constraint: card.constraint,
          columns: swapPairs(card.columns),
          isParent: !card.isParent,
        },
        tableIsView: rel.foreignTableIsView,
        foreignTableIsView: rel.tableIsView,
      });
    }
  }
  return [...rels, ...m2oInverses, ...o2oInverses];
}

/**
 * Ports SchemaCache.hs addM2MRels — adds an M2M relationship when a table has
 * FKs to two other tables and the FK columns are part of its PK columns.
 */
export function addM2MRels(tbls: TablesMap, rels: Relationship[]): Relationship[] {
  const m2os = rels.filter(
    (r): r is FkRelationship & { cardinality: { tag: "M2O"; constraint: string; columns: ColumnPair[] } } =>
      r.kind === "fk" && r.cardinality.tag === "M2O",
  );
  const added: Relationship[] = [];
  for (const r1 of m2os) {
    for (const r2 of m2os) {
      if (!qiEq(r1.table, r2.table) || r1.cardinality.constraint === r2.cardinality.constraint) continue;
      const jtCols = [...r1.cardinality.columns, ...r2.cardinality.columns].map(([col]) => col);
      const pkCols = new Set(tbls.get(qiKey(r1.table))?.pkCols ?? []);
      if (!jtCols.every((col) => pkCols.has(col))) continue;
      added.push({
        kind: "fk",
        table: r1.foreignTable,
        foreignTable: r2.foreignTable,
        isSelf: qiEq(r1.foreignTable, r2.foreignTable),
        cardinality: {
          tag: "M2M",
          junction: {
            table: r1.table,
            constraint1: r1.cardinality.constraint,
            constraint2: r2.cardinality.constraint,
            colsSource: swapPairs(r1.cardinality.columns),
            colsTarget: swapPairs(r2.cardinality.columns),
          },
        },
        tableIsView: r1.foreignTableIsView,
        foreignTableIsView: r2.foreignTableIsView,
      });
    }
  }
  return [...rels, ...added];
}

/**
 * Ports SchemaCache.hs addViewPrimaryKeys — views inherit the PKs of their
 * source tables when all PK columns are selected; on multiple references to
 * the same PK column the first view column is taken.
 */
export function addViewPrimaryKeys(tabs: TablesMap, keyDeps: ViewKeyDependency[]): TablesMap {
  const out: TablesMap = new Map();
  for (const [key, tbl] of tabs) {
    if (tbl.kind === "table") {
      out.set(key, tbl);
      continue;
    }
    const pkCols = keyDeps
      .filter((kd) => kd.type === "PKDep" && kd.view.schema === tbl.schema && kd.view.name === tbl.name)
      .flatMap((kd) => kd.cols.map(([, viewCols]) => viewCols[0]).filter((col): col is string => col !== undefined));
    out.set(key, { ...tbl, pkCols });
  }
  return out;
}

const CARD_ORDER: Record<Cardinality["tag"], number> = { O2M: 0, M2O: 1, O2O: 2, M2M: 3 };

function compareQi(a: QualifiedIdentifier, b: QualifiedIdentifier): number {
  return a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name);
}

// Deterministic ordering of a relationship list. Mirrors the shape of the
// derived Haskell Ord (constructor first, then fields); exact tie-breaking of
// deep fields is simplified to a JSON comparison.
function compareRels(a: Relationship, b: Relationship): number {
  if (a.kind !== b.kind) return a.kind === "fk" ? -1 : 1;
  const byTables = compareQi(a.table, b.table) || compareQi(a.foreignTable, b.foreignTable);
  if (byTables !== 0) return byTables;
  if (a.kind === "fk" && b.kind === "fk") {
    const byCard = CARD_ORDER[a.cardinality.tag] - CARD_ORDER[b.cardinality.tag];
    if (byCard !== 0) return byCard;
  }
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

/**
 * Ports SchemaCache.hs getOverrideRelationshipsMap — overrides detected
 * relationships with computed relationships (keyed by (table, function)) and
 * deforms the map key to (table, foreign schema).
 */
export function getOverrideRelationshipsMap(rels: Relationship[], cRels: ComputedRelationship[]): RelationshipsMap {
  interface Entry {
    table: QualifiedIdentifier;
    second: QualifiedIdentifier;
    rels: Relationship[];
  }
  const pairKey = (t: QualifiedIdentifier, s: QualifiedIdentifier) => `${qiKey(t)}|${qiKey(s)}`;
  const patched = new Map<string, Entry>();
  for (const rel of rels) {
    const second = rel.kind === "computed" ? rel.function : rel.foreignTable;
    const key = pairKey(rel.table, second);
    const entry = patched.get(key);
    if (entry) entry.rels.push(rel);
    else patched.set(key, { table: rel.table, second, rels: [rel] });
  }
  // Computed relationships prevail over detected ones for the same key.
  for (const cRel of cRels) {
    const key = pairKey(cRel.table, cRel.function);
    patched.set(key, { table: cRel.table, second: cRel.function, rels: [cRel] });
  }
  const out: RelationshipsMap = new Map();
  for (const entry of patched.values()) {
    const key = relsMapKey(entry.table, entry.second.schema);
    const existing = out.get(key);
    if (existing) existing.push(...entry.rels);
    else out.set(key, [...entry.rels]);
  }
  for (const list of out.values()) list.sort(compareRels);
  return out;
}

/**
 * Ports SchemaCache.hs removeInternal — removes db objects of non-exposed
 * schemas from tables and relationships (routines/representations are only
 * loaded from exposed schemas / not directly exposed).
 */
export function removeInternal(schemas: string[], cache: SchemaCache): SchemaCache {
  const tables: TablesMap = new Map();
  for (const [key, tbl] of cache.tables) {
    if (schemas.includes(tbl.schema)) tables.set(key, tbl);
  }
  const hasInternalJunction = (rel: Relationship): boolean =>
    rel.kind === "fk" && rel.cardinality.tag === "M2M" &&
    !schemas.includes(rel.cardinality.junction.table.schema);
  const relationships: RelationshipsMap = new Map();
  for (const [key, rels] of cache.relationships) {
    // All rels under one key share the same source table (see map assembly).
    if (rels.length === 0 || !schemas.includes(rels[0].table.schema)) continue;
    relationships.set(
      key,
      rels.filter((rel) => schemas.includes(rel.foreignTable.schema) && !hasInternalJunction(rel)),
    );
  }
  return { ...cache, tables, relationships };
}

// --------------------------------------------------------------------------
// querySchemaCache equivalent
// --------------------------------------------------------------------------

export interface LoadSchemaCacheOptions {
  /** db-extra-search-path; used by the view key-dependency query. */
  extraSearchPath?: string[];
  /** db-hoisted-tx-settings patterns for function settings. */
  hoistedTxSettings?: string[];
}

/** Ports SchemaCache.hs querySchemaCache. */
export async function loadSchemaCache(
  pool: Pool,
  schemas: string[],
  opts: LoadSchemaCacheOptions = {},
): Promise<SchemaCache> {
  const extraSearchPath = opts.extraSearchPath ?? [];
  const hoisted = opts.hoistedTxSettings ?? DEFAULT_HOISTED_TX_SETTINGS;
  const client = await pool.connect();
  let tableRows: TableRow[];
  let keyDepRows: KeyDepRow[];
  let relRows: RelRow[];
  let funcRows: FuncRow[];
  let cRelRows: unknown[][];
  let repRows: unknown[][];
  let mediaRows: unknown[][];
  let tzRows: unknown[][];
  try {
    // Like upstream: a single read-only transaction, with a voided search
    // path so every db object gets a fully qualified name.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
    await client.query("set local schema ''");
    tableRows = await jsonRows<TableRow>(client, TABLES_SQL, [schemas]);
    keyDepRows = await jsonRows<KeyDepRow>(client, VIEWS_KEY_DEPENDENCIES_SQL, [schemas, extraSearchPath]);
    relRows = await jsonRows<RelRow>(client, M2O_AND_O2O_RELS_SQL, []);
    funcRows = await jsonRows<FuncRow>(client, ALL_FUNCTIONS_SQL, [schemas, hoisted]);
    cRelRows = await arrayRows(client, COMPUTED_RELS_SQL, []);
    repRows = await arrayRows(client, DATA_REPRESENTATIONS_SQL, []);
    mediaRows = await arrayRows(client, MEDIA_HANDLERS_SQL, [schemas]);
    tzRows = await arrayRows(client, TIMEZONES_SQL, []);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const tabs = decodeTables(tableRows);
  const keyDeps = decodeViewKeyDeps(keyDepRows);
  const m2oRels = decodeRels(relRows);
  const cRels = decodeComputedRels(cRelRows);

  const tabsWViewsPks = addViewPrimaryKeys(tabs, keyDeps);
  const rels = addInverseRels(addM2MRels(tabsWViewsPks, addViewM2OAndO2ORels(keyDeps, m2oRels)));

  return removeInternal(schemas, {
    tables: tabsWViewsPks,
    relationships: getOverrideRelationshipsMap(rels, cRels),
    routines: decodeFuncs(funcRows),
    representations: decodeRepresentations(repRows),
    mediaHandlers: mediaRows.map((row) => {
      const [hSchema, hName, tSchema, tName, mediaType, resolvedMediaType] = row as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      return {
        handler: { schema: hSchema, name: hName },
        target: { schema: tSchema, name: tName },
        mediaType,
        resolvedMediaType,
      };
    }),
    timezones: new Set(tzRows.map((row) => row[0] as string)),
  });
}

// --------------------------------------------------------------------------
// Cache lifecycle: singleton with in-flight dedup, invalidate/reload, LISTEN
// --------------------------------------------------------------------------

type CacheLoader = () => Promise<SchemaCache>;

const state: {
  cache: SchemaCache | null;
  loadingPromise: Promise<SchemaCache> | null;
  stale: boolean;
} = { cache: null, loadingPromise: null, stale: false };

function envList(name: string, fallback: string): string[] {
  return (Deno.env.get(name) ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function defaultLoader(): Promise<SchemaCache> {
  return loadSchemaCache(getPool(), envList("PGRST_DB_SCHEMAS", "public"), {
    extraSearchPath: envList("PGRST_DB_EXTRA_SEARCH_PATH", "public"),
  });
}

let loader: CacheLoader = defaultLoader;

function ensureLoad(): Promise<SchemaCache> {
  if (!state.loadingPromise) {
    state.loadingPromise = loader()
      .then((cache) => {
        state.cache = cache;
        state.stale = false;
        return cache;
      })
      .finally(() => {
        state.loadingPromise = null;
      });
  }
  return state.loadingPromise;
}

/**
 * Returns the schema cache. Cold start awaits the initial load (failure →
 * PGRST002); when the cache was invalidated it serves the previous cache and
 * refreshes in the background, like PostgREST does on a NOTIFY reload.
 */
export async function getSchemaCache(): Promise<SchemaCache> {
  if (state.cache !== null) {
    if (state.stale) {
      ensureLoad().catch((err) => console.error("[postgrest] schema cache reload failed:", err));
    }
    return state.cache;
  }
  try {
    return await ensureLoad();
  } catch (err) {
    console.error("[postgrest] schema cache load failed:", err);
    throw noSchemaCacheError();
  }
}

/** Marks the cache stale; the next getSchemaCache() triggers a reload. */
export function invalidateSchemaCache(): void {
  state.stale = true;
}

/** Forces a reload and resolves with the fresh cache (failure → PGRST002). */
export async function reloadSchemaCache(): Promise<SchemaCache> {
  state.stale = true;
  try {
    return await ensureLoad();
  } catch (err) {
    console.error("[postgrest] schema cache reload failed:", err);
    throw noSchemaCacheError();
  }
}

/** Test hook: resets the singleton and optionally swaps the loader. */
export function resetSchemaCacheStateForTests(customLoader?: CacheLoader): void {
  state.cache = null;
  state.loadingPromise = null;
  state.stale = false;
  loader = customLoader ?? defaultLoader;
}

export interface SchemaCacheListener {
  stop(): Promise<void>;
}

function quoteIdent(ident: string): string {
  return `"${ident.replaceAll('"', '""')}"`;
}

/**
 * LISTENs on the pgrst channel with a dedicated connection and reconnect
 * backoff. Ports the notification semantics of PostgREST's listener: payload
 * "reload schema" invalidates the schema cache, "reload config" invokes the
 * config hook, an empty payload does both. Not wired into app.ts yet — it
 * needs config (db-channel/db-channel-enabled), so callers start it lazily.
 */
export function startListener(
  dsn: string,
  channel: string,
  onReloadConfig: () => void = () => {},
): SchemaCacheListener {
  let stopped = false;
  let client: Client | null = null;
  let reconnectTimer: number | undefined;
  let backoffMs = 1000;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return;
    const old = client;
    client = null;
    if (old) old.end().catch(() => {});
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 32_000);
  };

  const connect = async () => {
    if (stopped) return;
    const c = new Client({ connectionString: dsn, ...poolSsl(dsn) });
    client = c;
    c.on("notification", (msg: { payload?: string }) => {
      const payload = msg.payload ?? "";
      if (payload === "" || payload === "reload schema") invalidateSchemaCache();
      if (payload === "" || payload === "reload config") onReloadConfig();
    });
    c.on("error", scheduleReconnect);
    c.on("end", () => {
      if (client === c) scheduleReconnect();
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${quoteIdent(channel)}`);
      backoffMs = 1000;
    } catch (err) {
      console.error(`[postgrest] LISTEN ${channel} failed:`, err);
      scheduleReconnect();
    }
  };

  connect();

  return {
    async stop() {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      const c = client;
      client = null;
      if (c) await c.end().catch(() => {});
    },
  };
}
