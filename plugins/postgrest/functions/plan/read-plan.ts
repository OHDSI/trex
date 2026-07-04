// Ports the read side of src/PostgREST/Plan.hs (PostgREST v12.2.3):
// wrappedReadPlan / readPlan (the stage pipeline over the ReadPlanTree),
// field resolution against the schema cache (CoercibleField + data
// representations), resource embedding (addRels/findRel/getJoinConditions,
// addRelSelects/addSpreadSelects, null-embed filters, related orders, spread
// validation and aggregate hoisting) and content negotiation
// (negotiateContent).

import type { ApiRequest } from "../parse/api-request.ts";
import type { Action } from "../parse/api-request.ts";
import { pRequestRange } from "../parse/query-params.ts";
import type { MediaType } from "../parse/media-type.ts";
import { MTApplicationJSON, toMime } from "../parse/media-type.ts";
import type { NonnegRange } from "../parse/range.ts";
import { allRange, convertToLimitZeroRange, restrictRange } from "../parse/range.ts";
import type { AppConfig } from "../config.ts";
import {
  aggregatesNotAllowed,
  ambiguousRelBetween,
  invalidPreferences,
  mediaTypeError,
  noRelBetween,
  notEmbedded,
  relatedOrderNotToOne,
  spreadNotToOne,
} from "../errors.ts";
import { compressedRel, noRelBetweenHint, relHint } from "../errors-fuzzy.ts";
import type {
  Cardinality,
  Column,
  ColumnPair,
  QualifiedIdentifier,
  Relationship,
  RelationshipsMap,
  RepresentationsMap,
  SchemaCache,
  Table,
  TablesMap,
} from "../schema-cache/types.ts";
import { qiKey, relIsToOne, relsMapKey, repKey } from "../schema-cache/types.ts";
import type {
  AggregateFunction,
  Alias,
  Cast,
  EmbedPath,
  Field,
  FieldName,
  Filter,
  Hint,
  LogicTree,
  OrderTerm,
  SelectItem,
  Tree,
} from "../types.ts";
import type {
  CoercibleField,
  CoercibleFilter,
  CoercibleLogicTree,
  CoercibleOrderTerm,
  CoercibleSelectField,
  JoinCondition,
  MediaHandler,
  ReadPlan,
  ReadPlanTree,
  RelSelectField,
  ResolvedHandler,
  SpreadSelectField,
} from "./types.ts";
import { unknownField } from "./types.ts";
import { sourceCTEName } from "../sql/fragment.ts";

// --------------------------------------------------------------------------
// Plan.hs WrappedReadPlan (the CrudPlan read constructor)
// --------------------------------------------------------------------------

export interface WrappedReadPlan {
  wrReadPlan: ReadPlanTree;
  wrHandler: MediaHandler;
  wrMedia: MediaType;
  wrHdrsOnly: boolean;
  crudQi: QualifiedIdentifier;
}

/** Ports Plan.hs wrappedReadPlan. Throws PgrstError. */
export function wrappedReadPlan(
  identifier: QualifiedIdentifier,
  conf: AppConfig,
  sCache: SchemaCache,
  apiRequest: ApiRequest,
  headersOnly: boolean,
): WrappedReadPlan {
  const rPlan = readPlan(identifier, conf, sCache, apiRequest);
  const [handler, mediaType] = negotiateContent(conf, apiRequest, apiRequest.iAcceptMediaType, hasDefaultSelect(rPlan));
  const { invalidPrefs, preferHandling } = apiRequest.iPreferences;
  if (invalidPrefs.length > 0 && preferHandling === "Strict") throw invalidPreferences(invalidPrefs);
  return { wrReadPlan: rPlan, wrHandler: handler, wrMedia: mediaType, wrHdrsOnly: headersOnly, crudQi: identifier };
}

/** Ports Plan.hs hasDefaultSelect. */
export function hasDefaultSelect(rPlan: ReadPlanTree): boolean {
  return rPlan.subForest.length === 0 && rPlan.rootLabel.select.length === 1 &&
    rPlan.rootLabel.select[0].csField.cfName === "*";
}

// --------------------------------------------------------------------------
// ResolverContext + field resolution (Plan.hs)
// --------------------------------------------------------------------------

/** Ports Plan.hs ResolverContext. */
export interface ResolverContext {
  tables: TablesMap;
  representations: RepresentationsMap;
  /** The table we're currently attending; changes as we recurse into joins etc. */
  qi: QualifiedIdentifier;
  /** The output type for the response payload; e.g. "csv", "json", "binary". */
  outputType: string;
}

/** Ports Plan.hs resolveColumnField. */
function resolveColumnField(col: Column): CoercibleField {
  return {
    cfName: col.name,
    cfJsonPath: [],
    cfToJson: false,
    cfIRType: col.nominalType,
    cfTransform: null,
    cfDefault: col.default,
  };
}

/** Ports Plan.hs resolveTableFieldName. */
export function resolveTableFieldName(table: Table, fieldName: string): CoercibleField {
  const col = table.columns.find((c) => c.name === fieldName);
  return col === undefined ? unknownField(fieldName, []) : resolveColumnField(col);
}

/** Ports Plan.hs resolveTypeOrUnknown — json/jsonb skip the to_jsonb wrap
 * so indexes keep applying (PostgREST/postgrest#2594). */
