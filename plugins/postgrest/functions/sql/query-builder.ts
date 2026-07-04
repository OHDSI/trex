// Ports src/PostgREST/Query/QueryBuilder.hs (PostgREST v12.2.3) — the read
// side: readPlanToQuery (incl. the LATERAL-join embedding via getJoins /
// getJoinSelects), readPlanToCountQuery (incl. the EXISTS semi-joins for
// inner-joined embeds and null-embed filters) and limitedQuery.

import type { Alias } from "../types.ts";
import type { CoercibleLogicTree, CoercibleSelectField, ReadPlanTree, RelSelectField } from "../plan/types.ts";
import { unknownField } from "../plan/types.ts";
import type { QualifiedIdentifier, Relationship } from "../schema-cache/types.ts";
import { internalError } from "../errors.ts";
import {
  fromQi,
  groupF,
  intercalateSnippet,
  limitOffsetF,
  orderF,
  pgFmtFilter,
  pgFmtIdent,
  pgFmtJoinCondition,
  pgFmtLogicTree,
  pgFmtSelectItem,
  pgFmtSpreadSelectItem,
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
