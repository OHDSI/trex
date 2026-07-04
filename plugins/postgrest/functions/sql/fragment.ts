// Ports src/PostgREST/Query/SqlFragment.hs (PostgREST v12.2.3):
// identifier/literal escaping, field/filter/logic-tree/order-term formatting,
// the media-type body aggregations (asJsonF/asCsvF/...), the LIMIT/OFFSET and
// EXPLAIN helpers, and the mutation fragments (fromJsonBodyF, locationF,
// returningF, mutRangeF, addConfigPgrstInserted). Names are kept.

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
  JoinCondition,
  MediaHandler,
  RelSelectField,
  SpreadSelectField,
} from "../plan/types.ts";
import { unknownField } from "../plan/types.ts";
import type { QualifiedIdentifier, Routine } from "../schema-cache/types.ts";
import {
  funcReturnsScalar,
  funcReturnsSetOfScalar,
  funcReturnsSingleComposite,
} from "../schema-cache/types.ts";
import { escapeIdent } from "../query/fragments.ts";
import { allRange, type NonnegRange, rangeEq, rangeLimit, rangeOffset } from "../parse/range.ts";
import { emptySnippet, intercalateSnippet, param, snip, Snippet, sql } from "./builder.ts";

export { intercalateSnippet };

/** SqlFragment.hs sourceCTEName. */
export const sourceCTEName = "pgrst_source";

/** SqlFragment.hs sourceCTE. */
export const sourceCTE: Snippet = sql("pgrst_source");

/** SqlFragment.hs noLocationF. */
export const noLocationF: Snippet = sql("array[]::text[]");

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

/**
 * SqlFragment.hs singleParameter — the single positional argument of an
 * OnePosParam RPC call, cast to the parameter's type.
 *
 * Deviation from upstream: Hasql special-cases bytea with a typed encoder
 * (HE.bytea) because HE.unknown fails on it; node-postgres always sends text
 * parameters, so bytea goes through the same `$n::bytea` text cast (the body
 * must be in pg's hex/escape input format — raw octet-stream is phase 8).
 */