function resolveTypeOrUnknown(ctx: ResolverContext, field: Field): CoercibleField {
  const table = ctx.tables.get(qiKey(ctx.qi));
  const res = table === undefined ? unknownField(field.name, field.jsonPath) : resolveTableFieldName(table, field.name);
  if (res.cfIRType === "json" || res.cfIRType === "jsonb") {
    return { ...res, cfJsonPath: field.jsonPath, cfToJson: false };
  }
  return { ...res, cfJsonPath: field.jsonPath, cfToJson: true };
}

/** Ports Plan.hs withTransformer — installs a data representation cast. */
function withTransformer(
  ctx: ResolverContext,
  sourceType: string,
  targetType: string,
  field: CoercibleField,
): CoercibleField {
  const rep = ctx.representations.get(repKey(sourceType, targetType));
  if (rep === undefined) return field;
  return { ...field, cfIRType: sourceType, cfTransform: rep.function };
}

/** Ports Plan.hs withOutputFormat. */
function withOutputFormat(ctx: ResolverContext, field: CoercibleField): CoercibleField {
  return withTransformer(ctx, field.cfIRType, ctx.outputType, field);
}

/** Ports Plan.hs withTextParse. */
function withTextParse(ctx: ResolverContext, field: CoercibleField): CoercibleField {
  return withTransformer(ctx, "text", field.cfIRType, field);
}

/** Ports Plan.hs withJsonParse — mutation body values parse from json. */
export function withJsonParse(ctx: ResolverContext, field: CoercibleField): CoercibleField {
  return withTransformer(ctx, "json", field.cfIRType, field);
}

/** Ports Plan.hs resolveOutputField. */
function resolveOutputField(ctx: ResolverContext, field: Field): CoercibleField {
  return withOutputFormat(ctx, resolveTypeOrUnknown(ctx, field));
}

/** Ports Plan.hs resolveQueryInputField — filter values parse from text. */
function resolveQueryInputField(ctx: ResolverContext, field: Field): CoercibleField {
  return withTextParse(ctx, resolveTypeOrUnknown(ctx, field));
}

// --------------------------------------------------------------------------
// readPlan — the stage pipeline (Plan.hs readPlan)
// --------------------------------------------------------------------------

/**
 * Ports Plan.hs readPlan. Stage order matches upstream exactly (the =<<
 * chain applies bottom-up): addFilters, addOrders, addRanges, addLogicTrees,
 * addRels, expandStars, addAliases, addRelatedOrders, validateSpreadEmbeds,
 * addNullEmbedFilters, addRelSelects, hoistSpreadAggFunctions,
 * validateAggFunctions, treeRestrictRange.
 *
 * Note that, like upstream, an unknown table is NOT rejected here: field
 * resolution falls back to unknownField and the generated SQL fails with
 * 42P01 (undefined table), which maps to a 404.
 */
export function readPlan(
  qi: QualifiedIdentifier,
  conf: AppConfig,
  sCache: SchemaCache,
  apiRequest: ApiRequest,
): ReadPlanTree {
  // JSON output format hardcoded for now, like upstream.
  const ctx: ResolverContext = {
    tables: sCache.tables,
    representations: sCache.representations,
    qi,
    outputType: "json",
  };
  let tree = initReadRequest(ctx, apiRequest.iQueryParams.qsSelect);
  tree = addFilters(ctx, apiRequest, tree);
  tree = addOrders(ctx, apiRequest, tree);
  tree = addRanges(apiRequest, tree);
  tree = addLogicTrees(ctx, apiRequest, tree);
  tree = addRels(qi.schema, apiRequest.iAction, sCache.relationships, null, tree);
  tree = expandStars(ctx, tree);
  tree = addAliases(tree);
  tree = addRelatedOrders(tree);
  tree = validateSpreadEmbeds(tree);
  tree = addNullEmbedFilters(tree);
  tree = addRelSelects(tree);
  tree = hoistSpreadAggFunctions(tree);
  tree = validateAggFunctions(conf.dbAggregatesEnabled, tree);
  tree = treeRestrictRange(conf.dbMaxRows, apiRequest.iAction, tree);
  return tree;
}

/** Ports Plan.hs initReadRequest — builds the initial tree from the select forest. */
function initReadRequest(ctx: ResolverContext, qsSelect: Tree<SelectItem>[]): ReadPlanTree {
  const rootDepth = 0;
  const qiSchema = ctx.qi.schema;
  const defReadPlan = (): ReadPlan => ({
    select: [],
    from: { schema: "", name: "" },
    fromAlias: null,
    where_: [],
    order: [],
    range_: allRange,
    relName: "",
    relToParent: null,
    relJoinConds: [],
    relAlias: null,
    relAggAlias: "",
    relHint: null,
    relJoinType: null,
    relIsSpread: false,
    relSelect: [],
    depth: rootDepth,
  });
  const treeEntry = (depth: number, node: Tree<SelectItem>, acc: ReadPlanTree): ReadPlanTree => {
    const nxtDepth = depth + 1;
    const si = node.rootLabel;
    switch (si.kind) {
      case "SelectRelation":
      case "SpreadRelation": {
        let child: ReadPlanTree = {
          rootLabel: {
            ...defReadPlan(),
            from: { schema: qiSchema, name: si.selRelation },
            relName: si.selRelation,
            relAlias: si.kind === "SelectRelation" ? si.selAlias : null,
            relHint: si.selHint,
            relJoinType: si.selJoinType,
            relIsSpread: si.kind === "SpreadRelation",
            depth: nxtDepth,
          },
          subForest: [],
        };
        // foldr (treeEntry nxtDepth) over the field forest
        for (let i = node.subForest.length - 1; i >= 0; i--) child = treeEntry(nxtDepth, node.subForest[i], child);
        return { ...acc, subForest: [child, ...acc.subForest] };
      }
      case "SelectField": {
        const sel: CoercibleSelectField = {
          csField: resolveOutputField({ ...ctx, qi: acc.rootLabel.from }, si.selField),
          csAggFunction: si.selAggregateFunction,
          csAggCast: si.selAggregateCast,
          csCast: si.selCast,
          csAlias: si.selAlias,
        };
        return { ...acc, rootLabel: { ...acc.rootLabel, select: [sel, ...acc.rootLabel.select] } };
      }
    }
  };
  let tree: ReadPlanTree = {
    rootLabel: { ...defReadPlan(), from: ctx.qi, relName: ctx.qi.name, depth: rootDepth },
    subForest: [],
  };
  // foldr (treeEntry rootDepth): the last select item is folded in first
  for (let i = qsSelect.length - 1; i >= 0; i--) tree = treeEntry(rootDepth, qsSelect[i], tree);
  return tree;
}

