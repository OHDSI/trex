// Ports src/PostgREST/Query/SqlFragment.hs (PostgREST v12.2.3) — the read
// path: identifier/literal escaping, field/filter/logic-tree/order-term
// formatting, the media-type body aggregations (asJsonF/asCsvF/...) and the
// LIMIT/OFFSET and EXPLAIN helpers. Function and constructor names are kept.

import type {
  AggregateFunction,
  Alias,
  Cast,
  FtsOperator,
  JsonPath,
  LogicOperator,
  Operation,
  OpQuantifier,
  QuantOperator,
  SimpleOperator,
  TrileanVal,
} from "../types.ts";
import type { MTVndPlanFormat, MTVndPlanOption } from "../parse/media-type.ts";
import type {
  CoercibleField,
  CoercibleFilter,
  CoercibleLogicTree,
  CoercibleOrderTerm,
  CoercibleSelectField,
  MediaHandler,
  RelSelectField,
} from "../plan/types.ts";
import { unknownField } from "../plan/types.ts";
import type { QualifiedIdentifier } from "../schema-cache/types.ts";
import { escapeIdent } from "../query/fragments.ts";
import { allRange, type NonnegRange, rangeEq, rangeLimit, rangeOffset } from "../parse/range.ts";
import { emptySnippet, intercalateSnippet, param, snip, Snippet, sql } from "./builder.ts";

export { intercalateSnippet };

/** SqlFragment.hs sourceCTEName. */
export const sourceCTEName = "pgrst_source";

/** SqlFragment.hs sourceCTE. */
export const sourceCTE: Snippet = sql("pgrst_source");

/** SqlFragment.hs simpleOperator — the SQL operator table. */
function simpleOperator(op: SimpleOperator): string {
  switch (op) {
    case "OpNotEqual":
      return "<>";
    case "OpContains":
      return "@>";
    case "OpContained":
      return "<@";
    case "OpOverlap":
      return "&&";
    case "OpStrictlyLeft":
      return "<<";
    case "OpStrictlyRight":
      return ">>";
    case "OpNotExtendsRight":
      return "&<";
    case "OpNotExtendsLeft":
      return "&>";
    case "OpAdjacent":
      return "-|-";
  }
}

/** SqlFragment.hs quantOperator. */
function quantOperator(op: QuantOperator): string {
  switch (op) {
    case "OpEqual":
      return "=";
    case "OpGreaterThanEqual":
      return ">=";
    case "OpGreaterThan":
      return ">";
    case "OpLessThanEqual":
      return "<=";
    case "OpLessThan":
      return "<";
    case "OpLike":
      return "like";
    case "OpILike":
      return "ilike";
    case "OpMatch":
      return "~";
    case "OpIMatch":
      return "~*";
  }
}

/** SqlFragment.hs ftsOperator. */
function ftsOperator(op: FtsOperator): string {
  switch (op) {
    case "FilterFts":
      return "@@ to_tsquery";
    case "FilterFtsPlain":
      return "@@ plainto_tsquery";
    case "FilterFtsPhrase":
      return "@@ phraseto_tsquery";
    case "FilterFtsWebsearch":
      return "@@ websearch_to_tsquery";
  }
}

/** SqlFragment.hs trimNullChars. */
function trimNullChars(x: string): string {
  const nul = x.indexOf("\0");
  return nul === -1 ? x : x.slice(0, nul);
}

/**
 * SqlFragment.hs pgBuildArrayLiteral — the pg array literal for ANY(),
 * e.g. '{"Hebdon, John","Other"}', built manually so an "unknown" parameter
 * can be passed and pg infers the element type.
 */
export function pgBuildArrayLiteral(vals: string[]): string {
  const escaped = (x: string): string => {
    const slashed = trimNullChars(x).replaceAll("\\", "\\\\");
    return `"${slashed.replaceAll('"', '\\"')}"`;
  };
  return `{${vals.map(escaped).join(",")}}`;
}

/** SqlFragment.hs pgFmtIdent. */
export function pgFmtIdent(x: string): Snippet {
  return sql(escapeIdent(x));
}

