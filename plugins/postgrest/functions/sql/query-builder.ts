// Ports src/PostgREST/Query/QueryBuilder.hs (PostgREST v12.2.3):
// readPlanToQuery (incl. the LATERAL-join embedding via getJoins /
// getJoinSelects), readPlanToCountQuery (incl. the EXISTS semi-joins for
// inner-joined embeds and null-embed filters), mutatePlanToQuery
// (INSERT/upsert/PUT, UPDATE incl. the limited pgrst_affected_rows variant,
// DELETE), callPlanToQuery (RPC) and limitedQuery.

import type { Alias } from "../types.ts";
import type {
  CoercibleField,
  CoercibleLogicTree,
  CoercibleOrderTerm,
  CoercibleSelectField,
  ReadPlanTree,
  RelSelectField,
} from "../plan/types.ts";
import { unknownField } from "../plan/types.ts";
import type { MutatePlan } from "../plan/mutate-plan.ts";
import type { CallPlan } from "../plan/call-plan.ts";
import type { QualifiedIdentifier, Relationship, RoutineParam } from "../schema-cache/types.ts";
import { internalError } from "../errors.ts";
import { allRange, rangeEq } from "../parse/range.ts";
import {
  addConfigPgrstInserted,
  fromJsonBodyF,
  fromQi,
  groupF,
  intercalateSnippet,
  limitOffsetF,
  mutRangeF,
  orderF,
  pgFmtColumn,
  pgFmtFilter,
  pgFmtIdent,
  pgFmtJoinCondition,
  pgFmtLogicTree,
  pgFmtSelectItem,
  pgFmtSpreadSelectItem,
  returningF,
  singleParameter,
} from "./fragment.ts";
import { emptySnippet, snip, type Snippet, sql } from "./builder.ts";

/** QueryBuilder.hs readPlanToQuery. */
export function readPlanToQuery(node: ReadPlanTree): Snippet {
  const {
    select,
    from: mainQi,
    fromAlias,
    where_: logicForest,
    order,
    range_: readRange,
    relToParent,
    relJoinConds,
    relSelect,
  } = node.rootLabel;
  const forest = node.subForest;

  const qi = getQualifiedIdentifier(relToParent, mainQi, fromAlias);
  const fromFrag = fromF(relToParent, mainQi, fromAlias);
  // gets all the columns in case of an empty select, ignoring/obtaining these columns is done at the aggregation stage
  const defSelect: CoercibleSelectField[] = [
    { csField: unknownField("*", []), csAggFunction: null, csAggCast: null, csCast: null, csAlias: null },
  ];
  const joins = getJoins(node);
  const joinsSelects = getJoinSelects(node);

  return snip(
    "SELECT ",
    intercalateSnippet(", ", [
      ...(select.length === 0 && forest.length === 0 ? defSelect : select).map((item) => pgFmtSelectItem(qi, item)),
      ...joinsSelects,
    ]),
    " ",
    fromFrag,
    " ",
    intercalateSnippet(" ", joins),
    " ",
    logicForest.length === 0 && relJoinConds.length === 0
      ? emptySnippet
      : snip(
        "WHERE ",
        intercalateSnippet(" AND ", [
          ...logicForest.map((t) => pgFmtLogicTree(qi, t)),
          ...relJoinConds.map(pgFmtJoinCondition),
        ]),
      ),
    " ",
    groupF(qi, select, relSelect),
    " ",
    orderF(qi, order),
    " ",
    limitOffsetF(readRange),
  );
}

/** QueryBuilder.hs getJoinSelects — the embed columns of the parent SELECT. */
function getJoinSelects(node: ReadPlanTree): Snippet[] {
  const out: Snippet[] = [];
  for (const fld of node.rootLabel.relSelect) {
    const aggAlias = pgFmtIdent(fld.rsAggAlias);
    if (fld.kind === "JsonEmbed") {
      if (fld.rsEmptyEmbed) continue;
      out.push(
        fld.rsEmbedMode === "JsonObject"
          ? snip("row_to_json(", aggAlias, ".*)::jsonb AS ", pgFmtIdent(fld.rsSelName))
          : snip("COALESCE( ", aggAlias, ".", aggAlias, ", '[]') AS ", pgFmtIdent(fld.rsSelName)),
      );
    } else {
      out.push(intercalateSnippet(", ", fld.rsSpreadSel.map((s) => pgFmtSpreadSelectItem(fld.rsAggAlias, s))));
    }
  }
  return out;
}

/** QueryBuilder.hs getJoins. */
function getJoins(node: ReadPlanTree): Snippet[] {
  if (node.subForest.length === 0) return [];
  return node.rootLabel.relSelect.map((fld) => {
    const matchingNode = node.subForest.find((n) => n.rootLabel.relAggAlias === fld.rsAggAlias);
    if (matchingNode === undefined) throw internalError("no matching embed node for " + fld.rsAggAlias);
    return getJoin(fld, matchingNode);
  });
}