/**
 * Ports Plan.hs updateNode: find a node of the tree by embed path and apply
 * `f` to it; a path miss yields NotEmbedded (PGRST108). Like upstream, the
 * updated child moves to the front of its forest (`node : delete target f`).
 */
function updateNode<A>(f: (a: A, tree: ReadPlanTree) => ReadPlanTree, path: EmbedPath, a: A, tree: ReadPlanTree): ReadPlanTree {
  if (path.length === 0) return f(a, tree);
  const [targetNodeName, ...remainingPath] = path;
  const target = tree.subForest.find(
    (n) => n.rootLabel.relName === targetNodeName || n.rootLabel.relAlias === targetNodeName,
  );
  if (target === undefined) throw notEmbedded(targetNodeName);
  const updated = updateNode(f, remainingPath, a, target);
  return { ...tree, subForest: [updated, ...tree.subForest.filter((n) => n !== target)] };
}

/** Ports Plan.hs addFilters. */
function addFilters(ctx: ResolverContext, apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
  // Reads and routine calls take all filters (qsFilters); mutations only the
  // non-root ones (the root filters go into the MutatePlan's WHERE).
  const act = apiRequest.iAction;
  const takesAllFilters = act.kind === "ActDb" && (act.db.kind === "ActRelationRead" || act.db.kind === "ActRoutine");
  const flts = takesAllFilters ? apiRequest.iQueryParams.qsFilters : apiRequest.iQueryParams.qsFiltersNotRoot;
  // foldr: the last filter is applied first, so the first ends up outermost.
  return [...flts].reverse().reduce(
    (t, [path, flt]) =>
      updateNode(
        (f: Filter, node) => ({
          ...node,
          rootLabel: {
            ...node.rootLabel,
            where_: addFilterToLogicForest(resolveFilter({ ...ctx, qi: node.rootLabel.from }, f), node.rootLabel.where_),
          },
        }),
        path,
        flt,
        t,
      ),
    tree,
  );
}

/** Ports Plan.hs addFilterToLogicForest. */
export function addFilterToLogicForest(flt: CoercibleFilter, lf: CoercibleLogicTree[]): CoercibleLogicTree[] {
  return [{ kind: "CoercibleStmnt", filter: flt }, ...lf];
}

/** Ports Plan.hs resolveFilter. */
export function resolveFilter(ctx: ResolverContext, flt: Filter): CoercibleFilter {
  return { kind: "CoercibleFilter", field: resolveQueryInputField(ctx, flt.field), opExpr: flt.opExpr };
}

/** Ports Plan.hs addOrders — note upstream resolves order fields against the
 * unmodified root context, not the target node's table (bug-compatible).
 * Mutations skip this: their root order lives on the MutatePlan. */
function addOrders(ctx: ResolverContext, apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
  const act = apiRequest.iAction;
  if (act.kind === "ActDb" && act.db.kind === "ActRelationMut") return tree;
  return [...apiRequest.iQueryParams.qsOrder].reverse().reduce(
    (t, [path, terms]) =>
      updateNode(
        (o: OrderTerm[], node) => ({
          ...node,
          rootLabel: { ...node.rootLabel, order: o.map((term) => resolveOrder(ctx, term)) },
        }),
        path,
        terms,
        t,
      ),
    tree,
  );
}

/** Ports Plan.hs resolveOrder. */
export function resolveOrder(ctx: ResolverContext, term: OrderTerm): CoercibleOrderTerm {
  if (term.kind === "OrderRelationTerm") {
    return {
      kind: "CoercibleOrderRelationTerm",
      coRelation: term.otRelation,
      coRelTerm: term.otRelTerm,
      coDirection: term.otDirection,
      coNullOrder: term.otNullOrder,
    };
  }
  return {
    kind: "CoercibleOrderTerm",
    coField: resolveTypeOrUnknown(ctx, term.otTerm),
    coDirection: term.otDirection,
    coNullOrder: term.otNullOrder,
  };
}

/** Ports Plan.hs addRanges — mutations skip it (mutRange is on the MutatePlan). */
function addRanges(apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
  const act = apiRequest.iAction;
  if (act.kind === "ActDb" && act.db.kind === "ActRelationMut") return tree;
  const ranges: [EmbedPath, NonnegRange][] = [...apiRequest.iRange.entries()].map(([k, v]) => pRequestRange(k, v));
  return ranges.reverse().reduce(
    (t, [path, range]) =>
      updateNode((r: NonnegRange, node) => ({ ...node, rootLabel: { ...node.rootLabel, range_: r } }), path, range, t),
    tree,
  );
}