export function singleParameter(body: string | null, typ: string): Snippet {
  return snip(param(body), "::", typ);
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

/** SqlFragment.hs pgFmtCoerceNamed — like the previous but we just have a
 * name, so no namespace or JSON paths. */
export function pgFmtCoerceNamed(fld: CoercibleField): Snippet {
  if (fld.cfTransform !== null) {
    return snip(pgFmtCallUnary(fld.cfTransform, pgFmtIdent(fld.cfName)), " AS ", pgFmtIdent(fld.cfName));
  }
  return pgFmtIdent(fld.cfName);
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

/** SqlFragment.hs pgFmtSpreadSelectItem — a spread field through the join alias. */
export function pgFmtSpreadSelectItem(aggAlias: Alias, item: SpreadSelectField): Snippet {
  const { ssSelName, ssSelAggFunction, ssSelAggCast, ssSelAlias } = item;
  const fullSelName = ssSelName === "*"
    ? snip(pgFmtIdent(aggAlias), ".*")
    : snip(pgFmtIdent(aggAlias), ".", pgFmtIdent(ssSelName));
  return snip(pgFmtApplyAggregate(ssSelAggFunction, ssSelAggCast, fullSelName), pgFmtAs(ssSelAlias));
}

/** SqlFragment.hs pgFmtJoinCondition. */
export function pgFmtJoinCondition(jc: JoinCondition): Snippet {
  const [qi1, col1] = jc.left;
  const [qi2, col2] = jc.right;
  return snip(pgFmtColumn(qi1, col1), " = ", pgFmtColumn(qi2, col2));
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

/**
 * SqlFragment.hs locationF — key/value bindings ("pk=eq.42" / "pk=is.null")
 * for the Location header, read from the first row of the mutation CTE. The
 * text (incl. whitespace) matches the upstream quasiquote; pk names come
 * from the schema cache and are interpolated unescaped, like upstream.
 */
export function locationF(pKeys: string[]): Snippet {
  const fmtPKeys = pKeys.join("','");
  return sql(`(
  WITH data AS (SELECT row_to_json(_) AS row FROM ${sourceCTEName} AS _ LIMIT 1)
  SELECT array_agg(json_data.key || '=' || coalesce('eq.' || json_data.value, 'is.null'))
  FROM data CROSS JOIN json_each_text(data.row) AS json_data
  WHERE json_data.key IN ('${fmtPKeys}')
)`);
}

/**
 * SqlFragment.hs fromJsonBodyF — the pgrst_payload / pgrst_json_defs /
 * pgrst_body CTE chain that turns the json body parameter into typed rows
 * (json_to_record(set), or jsonb_to_record(set) with missing=default where
 * the column defaults are jsonb-merged in first).
 *
 * Deviation from upstream: Hasql binds the body with a typed json(b) encoder;
 * node-postgres sends untyped text, so the placeholder gets an explicit
 * ::json / ::jsonb cast.
 */
export function fromJsonBodyF(
  body: string | null,
  fields: CoercibleField[],
  includeSelect: boolean,
  includeLimitOne: boolean,
  includeDefaults: boolean,
): Snippet {
  const namedCols = intercalateSnippet(
    ", ",
    fields.map((f) => fromQi({ schema: "pgrst_body", name: f.cfName })),
  );
  const parsedCols = intercalateSnippet(", ", fields.map(pgFmtCoerceNamed));
  const typedCols = intercalateSnippet(
    ", ",
    fields.map((f) => snip(pgFmtIdent(f.cfName), " ", f.cfIRType)),
  );
  const fieldsWDefaults = fields
    .filter((f) => f.cfDefault !== null)
    .map((f) => `${pgFmtLit(f.cfName)}, ${f.cfDefault}`);
  const defsJsonb = sql(`jsonb_build_object(${fieldsWDefaults.join(",")})`);
  const [finalBodyF, jsonArrayElementsF, jsonToRecordsetF] = includeDefaults
    ? ["pgrst_json_defs.val", "jsonb_array_elements", isJsonObject(body) ? "jsonb_to_record" : "jsonb_to_recordset"]
    : ["pgrst_payload.json_data", "json_array_elements", isJsonObject(body) ? "json_to_record" : "json_to_recordset"];
  const jsonPlaceHolder = snip(param(body), includeDefaults ? "::jsonb" : "::json");
  return snip(
    includeSelect ? snip("SELECT ", namedCols, " ") : emptySnippet,
    "FROM (SELECT ",
    jsonPlaceHolder,
    " AS json_data) pgrst_payload, ",
    includeDefaults
      ? (isJsonObject(body)
        ? snip("LATERAL (SELECT ", defsJsonb, " || pgrst_payload.json_data AS val) pgrst_json_defs, ")
        : snip(
          "LATERAL (SELECT jsonb_agg(",
          defsJsonb,
          " || elem) AS val from jsonb_array_elements(pgrst_payload.json_data) elem) pgrst_json_defs, ",
        ))
      : emptySnippet,
    "LATERAL (SELECT ",
    parsedCols,
    " FROM ",
    fields.length === 0
      // when json keys are empty, e.g. when payload is `{}` or `[{}, {}]`
      ? sql(
        isJsonObject(body)
          ? "(values(1)) _ " // only 1 row for an empty json object '{}'
          : `${jsonArrayElementsF}(${finalBodyF}) _ `, // extract rows of a json array of empty objects `[{}, {}]`
      )
      : snip(jsonToRecordsetF, "(", finalBodyF, ") AS _(", typedCols, ") ", includeLimitOne ? "LIMIT 1" : ""),
    ") pgrst_body ",
  );
}

/** The isJsonObject local of fromJsonBodyF: light validation — pg's
 * json_to_record(set) validates the body; we only need to know whether it
 * looks like an object. */
function isJsonObject(body: string | null): boolean {
  const insignificantWhitespace = [" ", "\t", "\n", "\r"]; // rfc8259#section-2
  let i = 0;
  const b = body ?? "";
  while (i < b.length && insignificantWhitespace.includes(b[i])) i++;
  return b[i] === "{";
}

/** SqlFragment.hs returningF. */
export function returningF(qi: QualifiedIdentifier, returnings: string[]): Snippet {
  if (returnings.length === 0) {
    // For mutation cases where there's no ?select, we return 1 to know how many rows were modified
    return sql("RETURNING 1");
  }
  return snip("RETURNING ", intercalateSnippet(", ", returnings.map((r) => pgFmtColumn(qi, r))));
}

/** SqlFragment.hs mutRangeF — (WHERE keys match pgrst_affected_rows, the key
 * column list) for limited UPDATE/DELETE. */
export function mutRangeF(mainQi: QualifiedIdentifier, rangeId: string[]): [Snippet, Snippet] {
  return [
    intercalateSnippet(
      " AND ",
      rangeId.map((col) =>
        snip(pgFmtColumn(mainQi, col), " = ", pgFmtColumn({ schema: "", name: "pgrst_affected_rows" }, col))
      ),
    ),
    intercalateSnippet(", ", rangeId.map((col) => pgFmtColumn(mainQi, col))),
  ];
}

/** SqlFragment.hs addConfigPgrstInserted — counts upsert/PUT inserted rows in
 * the pgrst.inserted GUC (add) and discounts updated-on-conflict rows (not
 * add); the trailing comparison keeps the expression a valid WHERE clause. */
export function addConfigPgrstInserted(add: boolean): Snippet {
  const [symbol, num] = add ? ["+", "0"] : ["-", "-1"];
  return snip(
    "set_config('pgrst.inserted', (coalesce(",
    currentSettingF("pgrst.inserted"),
    `::int, 0) ${symbol} 1)::text, true) <> '${num}'`,
  );
}

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

/** SqlFragment.hs asJsonSingleF — a scalar-returning RPC aggregates the
 * pgrst_scalar wrapper column instead of the whole row. */
function asJsonSingleF(rout: Routine | null, strip: boolean): Snippet {
  const returnsScalar = rout !== null && funcReturnsScalar(rout);
  return returnsScalar
    ? snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t.pgrst_scalar)->0")), ", 'null')")
    : snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t)->0")), ", 'null')");
}

