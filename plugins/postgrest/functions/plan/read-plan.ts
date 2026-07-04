// Ports the read side of src/PostgREST/Plan.hs (PostgREST v12.2.3):
// wrappedReadPlan / readPlan (the stage pipeline over the ReadPlanTree),
// field resolution against the schema cache (CoercibleField + data
// representations) and content negotiation (negotiateContent).
//
// Phase 4b scope: the tree is a single root node. Resource embedding
// (SelectRelation/SpreadRelation in select=) errors out with an internal
// error until phase 5; everything that upstream resolves through the tree
// (embed-path'd filters/orders/ranges/logic, related-order terms) yields the
// same NotEmbedded (PGRST108) errors as upstream does when the target is not
// embedded.

import type { ApiRequest } from "../parse/api-request.ts";
import { pRequestRange } from "../parse/query-params.ts";
import type { MediaType } from "../parse/media-type.ts";
import { MTApplicationJSON, toMime } from "../parse/media-type.ts";
import type { NonnegRange } from "../parse/range.ts";
import { allRange, convertToLimitZeroRange, restrictRange } from "../parse/range.ts";
import type { AppConfig } from "../config.ts";
import { aggregatesNotAllowed, internalError, invalidPreferences, mediaTypeError, notEmbedded } from "../errors.ts";
import type {
  Column,
  QualifiedIdentifier,
  RepresentationsMap,
  SchemaCache,
  Table,
  TablesMap,
} from "../schema-cache/types.ts";
import { qiKey, repKey } from "../schema-cache/types.ts";
import type { EmbedPath, Field, Filter, LogicTree, OrderTerm, SelectItem, Tree } from "../types.ts";
import type {
  CoercibleField,
  CoercibleFilter,
  CoercibleLogicTree,
  CoercibleOrderTerm,
  CoercibleSelectField,
  MediaHandler,
  ReadPlan,
  ReadPlanTree,
  ResolvedHandler,
} from "./types.ts";
import { unknownField } from "./types.ts";

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
function hasDefaultSelect(rPlan: ReadPlanTree): boolean {
  return rPlan.subForest.length === 0 && rPlan.rootLabel.select.length === 1 &&
    rPlan.rootLabel.select[0].csField.cfName === "*";
}

// --------------------------------------------------------------------------
// ResolverContext + field resolution (Plan.hs)
// --------------------------------------------------------------------------