/** Ports Plan.hs addLogicTrees. */
function addLogicTrees(ctx: ResolverContext, apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
  return [...apiRequest.iQueryParams.qsLogic].reverse().reduce(
    (t, [path, logic]) =>
      updateNode(
        (lt: LogicTree, node) => ({
          ...node,
          rootLabel: {
            ...node.rootLabel,
            where_: [resolveLogicTree({ ...ctx, qi: node.rootLabel.from }, lt), ...node.rootLabel.where_],
          },
        }),
        path,
        logic,
        t,
      ),
    tree,
  );
}

/** Ports Plan.hs resolveLogicTree. */
export function resolveLogicTree(ctx: ResolverContext, tree: LogicTree): CoercibleLogicTree {
  if (tree.kind === "Stmnt") return { kind: "CoercibleStmnt", filter: resolveFilter(ctx, tree.filter) };
  return {
    kind: "CoercibleExpr",
    negated: tree.negated,
    op: tree.op,
    children: tree.children.map((t) => resolveLogicTree(ctx, t)),
  };
}

// --------------------------------------------------------------------------
// Resource embedding (Plan.hs addRels / getJoinConditions / findRel)
// --------------------------------------------------------------------------

/**
 * Ports Plan.hs addRels: adds relationships to the nodes of the tree by
 * traversing the forest while keeping track of the parent node; also adds the
 * internal aliasing (`<ftable>_<depth>` from-alias, `<table>_<name>_<depth>`
 * aggregate alias) and the join conditions.
 */
export function addRels(
  schema: string,
  action: Action,
  allRels: RelationshipsMap,
  parentNode: ReadPlanTree | null,
  node: ReadPlanTree,
): ReadPlanTree {
  const rPlan = node.rootLabel;
  const forest = node.subForest;
  let newReadPlan: ReadPlan;
  if (parentNode !== null) {
    const { relName, relHint: hint, relAlias, depth } = rPlan;
    const parentNodeQi = parentNode.rootLabel.from;
    const parentAlias = parentNode.rootLabel.fromAlias;
    // Only on depth 1 we check if the root (depth 0) has an alias so the
    // sourceCTEName alias can be found as a relationship.
    const origin = depth === 1 ? parentAlias ?? parentNodeQi.name : parentNodeQi.name;
    const r = findRel(schema, allRels, origin, relName, hint);
    const newAlias = `${r.foreignTable.name}_${depth}`;
    const aggAlias = `${r.table.name}_${relAlias ?? relName}_${depth}`;
    if (r.kind === "fk" && r.cardinality.tag === "M2M") {
      // m2m does internal implicit joins that don't need aliasing
      newReadPlan = {
        ...rPlan,
        from: r.foreignTable,
        relToParent: r,
        relAggAlias: aggAlias,
        relJoinConds: getJoinConditions(null, parentAlias, r),
      };
    } else if (r.kind === "computed") {
      const rel: Relationship = {
        ...r,
        tableAlias: parentAlias === null ? r.table : { schema: "", name: parentAlias },
      };
      newReadPlan = { ...rPlan, from: r.foreignTable, relToParent: rel, relAggAlias: aggAlias, fromAlias: newAlias };
    } else {
      newReadPlan = {
        ...rPlan,
        from: r.foreignTable,
        relToParent: r,
        relAggAlias: aggAlias,
        fromAlias: newAlias,
        relJoinConds: getJoinConditions(newAlias, parentAlias, r),
      };
    }
  } else {
    // root case: the CTE for mutations/rpc is used as WITH sourceCTEName ..
    // SELECT .. FROM sourceCTEName as alias; we use the table name as an
    // alias so findRel can find the right relationship.
    if (action.kind === "ActDb" && (action.db.kind === "ActRelationMut" || action.db.kind === "ActRoutine")) {
      newReadPlan = { ...rPlan, from: { schema: "", name: sourceCTEName }, fromAlias: rPlan.from.name };
    } else {
      newReadPlan = rPlan;
    }
  }
  const newNode: ReadPlanTree = { rootLabel: newReadPlan, subForest: forest };
  return {
    rootLabel: newReadPlan,
    subForest: forest.map((child) => addRels(schema, action, allRels, newNode, child)),
  };
}

/** Ports Plan.hs getJoinConditions. */
export function getJoinConditions(
  tblAlias: Alias | null,
  parentAlias: Alias | null,
  rel: Relationship,
): JoinCondition[] {
  if (rel.kind === "computed") return [];
  const tSchema = rel.table.schema;
  const tN = rel.table.name;
  const ftN = rel.foreignTable.name;
  const toJoinCondition =
    (prAl: Alias | null, newAl: Alias | null, tb: string, ftb: string) => ([c, fc]: ColumnPair): JoinCondition => ({
      left: [newAl === null ? { schema: tSchema, name: ftb } : { schema: "", name: newAl }, fc],
      right: [prAl === null ? { schema: tSchema, name: tb } : { schema: "", name: prAl }, c],
    });
  const card = rel.cardinality;
  if (card.tag === "M2M") {
    const jtn = card.junction.table.name;
    return [
      ...card.junction.colsTarget.map(toJoinCondition(null, null, ftN, jtn)),
      ...card.junction.colsSource.map(toJoinCondition(parentAlias, tblAlias, tN, jtn)),
    ];
  }
  return card.columns.map(toJoinCondition(parentAlias, tblAlias, tN, ftN));
}