/** SqlFragment.hs pgFmtLit — only for values that come from the database itself. */
export function pgFmtLit(x: string): string {
  const trimmed = trimNullChars(x);
  const escaped = `'${trimmed.replaceAll("'", "''")}'`;
  const slashed = escaped.replaceAll("\\", "\\\\");
  return escaped.includes("\\") ? `E${slashed}` : slashed;
}

/** SqlFragment.hs unknownEncoder — a parameter bound with the unknown type. */
export const unknownEncoder = param;

/** SqlFragment.hs unknownLiteral. */
export const unknownLiteral = param;

/** SqlFragment.hs fromQi (Snippet version; query/fragments.ts has the string one). */
export function fromQi(t: QualifiedIdentifier): Snippet {
  return snip(t.schema === "" ? emptySnippet : snip(pgFmtIdent(t.schema), "."), pgFmtIdent(t.name));
}

/** SqlFragment.hs pgFmtColumn. */
export function pgFmtColumn(table: QualifiedIdentifier, c: string): Snippet {
  if (c === "*") return snip(fromQi(table), ".*");
  return snip(fromQi(table), ".", pgFmtIdent(c));
}

/** SqlFragment.hs pgFmtCallUnary. */
function pgFmtCallUnary(f: string, x: Snippet): Snippet {
  return snip(f, "(", x, ")");
}

/** SqlFragment.hs pgFmtJsonPath — `->'key'` / `->>2::int` rendering. */
export function pgFmtJsonPath(path: JsonPath): Snippet {
  const pgFmtJsonOperand = (op: JsonPath[number]["jOp"]): Snippet =>
    op.kind === "JKey" ? unknownLiteral(op.jVal) : snip(unknownLiteral(op.jVal), "::int");
  return snip(
    ...path.map((step) => snip(step.kind === "JArrow" ? "->" : "->>", pgFmtJsonOperand(step.jOp))),
  );
}

/** SqlFragment.hs pgFmtField — json/jsonb columns skip the to_jsonb wrap. */
export function pgFmtField(table: QualifiedIdentifier, fld: CoercibleField): Snippet {
  if (fld.cfJsonPath.length === 0) return pgFmtColumn(table, fld.cfName);
  if (fld.cfToJson) return snip("to_jsonb(", pgFmtColumn(table, fld.cfName), ")", pgFmtJsonPath(fld.cfJsonPath));
  return snip(pgFmtColumn(table, fld.cfName), pgFmtJsonPath(fld.cfJsonPath));
}

/** SqlFragment.hs pgFmtTableCoerce — applies the output data representation. */
function pgFmtTableCoerce(table: QualifiedIdentifier, fld: CoercibleField): Snippet {
  if (fld.cfTransform !== null) return pgFmtCallUnary(fld.cfTransform, pgFmtField(table, fld));
  return pgFmtField(table, fld);
}

/** SqlFragment.hs pgFmtAs. */
function pgFmtAs(alias: Alias | null): Snippet {
  return alias === null ? emptySnippet : snip(" AS ", pgFmtIdent(alias));
}

/** SqlFragment.hs pgFmtApplyCast — CAST( x AS t ), unquoted cast (validated by the parsers). */
function pgFmtApplyCast(cast: Cast | null, snippet: Snippet): Snippet {
  if (cast === null) return snippet;
  return snip("CAST( ", snippet, " AS ", cast, " )");
}

/** SqlFragment.hs pgFmtApplyAggregate — SUM(x), COUNT(x)::cast forms. */
export function pgFmtApplyAggregate(agg: AggregateFunction | null, aggCast: Cast | null, snippet: Snippet): Snippet {
  if (agg === null) return snippet;
  const aggregatedSnippet = snip(agg.toUpperCase(), "(", snippet, ")");
  return pgFmtApplyCast(aggCast, aggregatedSnippet);
}

/** SqlFragment.hs pgFmtSelectItem. */
export function pgFmtSelectItem(table: QualifiedIdentifier, item: CoercibleSelectField): Snippet {
  const { csField: fld, csAggFunction: agg, csAggCast: aggCast, csCast: cast, csAlias: alias } = item;
  return snip(pgFmtApplyAggregate(agg, aggCast, pgFmtApplyCast(cast, pgFmtTableCoerce(table, fld))), pgFmtAs(alias));
}

