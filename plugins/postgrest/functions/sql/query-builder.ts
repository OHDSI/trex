// Ports src/PostgREST/Query/QueryBuilder.hs (PostgREST v12.2.3) — the read
// side: readPlanToQuery, readPlanToCountQuery and limitedQuery. The code
// keeps upstream's structure (joins/joinsSelects/subQueries slots) so phase 5
// can add the lateral-join embedding where the Haskell does.

import type { Alias } from "../types.ts";
import type { CoercibleSelectField, ReadPlanTree } from "../plan/types.ts";
import { unknownField } from "../plan/types.ts";
import type { QualifiedIdentifier, Relationship } from "../schema-cache/types.ts";
import {
  fromQi,
  groupF,
  intercalateSnippet,
  limitOffsetF,
  orderF,
  pgFmtIdent,
  pgFmtLogicTree,
  pgFmtSelectItem,
} from "./fragment.ts";
import { emptySnippet, snip, type Snippet } from "./builder.ts";

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
  // TODO(phase 5): getJoins / getJoinSelects lateral-join embedding.
  const joins: Snippet[] = [];
  const joinsSelects: Snippet[] = [];

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
      : snip("WHERE ", intercalateSnippet(" AND ", logicForest.map((t) => pgFmtLogicTree(qi, t)))),
    " ",
    groupF(qi, select, relSelect),
    " ",
    orderF(qi, order),
    " ",
    limitOffsetF(readRange),
  );
}

/**
 * QueryBuilder.hs readPlanToCountQuery — the COUNT query of the root node.
 * Takes only WHERE into account (no LIMIT/OFFSET, it would reduce the COUNT)
 * and does SELECT 1 to avoid computing expensive columns.
 */
export function readPlanToCountQuery(node: ReadPlanTree): Snippet {
  const { from: mainQi, fromAlias: tblAlias, where_: logicForest, relToParent: rel, relJoinConds } = node.rootLabel;
  const qi = getQualifiedIdentifier(rel, mainQi, tblAlias);
  const fromFrag = fromF(rel, mainQi, tblAlias);
  // TODO(phase 5): EXISTS subqueries for INNER-JOINed embeds and
  // CoercibleFilterNullEmbed handling (pgFmtLogicTreeCount).
  const subQueries: Snippet[] = [];
  return snip(
    "SELECT 1 ",
    fromFrag,
    logicForest.length === 0 && relJoinConds.length === 0 && subQueries.length === 0 ? emptySnippet : " WHERE ",
    intercalateSnippet(" AND ", [...logicForest.map((t) => pgFmtLogicTree(qi, t)), ...subQueries]),
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