/**
 * Ports Plan.hs findRel: finds a relationship between an origin and a target
 * in the request (`/origin?select=target(*)`). If more than one relationship
 * is found the request is ambiguous (PGRST201) — it can be disambiguated by
 * adding precision to the target or by using a hint
 * (`/origin?select=target!hint(*)`). The origin can be a table or view.
 */
export function findRel(
  schema: string,
  allRels: RelationshipsMap,
  origin: string,
  target: string,
  hint: Hint | null,
): Relationship {
  const singleCol = (card: Cardinality): ColumnPair | null =>
    card.tag !== "M2M" && card.columns.length === 1 ? card.columns[0] : null;
  const matchFKSingleCol = (hint_: string, card: Cardinality): boolean => singleCol(card)?.[0] === hint_;
  const matchFKRefSingleCol = (hint_: string, card: Cardinality): boolean => singleCol(card)?.[1] === hint_;
  const matchConstraint = (tar: string, card: Cardinality): boolean => card.tag !== "M2M" && card.constraint === tar;
  const matchJunction = (hint_: string, card: Cardinality): boolean =>
    card.tag === "M2M" && card.junction.table.name === hint_;

  const rels = (allRels.get(relsMapKey({ schema, name: origin }, schema)) ?? []).filter((rel) => {
    if (rel.kind === "computed") return target === rel.function.name;
    const card = rel.cardinality;
    if (rel.isSelf) {
      // In a self-relationship we have a single foreign key but two
      // relationships with different cardinalities: M2O/O2M. For
      // disambiguation, we use the convention of getting:
      if (hint === null) {
        // The O2M by using the table name in the target: /family_tree?select=children:family_tree(*)
        // The M2O by using the column name in the target: /family_tree?select=parent(*)
        return (target === rel.foreignTable.name && card.tag === "O2M") ||
          (matchFKSingleCol(target, card) && card.tag === "M2O");
      }
      // /organizations?select=auditees:organizations!auditor(*)
      return target === rel.foreignTable.name && card.tag === "O2M" && matchFKRefSingleCol(hint, card);
    }
    if (hint === null) {
      // target = table / view / constraint / column-from-origin
      // (constraint/column-from-origin can only come from tables,
      // https://github.com/PostgREST/postgrest/issues/2277)
      return target === rel.foreignTable.name || // /projects?select=clients(*)
        (matchConstraint(target, card) && !rel.foreignTableIsView) || // /projects?select=projects_client_id_fkey(*)
        (matchFKSingleCol(target, card) && !rel.foreignTableIsView); // /projects?select=client_id(*)
    }
    // hint = table / view / constraint / column-from-origin / column-from-target
    // (hint can take table / view values to aid in finding the junction in an m2m relationship)
    return target === rel.foreignTable.name && ( // /projects?select=clients(*)
      matchConstraint(hint, card) || // /projects?select=clients!projects_client_id_fkey(*)
      matchFKSingleCol(hint, card) || // /projects?select=clients!client_id(*)
      matchFKRefSingleCol(hint, card) || // /projects?select=clients!id(*)
      matchJunction(hint, card) // /users?select=tasks!users_tasks(*) many-to-many between users and tasks
    );
  });
  if (rels.length === 1) return rels[0];
  if (rels.length === 0) {
    throw noRelBetween(origin, target, hint, schema, noRelBetweenHint(origin, target, schema, allRels));
  }
  throw ambiguousRelBetween(
    origin,
    target,
    rels.map(compressedRel),
    `Try changing '${target}' to one of the following: ${relHint(rels)}. Find the desired relationship in the 'details' key.`,
  );
}

// --------------------------------------------------------------------------
// addRelSelects / spread embeds (Plan.hs)
// --------------------------------------------------------------------------

/** Ports Plan.hs addRelSelects — derives the parent-side select entries of embeds. */
function addRelSelects(node: ReadPlanTree): ReadPlanTree {
  if (node.subForest.length === 0) return node;
  const newForest = node.subForest.map(addRelSelects);
  const newRelSelects = newForest
    .map(generateRelSelectField)
    .filter((rs): rs is RelSelectField => rs !== null);
  return { rootLabel: { ...node.rootLabel, relSelect: newRelSelects }, subForest: newForest };
}

/** Ports Plan.hs generateRelSelectField. */
function generateRelSelectField(node: ReadPlanTree): RelSelectField | null {
  const rp = node.rootLabel;
  if (rp.relToParent === null) return null;
  if (rp.relIsSpread) {
    return { kind: "Spread", rsSpreadSel: generateSpreadSelectFields(rp), rsAggAlias: rp.relAggAlias };
  }
  return {
    kind: "JsonEmbed",
    rsSelName: rp.relAlias ?? rp.relName,
    rsAggAlias: rp.relAggAlias,
    rsEmbedMode: relIsToOne(rp.relToParent) ? "JsonObject" : "JsonArray",
    rsEmptyEmbed: hasOnlyNullEmbed(rp.select.length === 0, node.subForest),
  };
}

/** Ports the hasOnlyNullEmbed/checkIfNullEmbed locals of generateRelSelectField. */
function hasOnlyNullEmbed(base: boolean, forest: ReadPlanTree[]): boolean {
  return forest.reduce(
    (isNullEmbed, n) => isNullEmbed && hasOnlyNullEmbed(n.rootLabel.select.length === 0, n.subForest),
    base,
  );
}