/** SqlFragment.hs pgFmtOrderTerm. */
export function pgFmtOrderTerm(qi: QualifiedIdentifier, ot: CoercibleOrderTerm): Snippet {
  const fmtOTerm = ot.kind === "CoercibleOrderTerm"
    ? pgFmtField(qi, ot.coField)
    : pgFmtField({ schema: "", name: ot.coRelation }, unknownField(ot.coRelTerm.name, ot.coRelTerm.jsonPath));
  const direction = ot.coDirection === null ? "" : ot.coDirection === "OrderAsc" ? "ASC" : "DESC";
  const nullOrder = ot.coNullOrder === null ? "" : ot.coNullOrder === "OrderNullsFirst" ? "NULLS FIRST" : "NULLS LAST";
  // BS.unwords over the two (possibly empty) words, as upstream
  return snip(fmtOTerm, " ", [direction, nullOrder].join(" "));
}

/** SqlFragment.hs pgFmtUnknownLiteralForField — apply the parse transform, if any. */
function pgFmtUnknownLiteralForField(value: Snippet, fld: CoercibleField): Snippet {
  if (fld.cfTransform !== null) return pgFmtCallUnary(fld.cfTransform, value);
  return value;
}

/** SqlFragment.hs pgFmtArrayLiteralForField — the ANY() array literal, transform-mapped via unnest. */
function pgFmtArrayLiteralForField(values: string[], fld: CoercibleField): Snippet {
  if (fld.cfTransform !== null) {
    return snip(
      "(SELECT ",
      pgFmtCallUnary(fld.cfTransform, snip("unnest(", unknownLiteral(pgBuildArrayLiteral(values)), "::text[])")),
      ")",
    );
  }
  return unknownLiteral(pgBuildArrayLiteral(values));
}

/** SqlFragment.hs pgFmtFilter — every Operation kind of the read path. */
export function pgFmtFilter(table: QualifiedIdentifier, filter: CoercibleFilter): Snippet {
  if (filter.kind === "CoercibleFilterNullEmbed") {
    return snip(pgFmtIdent(filter.fld), " IS ", filter.hasNot ? "" : "NOT ", "DISTINCT FROM NULL");
  }
  const { field: fld, opExpr } = filter;
  if (opExpr.kind === "NoOpExpr") return emptySnippet; // filtered out at QueryParams level
  const { negated: hasNot, operation: oper } = opExpr;
  const notOp = hasNot ? "NOT" : "";
  const star = (s: string): string => s.replaceAll("*", "%");
  const fmtQuant = (q: OpQuantifier | null, val: Snippet): Snippet => {
    if (q === "QuantAny") return snip("ANY(", val, ")");
    if (q === "QuantAll") return snip("ALL(", val, ")");
    return val;
  };
  const operFrag = ((op: Operation): Snippet => {
    switch (op.kind) {
      case "Op":
        return snip(" ", simpleOperator(op.op), " ", pgFmtUnknownLiteralForField(unknownLiteral(op.value), fld));
      case "OpQuant": {
        const val = op.op === "OpLike" || op.op === "OpILike"
          ? fmtQuant(op.quantifier, unknownLiteral(star(op.value)))
          : fmtQuant(op.quantifier, pgFmtUnknownLiteralForField(unknownLiteral(op.value), fld));
        return snip(" ", quantOperator(op.op), " ", val);
      }
      // IS cannot be prepared, so the operands are whitelisted at the Parsers level
      case "Is":
        return snip(" IS ", triVal(op.value));
      case "IsDistinctFrom":
        return snip(" IS DISTINCT FROM ", unknownLiteral(op.value));
      // "= ANY" instead of IN: allows the empty case and a single prepared statement
      case "In": {
        if (op.value.length === 1 && op.value[0] === "") return snip(" ", "= ANY('{}') ");
        return snip(" ", "= ANY (", pgFmtArrayLiteralForField(op.value, fld), ") ");
      }
      case "Fts": {
        const ftsLang = op.language === null ? emptySnippet : snip(unknownLiteral(op.language), ", ");
        return snip(" ", ftsOperator(op.op), "(", ftsLang, unknownLiteral(op.value), ") ");
      }
    }
  })(oper);
  return snip(notOp, " ", pgFmtField(table, fld), operFrag);
}