/** QueryBuilder.hs getJoin — one LATERAL join per embedded resource. */
function getJoin(fld: RelSelectField, node: ReadPlanTree): Snippet {
  const inner = node.rootLabel.relJoinType === "JTInner";
  const correlatedSubquery = (sub: Snippet, al: Snippet, cond: Snippet): Snippet =>
    snip(inner ? "INNER" : "LEFT", " JOIN LATERAL ( ", sub, " ) AS ", al, " ON ", cond);
  const subquery = readPlanToQuery(node);
  const aggAlias = pgFmtIdent(fld.rsAggAlias);
  if (fld.kind === "Spread" || fld.rsEmbedMode === "JsonObject") {
    return correlatedSubquery(subquery, aggAlias, sql("TRUE"));
  }
  // JsonArray
  const subq = snip("SELECT json_agg(", aggAlias, ")::jsonb AS ", aggAlias, " FROM (", subquery, " ) AS ", aggAlias);
  const condition = inner ? snip(aggAlias, " IS NOT NULL") : sql("TRUE");
  return correlatedSubquery(subq, aggAlias, condition);
}

/** The `cfName . coField` of QueryBuilder.hs mutRangeF's caller — upstream is
 * a partial record selector that crashes on order-by-relation terms. */
function coFieldName(ot: CoercibleOrderTerm): string {
  if (ot.kind !== "CoercibleOrderTerm") {
    throw internalError("limited mutations cannot order by a related table");
  }
  return ot.coField.cfName;
}

/** QueryBuilder.hs mutatePlanToQuery. */
export function mutatePlanToQuery(plan: MutatePlan): Snippet {
  switch (plan.kind) {
    case "Insert": {
      const { in_: mainQi, insCols: iCols, insBody: body, onConflict: onConflct, where_: putConditions, returning: returnings, applyDefs: applyDefaults } = plan;
      const cols = intercalateSnippet(", ", iCols.map((f) => pgFmtIdent(f.cfName)));
      const mergeDups = onConflct !== null && onConflct[0] === "MergeDuplicates";
      const pgrstBody: QualifiedIdentifier = { schema: "", name: "pgrst_body" };
      let onConflictFrag = emptySnippet;
      if (onConflct !== null && onConflct[1].length > 0) {
        const [oncDo, oncCols] = onConflct;
        const doFrag = oncDo === "IgnoreDuplicates" || iCols.length === 0
          ? sql("DO NOTHING")
          : snip(
            "DO UPDATE SET ",
            intercalateSnippet(", ", iCols.map((f) => snip(pgFmtIdent(f.cfName), " = EXCLUDED.", pgFmtIdent(f.cfName)))),
            putConditions.length === 0 && !mergeDups ? emptySnippet : snip("WHERE ", addConfigPgrstInserted(false)),
          );
        onConflictFrag = snip(" ON CONFLICT(", intercalateSnippet(", ", oncCols.map(pgFmtIdent)), ") ", doFrag);
      }
      return snip(
        "INSERT INTO ",
        fromQi(mainQi),
        iCols.length === 0 ? " " : snip("(", cols, ") "),
        fromJsonBodyF(body, iCols, true, false, applyDefaults),
        // Only used for PUT
        putConditions.length === 0 ? emptySnippet : snip(
          "WHERE ",
          addConfigPgrstInserted(true),
          " AND ",
          intercalateSnippet(" AND ", putConditions.map((t) => pgFmtLogicTree(pgrstBody, t))),
        ),
        putConditions.length === 0 && mergeDups ? snip("WHERE ", addConfigPgrstInserted(true)) : emptySnippet,
        onConflictFrag,
        " ",
        returningF(mainQi, returnings),
      );
    }

    // An update without a limit is always filtered with a WHERE
    case "Update": {
      const { in_: mainQi, updCols: uCols, updBody: body, where_: logicForest, mutRange: range, mutOrder: ordts, returning: returnings, applyDefs: applyDefaults } = plan;
      const whereLogic = logicForest.length === 0
        ? emptySnippet
        : snip(" WHERE ", intercalateSnippet(" AND ", logicForest.map((t) => pgFmtLogicTree(mainQi, t))));
      const mainTbl = fromQi(mainQi);

      if (uCols.length === 0) {
        // if there are no columns we cannot do UPDATE table SET {empty}, it'd be invalid syntax
        // selecting an empty resultset from mainQi gives us the column names to prevent errors when using &select=
        // the select has to be based on "returnings" to make computed overloaded functions not throw
        const emptyBodyReturnedColumns = returnings.length === 0
          ? sql("NULL")
          : intercalateSnippet(", ", returnings.map((r) => pgFmtColumn({ schema: "", name: mainQi.name }, r)));
        return snip("SELECT ", emptyBodyReturnedColumns, " FROM ", fromQi(mainQi), " WHERE false");
      }

      if (rangeEq(range, allRange)) {
        const nonRangeCols = intercalateSnippet(
          ", ",
          uCols.map((f) => snip(pgFmtIdent(f.cfName), " = ", pgFmtColumn({ schema: "", name: "pgrst_body" }, f.cfName))),
        );
        return snip(
          "UPDATE ",
          mainTbl,
          " SET ",
          nonRangeCols,
          " ",
          fromJsonBodyF(body, uCols, false, false, applyDefaults),
          whereLogic,
          " ",
          returningF(mainQi, returnings),
        );
      }

      const rangeCols = intercalateSnippet(
        ", ",
        uCols.map((col) => snip(pgFmtIdent(col.cfName), " = (SELECT ", pgFmtIdent(col.cfName), " FROM pgrst_update_body) ")),
      );
      const [whereRangeIdF, rangeIdF] = mutRangeF(mainQi, ordts.map(coFieldName));
      return snip(
        "WITH ",
        "pgrst_update_body AS (",
        fromJsonBodyF(body, uCols, true, true, applyDefaults),
        "), ",
        "pgrst_affected_rows AS (",
        "SELECT ",
        rangeIdF,
        " FROM ",
        mainTbl,
        whereLogic,
        " ",
        orderF(mainQi, ordts),
        " ",
        limitOffsetF(range),
        ") ",
        "UPDATE ",
        mainTbl,
        " SET ",
        rangeCols,
        "FROM pgrst_affected_rows ",
        "WHERE ",
        whereRangeIdF,
        " ",
        returningF(mainQi, returnings),
      );
    }

    case "Delete": {
      const { in_: mainQi, where_: logicForest, mutRange: range, mutOrder: ordts, returning: returnings } = plan;
      const whereLogic = logicForest.length === 0
        ? emptySnippet
        : snip(" WHERE ", intercalateSnippet(" AND ", logicForest.map((t) => pgFmtLogicTree(mainQi, t))));

      if (rangeEq(range, allRange)) {
        return snip("DELETE FROM ", fromQi(mainQi), " ", whereLogic, " ", returningF(mainQi, returnings));
      }

      const [whereRangeIdF, rangeIdF] = mutRangeF(mainQi, ordts.map(coFieldName));
      return snip(
        "WITH ",
        "pgrst_affected_rows AS (",
        "SELECT ",
        rangeIdF,
        " FROM ",
        fromQi(mainQi),
        whereLogic,
        " ",
        orderF(mainQi, ordts),
        " ",
        limitOffsetF(range),
        ") ",
        "DELETE FROM ",
        fromQi(mainQi),
        " ",
        "USING pgrst_affected_rows ",
        "WHERE ",
        whereRangeIdF,
        " ",
        returningF(mainQi, returnings),
      );
    }
  }
}