/** Ports Plan.hs generateSpreadSelectFields. */
function generateSpreadSelectFields(rp: ReadPlan): SpreadSelectField[] {
  // We combine the select and relSelect fields into a single list of SpreadSelectField.
  const selectSpread = rp.select.map((sel): SpreadSelectField => ({
    ssSelName: sel.csAlias ?? sel.csField.cfName,
    ssSelAggFunction: null,
    ssSelAggCast: null,
    ssSelAlias: null,
  }));
  const relSelectSpread = rp.relSelect.flatMap((rs): SpreadSelectField[] =>
    rs.kind === "JsonEmbed"
      ? [{ ssSelName: rs.rsSelName, ssSelAggFunction: null, ssSelAggCast: null, ssSelAlias: null }]
      : rs.rsSpreadSel
  );
  return [...selectSpread, ...relSelectSpread];
}

/** Ports Plan.hs validateSpreadEmbeds — spreads are only for to-one relationships (v12). */
function validateSpreadEmbeds(node: ReadPlanTree): ReadPlanTree {
  const rp = node.rootLabel;
  if (rp.relToParent !== null && rp.relIsSpread && !relIsToOne(rp.relToParent)) {
    // TODO(upstream): using relTable is not entirely right because ReadPlan might have an alias
    throw spreadNotToOne(rp.relToParent.table.name, rp.relName);
  }
  return { ...node, subForest: node.subForest.map(validateSpreadEmbeds) };
}

// --------------------------------------------------------------------------
// Spread aggregate hoisting (Plan.hs hoistSpreadAggFunctions)
// --------------------------------------------------------------------------

/** Ports the Plan.hs HoistedAgg type alias. */
interface HoistedAgg {
  aggAlias: Alias;
  fieldName: FieldName;
  aggFunction: AggregateFunction;
  aggCast: Cast | null;
  fldAlias: Alias | null;
}

/**
 * Ports Plan.hs hoistSpreadAggFunctions: aggregates inside spread embeds are
 * hoisted to the highest level possible (the root, or the closest JSON-object
 * or JSON-array embed) so their semantics make sense.
 */
function hoistSpreadAggFunctions(tree: ReadPlanTree): ReadPlanTree {
  return applySpreadAggHoistingToNode(tree)[0];
}

/** Ports Plan.hs applySpreadAggHoistingToNode. */
function applySpreadAggHoistingToNode(node: ReadPlanTree): [ReadPlanTree, HoistedAgg[]] {
  const rp = node.rootLabel;
  const childResults = node.subForest.map(applySpreadAggHoistingToNode);
  const newChildren = childResults.map(([child]) => child);
  const allChildAggLists = childResults.flatMap(([, aggs]) => aggs);
  const keepSelects = rp.depth === 0 || (rp.relToParent !== null && !rp.relIsSpread);
  const [newSelects, aggList] = keepSelects
    ? [rp.select, [] as HoistedAgg[]]
    : hoistFromSelectFields(rp.relAggAlias, rp.select);
  const newRelSelects = node.subForest.length === 0
    ? rp.relSelect
    : rp.relSelect.map((rs) => hoistIntoRelSelectFields(allChildAggLists, rs));
  return [{ rootLabel: { ...rp, select: newSelects, relSelect: newRelSelects }, subForest: newChildren }, aggList];
}

/** Ports Plan.hs hoistFromSelectFields. */
function hoistFromSelectFields(aggAlias: Alias, fields: CoercibleSelectField[]): [CoercibleSelectField[], HoistedAgg[]] {
  const newFields: CoercibleSelectField[] = [];
  const aggList: HoistedAgg[] = [];
  for (const field of fields) {
    if (field.csAggFunction !== null) {
      newFields.push({ ...field, csAggFunction: null, csAggCast: null });
      aggList.push({
        aggAlias,
        fieldName: field.csAlias ?? field.csField.cfName,
        aggFunction: field.csAggFunction,
        aggCast: field.csAggCast,
        fldAlias: field.csAlias,
      });
    } else {
      newFields.push(field);
    }
  }
  return [newFields, aggList];
}

/** Ports Plan.hs hoistIntoRelSelectFields. */
function hoistIntoRelSelectFields(aggList: HoistedAgg[], rs: RelSelectField): RelSelectField {
  if (rs.kind !== "Spread") return rs;
  return {
    ...rs,
    rsSpreadSel: rs.rsSpreadSel.map((sel) => {
      const hoisted = aggList.find((h) => h.aggAlias === rs.rsAggAlias && h.fieldName === sel.ssSelName);
      if (hoisted === undefined) return sel;
      return { ...sel, ssSelAggFunction: hoisted.aggFunction, ssSelAggCast: hoisted.aggCast, ssSelAlias: hoisted.fldAlias };
    }),
  };
}

// --------------------------------------------------------------------------
// Null-embed filters / related orders (Plan.hs)
// --------------------------------------------------------------------------

/**
 * Ports Plan.hs addNullEmbedFilters: searches for null filters on embeds,
 * e.g. `projects=not.is.null` on `GET /clients?select=*,projects(*)&projects=not.is.null`,
 * and turns them into CoercibleFilterNullEmbed on the internal aggregate name.
 */