/** SqlFragment.hs asJsonF — RPC scalar/single-composite/setof-scalar cases. */
function asJsonF(rout: Routine | null, strip: boolean): Snippet {
  const returnsSingleComposite = rout !== null && funcReturnsSingleComposite(rout);
  const returnsScalar = rout !== null && funcReturnsScalar(rout);
  const returnsSetOfScalar = rout !== null && funcReturnsSetOfScalar(rout);
  if (returnsSingleComposite) {
    return snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t)->0")), ", 'null')");
  }
  if (returnsScalar) {
    return snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t.pgrst_scalar)->0")), ", 'null')");
  }
  if (returnsSetOfScalar) {
    return snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t.pgrst_scalar)")), ", '[]')");
  }
  return snip("coalesce(", addNullsToSnip(strip, sql("json_agg(_postgrest_t)")), ", '[]')");
}

/** SqlFragment.hs asGeoJsonF. */
const asGeoJsonF: Snippet = sql(
  "json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(ST_AsGeoJSON(_postgrest_t)::json), '[]'))",
);

/** SqlFragment.hs handlerF — the body aggregation per resolved media handler
 * (`rout` is the called Routine on RPC, null on reads/mutations). */
export function handlerF(rout: Routine | null, handler: MediaHandler): Snippet {
  switch (handler.kind) {
    case "BuiltinAggArrayJsonStrip":
      return asJsonF(rout, true);
    case "BuiltinAggSingleJson":
      return asJsonSingleF(rout, handler.stripNulls);
    case "BuiltinOvAggJson":
      return asJsonF(rout, false);
    case "BuiltinOvAggGeoJson":
      return asGeoJsonF;
    case "BuiltinOvAggCsv":
      return asCsvF;
    case "NoAgg":
      return sql("''::text");
  }
}