/**
 * QueryBuilder.hs callPlanToQuery — the pgrst_source CTE body of an RPC call:
 * the function call (optionally LATERAL over the fromJsonBodyF args CTE for
 * named parameters) with scalar/setof-scalar returns wrapped in a
 * pgrst_scalar column.
 *
 * Deviation from upstream: the `pgVer < pgVersion130 && pgVer >= pgVersion110
 * && returnsCompositeAlias` callIt branch (`(SELECT (fn(..)).*) pgrst_call`)
 * is dropped — trex targets modern PostgreSQL (>= 13), like the schema-cache
 * introspection queries.
 */
export function callPlanToQuery(plan: CallPlan): Snippet {
  const {
    funCQi: qi,
    funCParams: params,
    funCArgs: args,
    funCScalar: returnsScalar,
    funCSetOfScalar: returnsSetOfScalar,
    funCReturning: returnings,
  } = plan;

  const callIt = (argument: Snippet): Snippet =>
    returnsScalar || returnsSetOfScalar
      ? snip("(SELECT ", fromQi(qi), "(", argument, ") pgrst_scalar) pgrst_call")
      : snip(fromQi(qi), "(", argument, ") pgrst_call");

  const fmtParams = (prms: RoutineParam[]): Snippet =>
    intercalateSnippet(
      ", ",
      prms.map((a) =>
        snip(a.variadic ? "VARIADIC " : "", pgFmtIdent(a.name), " := pgrst_body.", pgFmtIdent(a.name))
      ),
    );

  const returnedColumns: Snippet = returnings.length === 0
    ? sql("*")
    : intercalateSnippet(", ", returnings.map((r) => pgFmtColumn({ schema: "", name: "pgrst_call" }, r)));

  const fromCall: Snippet = params.kind === "OnePosParam"
    ? snip("FROM ", callIt(singleParameter(args, params.param.type)))
    : params.params.length === 0
    ? snip("FROM ", callIt(emptySnippet))
    : snip(
      fromJsonBodyF(
        args,
        params.params.map((p): CoercibleField => ({
          cfName: p.name,
          cfJsonPath: [],
          cfToJson: false,
          cfIRType: p.typeMaxLength,
          cfTransform: null,
          cfDefault: null,
        })),
        false,
        true,
        false,
      ),
      ", ",
      "LATERAL ",
      callIt(fmtParams(params.params)),
    );

  return snip(
    "SELECT ",
    returnsScalar || returnsSetOfScalar ? sql("pgrst_call.pgrst_scalar") : returnedColumns,
    " ",
    fromCall,
  );
}