function addNullEmbedFilters(node: ReadPlanTree): ReadPlanTree {
  const forestReadPlans = node.subForest.map((n) => n.rootLabel);
  const newNullFilters = (tree: CoercibleLogicTree): CoercibleLogicTree => {
    if (tree.kind === "CoercibleExpr") return { ...tree, children: tree.children.map(newNullFilters) };
    const flt = tree.filter;
    if (flt.kind === "CoercibleFilter" && flt.field.cfJsonPath.length === 0) {
      const fld = flt.field.cfName;
      const foundRP = forestReadPlans.find((rp) => fld === (rp.relAlias ?? rp.relName));
      if (
        foundRP !== undefined && flt.opExpr.kind === "OpExpr" &&
        flt.opExpr.operation.kind === "Is" && flt.opExpr.operation.value === "TriNull"
      ) {
        return {
          kind: "CoercibleStmnt",
          filter: { kind: "CoercibleFilterNullEmbed", hasNot: flt.opExpr.negated, fld: foundRP.relAggAlias },
        };
      }
    }
    return tree;
  };
  return {
    rootLabel: { ...node.rootLabel, where_: node.rootLabel.where_.map(newNullFilters) },
    subForest: node.subForest.map(addNullEmbedFilters),
  };
}

/**
 * Ports Plan.hs addRelatedOrders: a related order term must reference an
 * embedded resource; on a to-one relationship the internal aggregate alias
 * replaces the relation name so the generated query can succeed, otherwise
 * it's RelatedOrderNotToOne (PGRST118).
 */
function addRelatedOrders(node: ReadPlanTree): ReadPlanTree {
  const { order, from } = node.rootLabel;
  const newOrder = order.map((cot): CoercibleOrderTerm => {
    if (cot.kind === "CoercibleOrderTerm") return cot;
    const found = node.subForest.find(
      (n) => cot.coRelation === (n.rootLabel.relAlias ?? n.rootLabel.relName),
    );
    if (found === undefined) throw notEmbedded(cot.coRelation);
    const { relName, relAlias, relAggAlias, relToParent } = found.rootLabel;
    const isToOne = relToParent !== null && relIsToOne(relToParent);
    if (!isToOne) throw relatedOrderNotToOne(from.name, relAlias ?? relName);
    return { ...cot, coRelation: relAggAlias };
  });
  return {
    rootLabel: { ...node.rootLabel, order: newOrder },
    subForest: node.subForest.map(addRelatedOrders),
  };
}

// --------------------------------------------------------------------------
// expandStars / addAliases / validateAggFunctions / treeRestrictRange
// --------------------------------------------------------------------------

/** Ports Plan.hs knownColumnsInContext. */
function knownColumnsInContext(ctx: ResolverContext): Column[] {
  return ctx.tables.get(qiKey(ctx.qi))?.columns ?? [];
}

/**
 * Ports Plan.hs expandStars: `select=*` becomes explicit field names when
 * data representations are present or an aggregate function is used in the
 * node or one of its ancestors.
 */
function expandStars(ctx: ResolverContext, tree: ReadPlanTree): ReadPlanTree {
  return expandStarsForReadPlan(ctx, false, tree);
}

/** Ports the expandStarsForReadPlan local of Plan.hs expandStars. */
function expandStarsForReadPlan(ctx: ResolverContext, hasAgg: boolean, node: ReadPlanTree): ReadPlanTree {
  const rp = node.rootLabel;
  const newHasAgg = hasAgg || rp.select.some((s) => s.csAggFunction !== null);
  const newCtx = adjustContext(ctx, rp.from, rp.fromAlias);
  return {
    rootLabel: expandStarsForTable(newCtx, newHasAgg, rp),
    subForest: node.subForest.map((child) => expandStarsForReadPlan(ctx, newHasAgg, child)),
  };
}

/** Ports the adjustContext local of Plan.hs expandStars: when the schema is ""
 * and the table is the source CTE, the true source table is the from alias. */
function adjustContext(ctx: ResolverContext, fromQI: QualifiedIdentifier, alias: Alias | null): ResolverContext {
  if (fromQI.schema === "" && fromQI.name === sourceCTEName && alias !== null) {
    return { ...ctx, qi: { ...ctx.qi, name: alias } };
  }
  return { ...ctx, qi: fromQI };
}

/** Ports Plan.hs expandStarsForTable. */
function expandStarsForTable(ctx: ResolverContext, hasAgg: boolean, rp: ReadPlan): ReadPlan {
  const knownColumns = knownColumnsInContext(ctx);
  // We ignore any '*' selects that have an aggregate function attached (i.e for COUNT(*)).
  const filteredSelectFields = rp.select.filter((s) => s.csAggFunction === null);
  const hasStarSelect = filteredSelectFields.some((s) => s.csField.cfName === "*");
  const hasDataRepresentation = knownColumns.some((col) =>
    ctx.representations.has(repKey(col.nominalType, ctx.outputType))
  );
  if (!hasStarSelect || !(hasAgg || hasDataRepresentation)) return rp;
  const expandStarSelectField = (sel: CoercibleSelectField): CoercibleSelectField[] => {
    if (sel.csField.cfName === "*" && sel.csField.cfJsonPath.length === 0 && sel.csAggFunction === null) {
      return knownColumns.map((col) => ({ ...sel, csField: withOutputFormat(ctx, resolveColumnField(col)) }));
    }
    return [sel];
  };
  return { ...rp, select: rp.select.flatMap(expandStarSelectField) };
}

/**
 * Ports Plan.hs addAliases: explicit aliases are always respected; an alias
 * is derived for JSON-path selects and data-representation transforms.
 */