function triVal(v: TrileanVal): string {
  switch (v) {
    case "TriTrue":
      return "TRUE";
    case "TriFalse":
      return "FALSE";
    case "TriNull":
      return "NULL";
    case "TriUnknown":
      return "UNKNOWN";
  }
}

/** SqlFragment.hs pgFmtLogicTree — AND/OR nesting with parens and NOT. */
export function pgFmtLogicTree(qi: QualifiedIdentifier, tree: CoercibleLogicTree): Snippet {
  if (tree.kind === "CoercibleStmnt") return pgFmtFilter(qi, tree.filter);
  const opSql = (op: LogicOperator): string => (op === "And" ? " AND " : " OR ");
  const notOp = tree.negated ? "NOT" : "";
  return snip(notOp, " (", intercalateSnippet(opSql(tree.op), tree.children.map((t) => pgFmtLogicTree(qi, t))), ")");
}

/** SqlFragment.hs groupF — GROUP BY when aggregates are present. */
export function groupF(qi: QualifiedIdentifier, select: CoercibleSelectField[], relSelect: RelSelectField[]): Snippet {
  const noSelectsAreAggregated = !select.some((s) => s.csAggFunction !== null);
  const noRelSelectsAreAggregated = relSelect.every(
    (r) => r.kind !== "Spread" || r.rsSpreadSel.every((s) => s.ssSelAggFunction === null),
  );
  const groupTermsFromSelect = select
    .map((s) => pgFmtGroup(qi, s))
    .filter((s): s is Snippet => s !== null);
  const groupTermsFromRelSelect = relSelect
    .map(groupTermFromRelSelectField)
    .filter((s): s is Snippet => s !== null);
  const groupTerms = [...groupTermsFromSelect, ...groupTermsFromRelSelect];
  if ((noSelectsAreAggregated && noRelSelectsAreAggregated) || groupTerms.length === 0) return emptySnippet;
  return snip(" GROUP BY ", intercalateSnippet(", ", groupTerms));
}

/** SqlFragment.hs groupTermFromRelSelectField. */
function groupTermFromRelSelectField(rs: RelSelectField): Snippet | null {
  if (rs.kind === "JsonEmbed") return pgFmtIdent(rs.rsSelName);
  const groupTerms = rs.rsSpreadSel
    .filter((s) => s.ssSelAggFunction === null)
    .map((s) => snip(pgFmtIdent(rs.rsAggAlias), ".", pgFmtIdent(s.ssSelAlias ?? s.ssSelName)));
  if (groupTerms.length === 0) return null;
  return intercalateSnippet(", ", groupTerms);
}

/** SqlFragment.hs pgFmtGroup. */
function pgFmtGroup(qi: QualifiedIdentifier, s: CoercibleSelectField): Snippet | null {
  if (s.csAggFunction !== null) return null;
  if (s.csAlias !== null) return pgFmtIdent(s.csAlias);
  return pgFmtField(qi, s.csField);
}

/** SqlFragment.hs countF — the count CTE and its result fragment. */
export function countF(countQuery: Snippet, shouldCount: boolean): [Snippet, Snippet] {
  if (shouldCount) {
    return [
      snip(", pgrst_source_count AS (", countQuery, ")"),
      sql("(SELECT pg_catalog.count(*) FROM pgrst_source_count)"),
    ];
  }
  return [emptySnippet, sql("null::bigint")];
}

/** SqlFragment.hs limitOffsetF. */
export function limitOffsetF(range: NonnegRange): Snippet {
  if (rangeEq(range, allRange)) return emptySnippet;
  const lim = rangeLimit(range);
  const limit = lim === null ? sql("ALL") : unknownEncoder(String(lim));
  const offset = unknownEncoder(String(rangeOffset(range)));
  return snip("LIMIT ", limit, " OFFSET ", offset);
}