/**
 * QueryBuilder.hs readPlanToCountQuery — the COUNT query of the root node.
 * It only takes WHERE into account and doesn't include LIMIT/OFFSET (it would
 * reduce the COUNT); SELECT 1 avoids computing expensive columns. If the
 * request contains INNER JOINs the COUNT of the root node changes, so a WHERE
 * EXISTS is used instead of an INNER JOIN on the count query
 * (PostgREST/postgrest#2009).
 */
export function readPlanToCountQuery(node: ReadPlanTree): Snippet {
  const { from: mainQi, fromAlias: tblAlias, where_: logicForest, relToParent: rel, relJoinConds } = node.rootLabel;
  const forest = node.subForest;
  const qi = getQualifiedIdentifier(rel, mainQi, tblAlias);
  const fromFrag = fromF(rel, mainQi, tblAlias);
  const findNullEmbedRel = (fld: string): ReadPlanTree | undefined =>
    forest.find((n) => n.rootLabel.relAggAlias === fld);

  // https://github.com/PostgREST/postgrest/pull/2930#discussion_r1325293698
  const pgFmtLogicTreeCount = (qiCount: QualifiedIdentifier, tree: CoercibleLogicTree): Snippet => {
    if (tree.kind === "CoercibleExpr") {
      const opSql = tree.op === "And" ? " AND " : " OR ";
      return snip(
        tree.negated ? "NOT" : "",
        " (",
        intercalateSnippet(opSql, tree.children.map((t) => pgFmtLogicTreeCount(qiCount, t))),
        ")",
      );
    }
    if (tree.filter.kind === "CoercibleFilterNullEmbed") {
      const embedNode = findNullEmbedRel(tree.filter.fld);
      if (embedNode === undefined) return emptySnippet;
      return snip(tree.filter.hasNot ? "" : "NOT ", "EXISTS (", readPlanToCountQuery(embedNode), ")");
    }
    return pgFmtFilter(qiCount, tree.filter);
  };

  const subQueries = forest
    .filter((n) => n.rootLabel.relJoinType === "JTInner")
    .map((n) => snip("EXISTS (", readPlanToCountQuery(n), " )"));
  return snip(
    "SELECT 1 ",
    fromFrag,
    logicForest.length === 0 && relJoinConds.length === 0 && subQueries.length === 0 ? emptySnippet : " WHERE ",
    intercalateSnippet(" AND ", [
      ...logicForest.map((t) => pgFmtLogicTreeCount(qi, t)),
      ...relJoinConds.map(pgFmtJoinCondition),
      ...subQueries,
    ]),
  );
}

/** QueryBuilder.hs limitedQuery. */
export function limitedQuery(query: Snippet, maxRows: number | null): Snippet {
  return maxRows === null ? query : snip(query, ` LIMIT ${maxRows}`);
}

/** QueryBuilder.hs getQualifiedIdentifier. */
function getQualifiedIdentifier(
  rel: Relationship | null,
  mainQi: QualifiedIdentifier,
  tblAlias: Alias | null,
): QualifiedIdentifier {
  if (rel !== null && rel.kind === "computed") {
    return { schema: "", name: tblAlias ?? rel.function.name };
  }
  return tblAlias === null ? mainQi : { schema: "", name: tblAlias };
}

/** QueryBuilder.hs fromF — FROM clause plus implicit joins. */
function fromF(rel: Relationship | null, mainQi: QualifiedIdentifier, tblAlias: Alias | null): Snippet {
  const target = rel !== null && rel.kind === "computed"
    ? snip(fromQi(rel.function), "(", pgFmtIdent(rel.tableAlias.name), "::", fromQi(rel.table), ")")
    : fromQi(mainQi);
  const junction = rel !== null && rel.kind === "fk" && rel.cardinality.tag === "M2M"
    ? snip(", ", fromQi(rel.cardinality.junction.table))
    : emptySnippet;
  return snip("FROM ", target, tblAlias === null ? emptySnippet : snip(" AS ", pgFmtIdent(tblAlias)), junction);
}