function addAliases(tree: ReadPlanTree): ReadPlanTree {
  const aliasSelectField = (field: CoercibleSelectField): CoercibleSelectField => {
    const details = field.csField;
    if (field.csAlias !== null || field.csAggFunction !== null) return field;
    if (details.cfJsonPath.length > 0) {
      const key = lastJsonKey(details);
      return key === null ? field : { ...field, csAlias: key };
    }
    if (details.cfTransform !== null) return { ...field, csAlias: details.cfName };
    return field;
  };
  const lastJsonKey = (details: CoercibleField): string | null => {
    const last = details.cfJsonPath[details.cfJsonPath.length - 1];
    if (last === undefined) return null;
    if (last.jOp.kind === "JKey") return last.jOp.jVal;
    // On `select=data->1->mycol->>2` we show the result as [{"mycol": ..}];
    // on `select=data->3` as [{"data": ..}].
    const lastKey = [...details.cfJsonPath].reverse().find((op) => op.jOp.kind === "JKey");
    return lastKey !== undefined ? lastKey.jOp.jVal : details.cfName;
  };
  return {
    rootLabel: { ...tree.rootLabel, select: tree.rootLabel.select.map(aliasSelectField) },
    subForest: tree.subForest.map(addAliases),
  };
}

/** Ports Plan.hs validateAggFunctions — PGRST123 when disabled, on any node. */
function validateAggFunctions(aggFunctionsAllowed: boolean, tree: ReadPlanTree): ReadPlanTree {
  if (!aggFunctionsAllowed && tree.rootLabel.select.some((s) => s.csAggFunction !== null)) {
    throw aggregatesNotAllowed();
  }
  return { ...tree, subForest: tree.subForest.map((child) => validateAggFunctions(aggFunctionsAllowed, child)) };
}

/** Ports Plan.hs treeRestrictRange — enforces db-max-rows on every read node. */
function treeRestrictRange(maxRows: number | null, action: Action, tree: ReadPlanTree): ReadPlanTree {
  if (action.kind === "ActDb" && action.db.kind === "ActRelationMut") return tree;
  const nodeRestrictRange = (node: ReadPlanTree): ReadPlanTree => {
    const r = node.rootLabel.range_;
    return {
      rootLabel: { ...node.rootLabel, range_: convertToLimitZeroRange(r, restrictRange(maxRows, r)) },
      subForest: node.subForest.map(nodeRestrictRange),
    };
  };
  return nodeRestrictRange(tree);
}

// --------------------------------------------------------------------------
// Content negotiation (Plan.hs negotiateContent)
// --------------------------------------------------------------------------

/**
 * Ports SchemaCache.hs initialMediaHandlers via Plan.hs's lookupHandler.
 * Custom media handlers (CustomFunc, from the mediaHandlers introspection)
 * are deferred to phase 8/9 — `defaultSelect` only affects those lookups.
 */
function lookupHandler(mt: MediaType, _defaultSelect: boolean): ResolvedHandler | null {
  switch (mt.kind) {
    case "MTAny":
    case "MTApplicationJSON":
      return [{ kind: "BuiltinOvAggJson" }, MTApplicationJSON];
    case "MTTextCSV":
      return [{ kind: "BuiltinOvAggCsv" }, mt];
    case "MTGeoJSON":
      return [{ kind: "BuiltinOvAggGeoJson" }, mt];
    default:
      return null;
  }
}

/**
 * Ports Plan.hs negotiateContent: choose a media type from the intersection
 * of accepted/produced media types. Throws PGRST107 (406) when none matches.
 */
export function negotiateContent(
  conf: AppConfig,
  apiRequest: ApiRequest,
  accepts: MediaType[],
  defaultSelect: boolean,
): ResolvedHandler {
  const mtPlanToNothing = (x: ResolvedHandler | null): ResolvedHandler | null => (conf.dbPlanEnabled ? x : null);
  const matchMT = (mt: MediaType): ResolvedHandler | null => {
    switch (mt.kind) {
      // the vendored media types have special handling as they have media
      // type parameters; they cannot be overridden
      case "MTVndSingularJSON":
        return [{ kind: "BuiltinAggSingleJson", stripNulls: mt.stripNulls }, mt];
      case "MTVndArrayJSONStrip":
        return [{ kind: "BuiltinAggArrayJsonStrip" }, mt];
      case "MTVndPlan": {
        const inner = mt.mtFor;
        if (inner.kind === "MTVndSingularJSON") {
          return mtPlanToNothing([{ kind: "BuiltinAggSingleJson", stripNulls: inner.stripNulls }, mt]);
        }
        if (inner.kind === "MTVndArrayJSONStrip") {
          return mtPlanToNothing([{ kind: "BuiltinAggArrayJsonStrip" }, mt]);
        }
        const handler = lookupHandler(inner, defaultSelect);
        return mtPlanToNothing(handler === null ? null : [handler[0], mt]);
      }
      default:
        return lookupHandler(mt, defaultSelect);
    }
  };
  // If there are multiple accepted media types, pick the first.
  let firstAcceptedPick: ResolvedHandler | null = null;
  for (const mt of accepts) {
    const m = matchMT(mt);
    if (m !== null) {
      firstAcceptedPick = m;
      break;
    }
  }
  if (firstAcceptedPick === null) throw mediaTypeError(accepts.map(toMime));
  const act = apiRequest.iAction;
  // mutations only aggregate a body for Prefer: return=representation
  if (act.kind === "ActDb" && act.db.kind === "ActRelationMut") {
    return [
      apiRequest.iPreferences.preferRepresentation === "Full" ? firstAcceptedPick[0] : { kind: "NoAgg" },
      firstAcceptedPick[1],
    ];
  }
  // no need for an aggregate on HEAD (PostgREST/postgrest#2849)
  if (act.kind === "ActDb" && act.db.kind === "ActRelationRead" && act.db.headersOnly) {
    return [{ kind: "NoAgg" }, firstAcceptedPick[1]];
  }
  return firstAcceptedPick;
}