/** Ports Plan.hs ResolverContext. */
interface ResolverContext {
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
function resolveTableFieldName(table: Table, fieldName: string): CoercibleField {
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
  // addRels: no-op for the read root (mutations/RPC rewrite `from` to the source CTE).
  tree = expandStars(ctx, tree);
  tree = addAliases(tree);
  tree = addRelatedOrders(tree);
  // validateSpreadEmbeds / addNullEmbedFilters / addRelSelects /
  // hoistSpreadAggFunctions: no-ops without embeddings (phase 5).
  tree = validateAggFunctions(conf.dbAggregatesEnabled, tree);
  tree = treeRestrictRange(conf.dbMaxRows, tree);
  return tree;
}

/** Ports Plan.hs initReadRequest — builds the initial single-node tree. */
function initReadRequest(ctx: ResolverContext, qsSelect: Tree<SelectItem>[]): ReadPlanTree {
  const rootDepth = 0;
  const defReadPlan: ReadPlan = {
    select: [],
    from: ctx.qi,
    fromAlias: null,
    where_: [],
    order: [],
    range_: allRange,
    relName: ctx.qi.name,
    relToParent: null,
    relJoinConds: [],
    relAlias: null,
    relAggAlias: "",
    relHint: null,
    relJoinType: null,
    relIsSpread: false,
    relSelect: [],
    depth: rootDepth,
  };
  const select: CoercibleSelectField[] = [];
  for (const node of qsSelect) {
    const si = node.rootLabel;
    if (si.kind === "SelectRelation" || si.kind === "SpreadRelation") {
      // TODO(phase 5): treeEntry recursion into embedded resources.
      throw internalError("embedding not implemented yet — phase 5");
    }
    select.push({
      csField: resolveOutputField(ctx, si.selField),
      csAggFunction: si.selAggregateFunction,
      csAggCast: si.selAggregateCast,
      csCast: si.selCast,
      csAlias: si.selAlias,
    });
  }
  return { rootLabel: { ...defReadPlan, select }, subForest: [] };
}

/**
 * Ports Plan.hs updateNode for a single-node tree: an empty embed path
 * applies `f` on the root; any non-empty path has no matching child and
 * yields NotEmbedded (PGRST108), exactly like upstream's findNode miss.
 */
function updateNode<A>(f: (a: A, tree: ReadPlanTree) => ReadPlanTree, path: EmbedPath, a: A, tree: ReadPlanTree): ReadPlanTree {
  if (path.length === 0) return f(a, tree);
  // TODO(phase 5): recurse into the sub-forest by relName/relAlias.
  throw notEmbedded(path[0]);
}

/** Ports Plan.hs addFilters. */
function addFilters(ctx: ResolverContext, apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
  // Reads take all filters (qsFilters); mutations only the non-root ones.
  const flts = apiRequest.iQueryParams.qsFilters;
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
function addFilterToLogicForest(flt: CoercibleFilter, lf: CoercibleLogicTree[]): CoercibleLogicTree[] {
  return [{ kind: "CoercibleStmnt", filter: flt }, ...lf];
}

/** Ports Plan.hs resolveFilter. */
function resolveFilter(ctx: ResolverContext, flt: Filter): CoercibleFilter {
  return { kind: "CoercibleFilter", field: resolveQueryInputField(ctx, flt.field), opExpr: flt.opExpr };
}

/** Ports Plan.hs addOrders. */
function addOrders(ctx: ResolverContext, apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
  return [...apiRequest.iQueryParams.qsOrder].reverse().reduce(
    (t, [path, terms]) =>
      updateNode(
        (o: OrderTerm[], node) => ({
          ...node,
          rootLabel: { ...node.rootLabel, order: o.map((term) => resolveOrder({ ...ctx, qi: node.rootLabel.from }, term)) },
        }),
        path,
        terms,
        t,
      ),
    tree,
  );
}

/** Ports Plan.hs resolveOrder. */
function resolveOrder(ctx: ResolverContext, term: OrderTerm): CoercibleOrderTerm {
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

/** Ports Plan.hs addRanges. */
function addRanges(apiRequest: ApiRequest, tree: ReadPlanTree): ReadPlanTree {
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
function resolveLogicTree(ctx: ResolverContext, tree: LogicTree): CoercibleLogicTree {
  if (tree.kind === "Stmnt") return { kind: "CoercibleStmnt", filter: resolveFilter(ctx, tree.filter) };
  return {
    kind: "CoercibleExpr",
    negated: tree.negated,
    op: tree.op,
    children: tree.children.map((t) => resolveLogicTree(ctx, t)),
  };
}

// --------------------------------------------------------------------------
// expandStars / addAliases / addRelatedOrders / validateAggFunctions /
// treeRestrictRange
// --------------------------------------------------------------------------

/** Ports Plan.hs knownColumnsInContext. */
function knownColumnsInContext(ctx: ResolverContext): Column[] {
  return ctx.tables.get(qiKey(ctx.qi))?.columns ?? [];
}

/**
 * Ports Plan.hs expandStars: `select=*` becomes explicit field names when
 * data representations are present or an aggregate function is used.
 */
function expandStars(ctx: ResolverContext, tree: ReadPlanTree): ReadPlanTree {
  const rp = tree.rootLabel;
  const hasAgg = rp.select.some((s) => s.csAggFunction !== null);
  // adjustContext: for reads the root `from` is the real table.
  const newCtx = { ...ctx, qi: rp.from };
  return { ...tree, rootLabel: expandStarsForTable(newCtx, hasAgg, rp) };
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
    ...tree,
    rootLabel: { ...tree.rootLabel, select: tree.rootLabel.select.map(aliasSelectField) },
  };
}

/**
 * Ports Plan.hs addRelatedOrders: a related order term must reference an
 * embedded resource — with no embeddings every one is NotEmbedded (PGRST108).
 */
function addRelatedOrders(tree: ReadPlanTree): ReadPlanTree {
  for (const term of tree.rootLabel.order) {
    if (term.kind === "CoercibleOrderRelationTerm") {
      // TODO(phase 5): resolve against the sub-forest; to-one → relAggAlias,
      // to-many → RelatedOrderNotToOne (PGRST118).
      throw notEmbedded(term.coRelation);
    }
  }
  return tree;
}

/** Ports Plan.hs validateAggFunctions — PGRST123 when disabled. */
function validateAggFunctions(aggFunctionsAllowed: boolean, tree: ReadPlanTree): ReadPlanTree {
  if (!aggFunctionsAllowed && tree.rootLabel.select.some((s) => s.csAggFunction !== null)) {
    throw aggregatesNotAllowed();
  }
  return tree;
}

/** Ports Plan.hs treeRestrictRange — enforces db-max-rows on reads. */
function treeRestrictRange(maxRows: number | null, tree: ReadPlanTree): ReadPlanTree {
  const r = tree.rootLabel.range_;
  return { ...tree, rootLabel: { ...tree.rootLabel, range_: convertToLimitZeroRange(r, restrictRange(maxRows, r)) } };
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
  // no need for an aggregate on HEAD (PostgREST/postgrest#2849)
  if (act.kind === "ActDb" && act.db.kind === "ActRelationRead" && act.db.headersOnly) {
    return [{ kind: "NoAgg" }, firstAcceptedPick[1]];
  }
  // TODO(phase 6): mutations return NoAgg unless Prefer: return=representation.
  return firstAcceptedPick;
}