/** SqlFragment.hs currentSettingF. */
function currentSettingF(setting: string): Snippet {
  // nullif is used because of https://gist.github.com/steve-chavez/8d7033ea5655096903f3b52f8ed09a15
  return sql(`nullif(current_setting('${setting}', true), '')`);
}

/** SqlFragment.hs responseHeadersF. */
export const responseHeadersF: Snippet = currentSettingF("response.headers");

/** SqlFragment.hs responseStatusF. */
export const responseStatusF: Snippet = currentSettingF("response.status");

/** SqlFragment.hs orderF. */
export function orderF(qi: QualifiedIdentifier, ordts: CoercibleOrderTerm[]): Snippet {
  if (ordts.length === 0) return emptySnippet;
  return snip("ORDER BY ", intercalateSnippet(", ", ordts.map((ot) => pgFmtOrderTerm(qi, ot))));
}

/** SqlFragment.hs explainF. */
export function explainF(fmt: MTVndPlanFormat, opts: MTVndPlanOption[], snippet: Snippet): Snippet {
  const fmtPlanOpt = (o: MTVndPlanOption): string => {
    switch (o) {
      case "PlanAnalyze":
        return "ANALYZE";
      case "PlanVerbose":
        return "VERBOSE";
      case "PlanSettings":
        return "SETTINGS";
      case "PlanBuffers":
        return "BUFFERS";
      case "PlanWAL":
        return "WAL";
    }
  };
  const fmtPlanFmt = fmt === "PlanText" ? "FORMAT TEXT" : "FORMAT JSON";
  return snip("EXPLAIN (", [fmtPlanFmt, ...opts.map(fmtPlanOpt)].join(", "), ") ", snippet);
}

// --------------------------------------------------------------------------
// Media-type body aggregations
// --------------------------------------------------------------------------

/** SqlFragment.hs asCsvF — header row from json_object_keys + body rows with
 * the wrapping braces of each row_to_json stripped. */
const asCsvF: Snippet = (() => {
  const asCsvHeaderF = snip(
    "(SELECT coalesce(string_agg(a.k, ','), '')",
    "  FROM (",
    "    SELECT json_object_keys(r)::text as k",
    "    FROM ( ",
    "      SELECT row_to_json(hh) as r from ",
    sourceCTE,
    " as hh limit 1",
    "    ) s",
    "  ) a",
    ")",
  );
  const asCsvBodyF = "coalesce(string_agg(substring(_postgrest_t::text, 2, length(_postgrest_t::text) - 2), '\n'), '')";
  return snip(asCsvHeaderF, " || '\n' || ", asCsvBodyF);
})();

/** SqlFragment.hs addNullsToSnip. */
function addNullsToSnip(strip: boolean, s: Snippet): Snippet {
  return strip ? snip("json_strip_nulls(", s, ")") : s;
}

/** SqlFragment.hs asJsonSingleF (reads have no Routine, so no pgrst_scalar case). */
function asJsonSingleF(strip: boolean): Snippet {
  return snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t)->0")), ", 'null')");
}

/** SqlFragment.hs asJsonF (reads have no Routine, so no scalar/composite cases). */
function asJsonF(strip: boolean): Snippet {
  return snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t)")), ", '[]')");
}

/** SqlFragment.hs asGeoJsonF. */
const asGeoJsonF: Snippet = sql(
  "json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(ST_AsGeoJSON(_postgrest_t)::json), '[]'))",
);

/** SqlFragment.hs handlerF — the body aggregation per resolved media handler. */
export function handlerF(handler: MediaHandler): Snippet {
  switch (handler.kind) {
    case "BuiltinAggArrayJsonStrip":
      return asJsonF(true);
    case "BuiltinAggSingleJson":
      return asJsonSingleF(handler.stripNulls);
    case "BuiltinOvAggJson":
      return asJsonF(false);
    case "BuiltinOvAggGeoJson":
      return asGeoJsonF;
    case "BuiltinOvAggCsv":
      return asCsvF;
    case "NoAgg":
      return sql("''::text");
  }
}
