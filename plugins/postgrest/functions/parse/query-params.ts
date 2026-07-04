// Ports src/PostgREST/ApiRequest/QueryParams.hs (PostgREST v12.2.3) — the
// parser for all querystring values, e.g. select, id and order in
// `/projects?select=id,name&id=eq.1&order=id,name.desc`.
//
// Every p* parser below is a 1:1 port of its Haskell namesake, built on the
// Parsec clone in ./parsec.ts so that PGRST100 error messages match upstream
// byte-for-byte (spec-tested strings included).

import { queryParamError } from "../errors.ts";
import type {
  AggregateFunction,
  EmbedParam,
  EmbedPath,
  Field,
  FieldName,
  Filter,
  FtsOperator,
  Hint,
  JoinType,
  JsonOperand,
  JsonOperation,
  JsonPath,
  ListVal,
  LogicOperator,
  LogicTree,
  OpExpr,
  OpQuantifier,
  Operation,
  OrderDirection,
  OrderNulls,
  OrderTerm,
  QuantOperator,
  SelectItem,
  SimpleOperator,
  SingleVal,
  Tree,
  TrileanVal,
} from "../types.ts";
import {
  allRange,
  type NonnegRange,
  rangeGeq,
  rangeLimit,
  rangeOffset,
  readMaybeInteger,
  restrictRange,
} from "./range.ts";
import {
  alt,
  anyChar,
  between,
  char,
  choice,
  digit,
  doP,
  eof,
  fmap,
  label,
  left,
  letter,
  lookAhead,
  many,
  many1,
  noneOf,
  notFollowedBy,
  oneOf,
  option,
  optionMaybe,
  type Parser,
  parserZero,
  pure,
  ref,
  runParser,
  sepBy,
  sepBy1,
  string,
  then_,
  toQPError,
  tryP,
} from "./parsec.ts";

// --------------------------------------------------------------------------
// QueryParams
// --------------------------------------------------------------------------

export interface QueryParams {
  /** Canonical representation of the query params, sorted alphabetically. */
  qsCanonical: string;
  /** Parameters for RPC calls. */
  qsParams: [string, string][];
  /** Ranges derived from &limit and &offset params, keyed like "a.b.limit". */
  qsRanges: Map<string, NonnegRange>;
  /** &order parameters for each level. */
  qsOrder: [EmbedPath, OrderTerm[]][];
  /** &and and &or parameters used for complex boolean logic. */
  qsLogic: [EmbedPath, LogicTree][];
  /** &columns parameter and payload. */
  qsColumns: Set<FieldName> | null;
  /** &select parameter used to shape the response. */
  qsSelect: Tree<SelectItem>[];
  /** Filters on the result from e.g. &id=eq.10. */
  qsFilters: [EmbedPath, Filter][];
  /** Subset of the filters that apply on the root table (UPDATE/DELETE). */
  qsFiltersRoot: Filter[];
  /** Subset of the filters that do not apply on the root table. */
  qsFiltersNotRoot: [EmbedPath, Filter][];
  /** Set of (raw) keys that filters apply to. */
  qsFilterFields: Set<FieldName>;
  /** &on_conflict parameter used to upsert on specific unique keys. */
  qsOnConflict: FieldName[] | null;
}

// --------------------------------------------------------------------------
// Raw query-string parsing — Network.HTTP.Types.URI parseQueryReplacePlus
// --------------------------------------------------------------------------

interface QParam {
  key: string;
  /** null when the pair has no '=' at all (e.g. "?d"). */
  value: string | null;
}

const AMP = 0x26; // &
const SEMI = 0x3b; // ;
const EQ = 0x3d; // =

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

/** urlDecode True: '+' → space and %XX decoding over bytes. */
function urlDecodeBytes(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x2b) {
      out.push(0x20); // '+' → ' '
    } else if (b === 0x25 && i + 2 < bytes.length && isHex(bytes[i + 1]) && isHex(bytes[i + 2])) {
      out.push(hexVal(bytes[i + 1]) * 16 + hexVal(bytes[i + 2]));
      i += 2;
    } else {
      out.push(b);
    }
  }
  return new Uint8Array(out);
}

function isHex(b: number): boolean {
  return (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
}

function hexVal(b: number): number {
  if (b <= 0x39) return b - 0x30;
  if (b <= 0x46) return b - 0x41 + 10;
  return b - 0x61 + 10;
}

/**
 * Ports parseQueryReplacePlus True: splits on '&'/';', drops a leading '?',
 * decodes '+' and %XX in both keys and values, keys without '=' get a null
 * value, and repeated keys are all preserved in order.
 */
export function parseQueryString(qs: string): QParam[] {
  const raw = qs.startsWith("?") ? qs.slice(1) : qs;
  const bytes = utf8Encoder.encode(raw);
  const pairs: QParam[] = [];
  let start = 0;
  while (start < bytes.length) {
    let sep = -1;
    for (let i = start; i < bytes.length; i++) {
      if (bytes[i] === AMP || bytes[i] === SEMI) {
        sep = i;
        break;
      }
    }
    const end = sep === -1 ? bytes.length : sep;
    const segment = bytes.subarray(start, end);
    let eq = -1;
    for (let i = 0; i < segment.length; i++) {
      if (segment[i] === EQ) {
        eq = i;
        break;
      }
    }
    if (eq === -1) {
      pairs.push({ key: utf8Decoder.decode(urlDecodeBytes(segment)), value: null });
    } else {
      pairs.push({
        key: utf8Decoder.decode(urlDecodeBytes(segment.subarray(0, eq))),
        value: utf8Decoder.decode(urlDecodeBytes(segment.subarray(eq + 1))),
      });
    }
    if (sep === -1) break;
    start = sep + 1;
    if (start >= bytes.length) break; // trailing separator: recursion on "" stops
  }
  return pairs;
}

// Network.HTTP.Base urlEncode reserved set (plus controls and >= 0x7F).
const HTTP_BASE_RESERVED = new Set([...';/?:@&=+,${}|\\^[]`<>#%"'].map((c) => c.charCodeAt(0)));

/** Network.HTTP.Base urlEncode (lowercase hex, byte-wise). */
function httpBaseUrlEncode(s: string): string {
  let out = "";
  for (const b of utf8Encoder.encode(s)) {
    const isAlnum = (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
    if (!isAlnum && (b <= 0x20 || b >= 0x7f || HTTP_BASE_RESERVED.has(b))) {
      out += `%${b.toString(16).padStart(2, "0")}`;
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

/** Network.HTTP.Base urlEncodeVars: same-named vars join with commas. */
function urlEncodeVars(pairs: [string, string][]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pairs.length; i++) {
    const [n, v] = pairs[i];
    if (seen.has(n)) continue;
    seen.add(n);
    const values = [v, ...pairs.slice(i + 1).filter(([n2]) => n2 === n).map(([, v2]) => v2)];
    parts.push(`${httpBaseUrlEncode(n)}=${values.map(httpBaseUrlEncode).join(",")}`);
  }
  return parts.join("&");
}

function compareUtf8(a: string, b: string): number {
  const ba = utf8Encoder.encode(a);
  const bb = utf8Encoder.encode(b);
  const n = Math.min(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    if (ba[i] !== bb[i]) return ba[i] - bb[i];
  }
  return ba.length - bb.length;
}

// --------------------------------------------------------------------------
// parse — the public entry point
// --------------------------------------------------------------------------

/**
 * Ports QueryParams.hs parse. `isRpcRead` is true for GET/HEAD RPC calls,
 * where operator-less values become RPC arguments (NoOpExpr) instead of
 * failing. Throws a PGRST100 PgrstError on grammar failures.
 */
export function parseQueryParams(qs: string | URLSearchParams, isRpcRead: boolean): QueryParams {
  const qString: QParam[] = typeof qs === "string"
    ? parseQueryString(qs)
    : [...qs.entries()].map(([key, value]) => ({ key, value: value as string | null }));

  const nonemptyParams = qString.filter((p): p is { key: string; value: string } => p.value !== null);

  const endingIn = (words: string[], key: string): boolean => {
    const segments = key.split(".");
    return words.includes(segments[segments.length - 1]);
  };

  // L.lookup: the FIRST pair with that key decides, even if its value is null.
  const lookupParam = (needle: string): string | null => {
    const hit = qString.find((p) => p.key === needle);
    return hit === undefined ? null : hit.value;
  };

  const reserved = ["select", "columns", "on_conflict"];
  const reservedEmbeddable = ["order", "limit", "offset", "and", "or"];
  const isFilter = (k: string): boolean => !endingIn(reservedEmbeddable, k) && !reserved.includes(k);

  const logic = nonemptyParams.filter((p) => endingIn(["and", "or"], p.key));
  const select = lookupParam("select") ?? "*";
  const onConflict = lookupParam("on_conflict");
  const columns = lookupParam("columns");
  const order = nonemptyParams.filter((p) => endingIn(["order"], p.key));
  const limits = nonemptyParams.filter((p) => endingIn(["limit"], p.key));
  // Replace .offset ending with .limit to be able to match those params later in a map
  const replaceLast = (x: string, s: string): string => [...s.split(".").slice(0, -1), x].join(".");
  const offsets = nonemptyParams
    .filter((p) => endingIn(["offset"], p.key))
    .map((p) => ({ key: replaceLast("limit", p.key), value: p.value }));
  const filters = nonemptyParams.filter((p) => isFilter(p.key));

  const canonical = urlEncodeVars(
    qString
      .map(({ key, value }): [string, string] => [key, value ?? ""])
      .sort((a, b) => compareUtf8(a[0], b[0])),
  );

  // Same evaluation order as the Haskell do-block, so the same failure wins.
  const rOrd = order.map((p) => pRequestOrder(p.key, p.value));
  const rLogic = logic.map((p) => pRequestLogicTree(p.key, p.value));
  const rCols = pRequestColumns(columns);
  const rSel = pRequestSelect(select);
  const allFilters = filters.map((p) => pRequestFilter(isRpcRead, p.key, p.value));
  const hasOp = ([, f]: [EmbedPath, Filter]): boolean => f.opExpr.kind !== "NoOpExpr";
  const rFlts = allFilters.filter(hasOp);
  const params = allFilters.filter((f) => !hasOp(f));
  const hasRootFilter = ([path]: [EmbedPath, Filter]): boolean => path.length === 0;
  const rFltsRoot = rFlts.filter(hasRootFilter).map(([, f]) => f);
  const rFltsNotRoot = rFlts.filter((f) => !hasRootFilter(f));
  const rOnConflict = onConflict === null ? null : pRequestOnConflict(onConflict);

  const rFltsFields = new Set(filters.map((p) => p.key));
  const params2: [string, string][] = params.map(([, f]) => [
    f.field.name,
    f.opExpr.kind === "NoOpExpr" ? f.opExpr.value : "",
  ]);

  // ranges: HM.unionWith f limitParams offsetParams
  const limitParams = new Map<string, NonnegRange>(
    limits.map((p) => [p.key, restrictRange(readMaybeInteger(p.value), allRange)]),
  );
  const offsetParams = new Map<string, NonnegRange>(
    offsets.map((p) => {
      const n = readMaybeInteger(p.value);
      return [p.key, n === null ? allRange : rangeGeq(n)];
    }),
  );
  const ranges = new Map(limitParams);
  for (const [k, ro] of offsetParams) {
    const rl = ranges.get(k);
    if (rl === undefined) {
      ranges.set(k, ro);
    } else {
      const l = rangeLimit(rl) ?? 0;
      const o = rangeOffset(ro);
      ranges.set(k, { lower: o, upper: o + l - 1 });
    }
  }

  return {
    qsCanonical: canonical,
    qsParams: params2,
    qsRanges: ranges,
    qsOrder: rOrd,
    qsLogic: rLogic,
    qsColumns: rCols,
    qsSelect: rSel,
    qsFilters: rFlts,
    qsFiltersRoot: rFltsRoot,
    qsFiltersNotRoot: rFltsNotRoot,
    qsFilterFields: rFltsFields,
    qsOnConflict: rOnConflict,
  };
}

// --------------------------------------------------------------------------
// Request-level parsers (pRequest*) — each throws PGRST100 on failure
// --------------------------------------------------------------------------

/** mapError + P.parse: run a parser, throwing queryParamError on failure. */
function runP<A>(p: Parser<A>, sourceName: string, input: string): A {
  const r = runParser(p, input);
  if (r.ok) return r.value;
  const { qpMessage, qpDetails } = toQPError(sourceName, input, r.error);
  throw queryParamError(qpMessage, qpDetails);
}

/** Ports QueryParams.hs pRequestSelect. */
export function pRequestSelect(selStr: string): Tree<SelectItem>[] {
  return runP(pFieldForest, `failed to parse select parameter (${selStr})`, selStr);
}

/** Ports QueryParams.hs pRequestOnConflict. */
export function pRequestOnConflict(oncStr: string): FieldName[] {
  return runP(pColumns, `failed to parse on_conflict parameter (${oncStr})`, oncStr);
}

/**
 * Ports QueryParams.hs pRequestFilter: `id=eq.1` → (EmbedPath, Filter). For
 * RPC reads, values without an operator become NoOpExpr arguments.
 */
export function pRequestFilter(isRpcRead: boolean, k: string, v: string): [EmbedPath, Filter] {
  const [path, fld] = runP(pTreePath, `failed to parse tree path (${k})`, k);
  const parseFlt = isRpcRead
    ? alt(pOpExpr(pSingleVal), pure<OpExpr>({ kind: "NoOpExpr", value: v }))
    : pOpExpr(pSingleVal);
  const oper = runP(parseFlt, `failed to parse filter (${v})`, v);
  return [path, { field: fld, opExpr: oper }];
}

/** Ports QueryParams.hs pRequestOrder. */
export function pRequestOrder(k: string, v: string): [EmbedPath, OrderTerm[]] {
  const [path] = runP(pTreePath, `failed to parse tree path (${k})`, k);
  const ord = runP(pOrder, `failed to parse order (${v})`, v);
  return [path, ord];
}

/** Ports QueryParams.hs pRequestRange (maps a qsRanges key to its path). */
export function pRequestRange(k: string, v: NonnegRange): [EmbedPath, NonnegRange] {
  const [path] = runP(pTreePath, `failed to parse tree path (${k})`, k);
  return [path, v];
}

/** Ports QueryParams.hs pRequestLogicTree. */
export function pRequestLogicTree(k: string, v: string): [EmbedPath, LogicTree] {
  const [embedPath, op] = runP(pLogicPath, `failed to parse logic path (${k})`, k);
  // Concat op and v to make pLogicTree argument regular, in the form of
  // "?and=and(.. , ..)" instead of "?and=(.. , ..)"
  const tree = runP(pLogicTree, `failed to parse logic tree (${v})`, op + v);
  return [embedPath, tree];
}

/** Ports QueryParams.hs pRequestColumns. */
export function pRequestColumns(colStr: string | null): Set<FieldName> | null {
  if (colStr === null) return null;
  return new Set(runP(pColumns, `failed to parse columns parameter (${colStr})`, colStr));
}

// --------------------------------------------------------------------------
// Grammar — 1:1 ports of the Parsec parsers
// --------------------------------------------------------------------------

/** ws: spaces and tabs. */
const ws: Parser<string> = fmap(many(oneOf(" \t")), (cs) => cs.join(""));

/** lexeme p = ws *> p <* ws */
function lexeme<A>(p: Parser<A>): Parser<A> {
  return then_(ws, left(p, ws));
}

/** Ports QueryParams.hs simpleOperator. */
export const simpleOperator: Parser<SimpleOperator> = label(
  choice<SimpleOperator>([
    tryP(fmap(string("neq"), (): SimpleOperator => "OpNotEqual")),
    tryP(fmap(string("cs"), (): SimpleOperator => "OpContains")),
    tryP(fmap(string("cd"), (): SimpleOperator => "OpContained")),
    tryP(fmap(string("ov"), (): SimpleOperator => "OpOverlap")),
    tryP(fmap(string("sl"), (): SimpleOperator => "OpStrictlyLeft")),
    tryP(fmap(string("sr"), (): SimpleOperator => "OpStrictlyRight")),
    tryP(fmap(string("nxr"), (): SimpleOperator => "OpNotExtendsRight")),
    tryP(fmap(string("nxl"), (): SimpleOperator => "OpNotExtendsLeft")),
    tryP(fmap(string("adj"), (): SimpleOperator => "OpAdjacent")),
  ]),
  "unknown single value operator",
);

/** Ports QueryParams.hs quantOperator. */
export const quantOperator: Parser<QuantOperator> = label(
  choice<QuantOperator>([
    tryP(fmap(string("eq"), (): QuantOperator => "OpEqual")),
    tryP(fmap(string("gte"), (): QuantOperator => "OpGreaterThanEqual")),
    tryP(fmap(string("gt"), (): QuantOperator => "OpGreaterThan")),
    tryP(fmap(string("lte"), (): QuantOperator => "OpLessThanEqual")),
    tryP(fmap(string("lt"), (): QuantOperator => "OpLessThan")),
    tryP(fmap(string("like"), (): QuantOperator => "OpLike")),
    tryP(fmap(string("ilike"), (): QuantOperator => "OpILike")),
    tryP(fmap(string("match"), (): QuantOperator => "OpMatch")),
    tryP(fmap(string("imatch"), (): QuantOperator => "OpIMatch")),
  ]),
  "unknown single value operator",
);

/** Ports QueryParams.hs pDelimiter. */
export const pDelimiter: Parser<string> = label(char("."), "delimiter (.)");

/** Ports QueryParams.hs pIdentifierChar: letter <|> digit <|> oneOf "_ $". */
const pIdentifierChar: Parser<string> = alt(letter, alt(digit, oneOf("_ $")));

/** Ports QueryParams.hs pIdentifier. */
export const pIdentifier: Parser<string> = fmap(many1(pIdentifierChar), (cs) => cs.join("").trim());

/** Ports QueryParams.hs pQuotedValue: double quotes with backslash escapes. */
export const pQuotedValue: Parser<string> = fmap(
  between(char('"'), char('"'), many(alt(noneOf('\\"'), then_(char("\\"), anyChar)))),
  (cs) => cs.join(""),
);

/** Ports QueryParams.hs sepByDash: identifiers joined by non-arrow dashes. */
function sepByDash(fieldIdent: Parser<string>): Parser<string> {
  const dash = fmap(tryP(then_(char("-"), notFollowedBy(char(">")))), () => "-");
  return fmap(sepBy1(fieldIdent, dash), (xs) => xs.join("-"));
}

/** Ports QueryParams.hs pFieldName. */
export const pFieldName: Parser<string> = label(
  alt(pQuotedValue, sepByDash(pIdentifier)),
  "field name (* or [a..z0..9_$])",
);

/** Ports QueryParams.hs pJsonKeyIdentifier. */
const pJsonKeyIdentifier: Parser<string> = fmap(many1(noneOf("(-:.,>)")), (cs) => cs.join("").trim());

/** Ports QueryParams.hs pJsonKeyName. */
const pJsonKeyName: Parser<string> = label(
  alt(pQuotedValue, sepByDash(pJsonKeyIdentifier)),
  "any non reserved character different from: .,>()",
);

/** Ports QueryParams.hs pJsonPath: `->key`, `->>key`, `->2`, `->-1`, ... */
export const pJsonPath: Parser<JsonPath> = many(doP<JsonOperation>(function* () {
  const arrow = (yield alt(
    tryP(fmap(string("->>"), () => "J2Arrow" as const)),
    tryP(fmap(string("->"), () => "JArrow" as const)),
  )) as "JArrow" | "J2Arrow";
  const pEnd = choice([
    tryP(fmap(lookAhead(string("->")), () => undefined)),
    tryP(fmap(lookAhead(string("::")), () => undefined)),
    tryP(fmap(lookAhead(string(".")), () => undefined)),
    tryP(fmap(lookAhead(string(",")), () => undefined)),
    tryP(fmap(eof, () => undefined)),
  ]);
  const pJIdx: Parser<JsonOperand> = doP(function* () {
    const sign = (yield option("+", char("-"))) as string;
    const digits = (yield many1(digit)) as string[];
    yield pEnd;
    return { kind: "JIdx", jVal: sign + digits.join("") } as JsonOperand;
  });
  const pJKey: Parser<JsonOperand> = fmap(pJsonKeyName, (k): JsonOperand => ({ kind: "JKey", jVal: k }));
  const operand = (yield alt(tryP(pJIdx), tryP(pJKey))) as JsonOperand;
  return { kind: arrow, jOp: operand };
}));

/** Ports QueryParams.hs pField. */
export const pField: Parser<Field> = lexeme(doP(function* () {
  const name = (yield pFieldName) as string;
  const jsonPath = (yield option([], pJsonPath)) as JsonPath;
  return { name, jsonPath };
}));

/** Ports QueryParams.hs aliasSeparator: ':' not followed by another ':'. */
const aliasSeparator: Parser<undefined> = then_(char(":"), notFollowedBy(char(":")));

/** Ports QueryParams.hs pEmbedParams: `!hint`, `!inner`, `!left`. */
const pEmbedParams: Parser<[Hint | null, JoinType | null]> = doP(function* () {
  const pEmbedParam: Parser<EmbedParam> = then_(
    char("!"),
    choice<EmbedParam>([
      tryP(fmap(string("left"), (): EmbedParam => ({ kind: "EPJoinType", joinType: "JTLeft" }))),
      tryP(fmap(string("inner"), (): EmbedParam => ({ kind: "EPJoinType", joinType: "JTInner" }))),
      tryP(fmap(pFieldName, (h): EmbedParam => ({ kind: "EPHint", hint: h }))),
    ]),
  );
  const prm1 = (yield optionMaybe(pEmbedParam)) as EmbedParam | null;
  const prm2 = (yield optionMaybe(pEmbedParam)) as EmbedParam | null;
  const hint = (p: EmbedParam | null): Hint | null => (p !== null && p.kind === "EPHint" ? p.hint : null);
  const join = (p: EmbedParam | null): JoinType | null => (p !== null && p.kind === "EPJoinType" ? p.joinType : null);
  return [hint(prm1) ?? hint(prm2), join(prm1) ?? join(prm2)];
});

/** Ports QueryParams.hs pRelationSelect: `alias:rel!hint!inner` before "(". */
export const pRelationSelect: Parser<SelectItem> = lexeme(doP(function* () {
  const alias = (yield optionMaybe(tryP(left(pFieldName, aliasSeparator)))) as string | null;
  const name = (yield pFieldName) as string;
  if (name === "count") yield parserZero; // guard (name /= "count")
  const [hint, jType] = (yield pEmbedParams) as [Hint | null, JoinType | null];
  yield tryP(lookAhead(string("(")));
  return { kind: "SelectRelation", selRelation: name, selAlias: alias, selHint: hint, selJoinType: jType } as SelectItem;
}));

/** Ports QueryParams.hs pSpreadRelationSelect: `...rel!hint!inner` before "(". */
export const pSpreadRelationSelect: Parser<SelectItem> = lexeme(doP(function* () {
  yield string("...");
  const name = (yield pFieldName) as string;
  const [hint, jType] = (yield pEmbedParams) as [Hint | null, JoinType | null];
  yield tryP(lookAhead(string("(")));
  return { kind: "SpreadRelation", selRelation: name, selHint: hint, selJoinType: jType } as SelectItem;
}));

/** Ports QueryParams.hs pFieldSelect: fields with casts/aggregates/aliases. */
export const pFieldSelect: Parser<SelectItem> = lexeme((() => {
  const pEnd = choice([
    tryP(fmap(lookAhead(string(")")), () => undefined)),
    tryP(fmap(lookAhead(string(",")), () => undefined)),
    tryP(fmap(eof, () => undefined)),
  ]);
  const pStar = fmap(string("*"), () => "*");
  const pAggregation: Parser<AggregateFunction> = choice<AggregateFunction>([
    fmap(string("sum"), (): AggregateFunction => "Sum"),
    fmap(string("avg"), (): AggregateFunction => "Avg"),
    fmap(string("count"), (): AggregateFunction => "Count"),
    // 'try' for "min"/"max": both start with 'm', so backtracking is needed.
    tryP(fmap(string("max"), (): AggregateFunction => "Max")),
    tryP(fmap(string("min"), (): AggregateFunction => "Min")),
  ]);
  const starBranch: Parser<SelectItem> = tryP(doP(function* () {
    yield pStar;
    yield pEnd;
    return {
      kind: "SelectField",
      selField: { name: "*", jsonPath: [] },
      selAggregateFunction: null,
      selAggregateCast: null,
      selCast: null,
      selAlias: null,
    } as SelectItem;
  }));
  const countBranch: Parser<SelectItem> = tryP(doP(function* () {
    const alias = (yield optionMaybe(tryP(left(pFieldName, aliasSeparator)))) as string | null;
    yield string("count()");
    const aggCast = (yield optionMaybe(then_(string("::"), pIdentifier))) as string | null;
    yield pEnd;
    return {
      kind: "SelectField",
      selField: { name: "*", jsonPath: [] },
      selAggregateFunction: "Count",
      selAggregateCast: aggCast,
      selCast: null,
      selAlias: alias,
    } as SelectItem;
  }));
  const fieldBranch: Parser<SelectItem> = doP(function* () {
    const alias = (yield optionMaybe(tryP(left(pFieldName, aliasSeparator)))) as string | null;
    const fld = (yield pField) as Field;
    const cast = (yield optionMaybe(then_(string("::"), pIdentifier))) as string | null;
    const agg = (yield optionMaybe(tryP(left(then_(char("."), pAggregation), string("()"))))) as
      | AggregateFunction
      | null;
    const aggCast = (yield optionMaybe(then_(string("::"), pIdentifier))) as string | null;
    yield pEnd;
    return {
      kind: "SelectField",
      selField: fld,
      selAggregateFunction: agg,
      selAggregateCast: aggCast,
      selCast: cast,
      selAlias: alias,
    } as SelectItem;
  });
  return alt(starBranch, alt(countBranch, fieldBranch));
})());

/** Ports QueryParams.hs pFieldForest: the select= tree of SelectItems. */
export const pFieldForest: Parser<Tree<SelectItem>[]> = (() => {
  const pFieldTree: Parser<Tree<SelectItem>> = choice([
    doP<Tree<SelectItem>>(function* () {
      const item = (yield tryP(pSpreadRelationSelect)) as SelectItem;
      const forest = (yield between(char("("), char(")"), ref(() => pFieldForest))) as Tree<SelectItem>[];
      return { rootLabel: item, subForest: forest };
    }),
    doP<Tree<SelectItem>>(function* () {
      const item = (yield tryP(pRelationSelect)) as SelectItem;
      const forest = (yield between(char("("), char(")"), ref(() => pFieldForest))) as Tree<SelectItem>[];
      return { rootLabel: item, subForest: forest };
    }),
    fmap(pFieldSelect, (item): Tree<SelectItem> => ({ rootLabel: item, subForest: [] })),
  ]);
  return sepBy(pFieldTree, lexeme(char(",")));
})();

/** Ports QueryParams.hs pTreePath: `a.b.c->>d` → (["a","b"], c->>d). */
export const pTreePath: Parser<[EmbedPath, Field]> = doP(function* () {
  const p = (yield sepBy1(pFieldName, pDelimiter)) as string[];
  const jp = (yield option([], pJsonPath)) as JsonPath;
  return [p.slice(0, -1), { name: p[p.length - 1], jsonPath: jp }];
});

/** Ports QueryParams.hs pSingleVal: the rest of the input. */
export const pSingleVal: Parser<SingleVal> = fmap(many(anyChar), (cs) => cs.join(""));

/** Ports QueryParams.hs pListElement. */
const pListElement: Parser<string> = alt(
  tryP(left(pQuotedValue, notFollowedBy(noneOf(",)")))),
  fmap(many(noneOf(",)")), (cs) => cs.join("")),
);

/** Ports QueryParams.hs pListVal: `(a,b,"c")`. */
export const pListVal: Parser<ListVal> = then_(
  lexeme(char("(")),
  left(sepBy1(pListElement, char(",")), lexeme(char(")"))),
);

/** case insensitive char and string (QueryParams.hs ciChar/ciString). */
function ciString(s: string): Parser<string> {
  return doP(function* () {
    let out = "";
    for (const c of s) out += (yield alt(char(c), char(c.toUpperCase()))) as string;
    return out;
  });
}

/** Ports QueryParams.hs pOpExpr: the operator expression of a filter value. */
export function pOpExpr(pSVal: Parser<SingleVal>): Parser<OpExpr> {
  const pIn: Parser<Operation> = fmap(
    then_(tryP(then_(string("in"), pDelimiter)), pListVal),
    (v): Operation => ({ kind: "In", value: v }),
  );

  const pTriVal: Parser<TrileanVal> = label(
    choice<TrileanVal>([
      tryP(fmap(ciString("null"), (): TrileanVal => "TriNull")),
      tryP(fmap(ciString("unknown"), (): TrileanVal => "TriUnknown")),
      tryP(fmap(ciString("true"), (): TrileanVal => "TriTrue")),
      tryP(fmap(ciString("false"), (): TrileanVal => "TriFalse")),
    ]),
    "null or trilean value (unknown, true, false)",
  );

  const pIs: Parser<Operation> = fmap(
    then_(tryP(then_(string("is"), pDelimiter)), pTriVal),
    (v): Operation => ({ kind: "Is", value: v }),
  );

  const pIsDist: Parser<Operation> = fmap(
    then_(tryP(then_(string("isdistinct"), pDelimiter)), pSVal),
    (v): Operation => ({ kind: "IsDistinctFrom", value: v }),
  );

  const pSimpleOp: Parser<Operation> = doP(function* () {
    const op = (yield simpleOperator) as SimpleOperator;
    yield pDelimiter;
    const v = (yield pSVal) as string;
    return { kind: "Op", op, value: v } as Operation;
  });

  const pQuantOp: Parser<Operation> = doP(function* () {
    const op = (yield quantOperator) as QuantOperator;
    const quant = (yield optionMaybe(
      tryP(between(char("("), char(")"), alt(tryP(fmap(string("any"), () => "QuantAny")), fmap(string("all"), () => "QuantAll")))),
    )) as OpQuantifier | null;
    yield pDelimiter;
    const v = (yield pSVal) as string;
    return { kind: "OpQuant", op, quantifier: quant, value: v } as Operation;
  });

  const pFts: Parser<Operation> = doP(function* () {
    const op = (yield choice<FtsOperator>([
      tryP(fmap(string("fts"), (): FtsOperator => "FilterFts")),
      tryP(fmap(string("plfts"), (): FtsOperator => "FilterFtsPlain")),
      tryP(fmap(string("phfts"), (): FtsOperator => "FilterFtsPhrase")),
      tryP(fmap(string("wfts"), (): FtsOperator => "FilterFtsWebsearch")),
    ])) as FtsOperator;
    const lang = (yield optionMaybe(tryP(between(char("("), char(")"), pIdentifier)))) as string | null;
    yield pDelimiter;
    const v = (yield pSVal) as string;
    return { kind: "Fts", op, language: lang, value: v } as Operation;
  });

  const pOperation: Parser<Operation> = label(
    choice([pIn, pIs, pIsDist, tryP(pFts), tryP(pSimpleOp), tryP(pQuantOp)]),
    "operator (eq, gt, ...)",
  );

  return doP(function* () {
    const negated = (yield alt(tryP(fmap(then_(string("not"), pDelimiter), () => true)), pure(false))) as boolean;
    const operation = (yield pOperation) as Operation;
    return { kind: "OpExpr", negated, operation } as OpExpr;
  });
}

/** Ports QueryParams.hs pOrder: order terms incl. related-table terms. */
export const pOrder: Parser<OrderTerm[]> = (() => {
  const pOrdDir: Parser<OrderDirection> = alt(
    tryP(fmap(then_(pDelimiter, string("asc")), (): OrderDirection => "OrderAsc")),
    tryP(fmap(then_(pDelimiter, string("desc")), (): OrderDirection => "OrderDesc")),
  );
  const pNulls: Parser<OrderNulls> = alt(
    tryP(fmap(then_(pDelimiter, string("nullsfirst")), (): OrderNulls => "OrderNullsFirst")),
    tryP(fmap(then_(pDelimiter, string("nullslast")), (): OrderNulls => "OrderNullsLast")),
  );
  const pEnd = alt(
    tryP(fmap(lookAhead(char(",")), () => undefined)),
    tryP(fmap(eof, () => undefined)),
  );
  // nls <- optionMaybe pNulls <* pEnd <|> pEnd $> Nothing
  const pNls: Parser<OrderNulls | null> = alt(
    left(optionMaybe(pNulls), pEnd),
    fmap(pEnd, () => null),
  );

  const pOrderTerm: Parser<OrderTerm> = doP(function* () {
    const fld = (yield pField) as Field;
    const dir = (yield optionMaybe(pOrdDir)) as OrderDirection | null;
    const nls = (yield pNls) as OrderNulls | null;
    return { kind: "OrderTerm", otTerm: fld, otDirection: dir, otNullOrder: nls } as OrderTerm;
  });

  const pOrderRelationTerm: Parser<OrderTerm> = doP(function* () {
    const nam = (yield pFieldName) as string;
    const fld = (yield between(char("("), char(")"), pField)) as Field;
    const dir = (yield optionMaybe(pOrdDir)) as OrderDirection | null;
    const nls = (yield pNls) as OrderNulls | null;
    return { kind: "OrderRelationTerm", otRelation: nam, otRelTerm: fld, otDirection: dir, otNullOrder: nls } as OrderTerm;
  });

  return sepBy1(lexeme(alt(tryP(pOrderRelationTerm), pOrderTerm)), char(","));
})();

/** Ports QueryParams.hs pLogicSingleVal. */
const pLogicSingleVal: Parser<string> = (() => {
  const pPgArray: Parser<string> = doP(function* () {
    const a = (yield string("{")) as string;
    const b = (yield many(noneOf("{}"))) as string[];
    const c = (yield string("}")) as string;
    return a + b.join("") + c;
  });
  return choice([
    tryP(left(pQuotedValue, notFollowedBy(noneOf(",)")))),
    tryP(pPgArray),
    fmap(many(noneOf(",)")), (cs) => cs.join("")),
  ]);
})();

/** Ports QueryParams.hs pLogicTree: the elements inside or/and. */
export const pLogicTree: Parser<LogicTree> = (() => {
  const pLogicFilter: Parser<Filter> = doP(function* () {
    const field = (yield pField) as Field;
    yield pDelimiter;
    const opExpr = (yield pOpExpr(pLogicSingleVal)) as OpExpr;
    return { field, opExpr };
  });
  const pNot: Parser<boolean> = label(
    alt(tryP(fmap(then_(string("not"), pDelimiter), () => true)), pure(false)),
    "negation operator (not)",
  );
  const pLogicOp: Parser<LogicOperator> = label(
    alt(tryP(fmap(string("and"), (): LogicOperator => "And")), fmap(string("or"), (): LogicOperator => "Or")),
    "logic operator (and, or)",
  );
  const expr: Parser<LogicTree> = doP(function* () {
    const negated = (yield pNot) as boolean;
    const op = (yield pLogicOp) as LogicOperator;
    yield lexeme(char("("));
    const children = (yield sepBy1(ref(() => pLogicTree), lexeme(char(",")))) as LogicTree[];
    yield lexeme(char(")"));
    return { kind: "Expr", negated, op, children } as LogicTree;
  });
  return alt(
    fmap(tryP(pLogicFilter), (filter): LogicTree => ({ kind: "Stmnt", filter })),
    expr,
  );
})();

/** Ports QueryParams.hs pLogicPath: `a.b.not.and` → (["a","b"], "not.and"). */
export const pLogicPath: Parser<[EmbedPath, string]> = fmap(sepBy1(pFieldName, pDelimiter), (path) => {
  const op = path[path.length - 1];
  const notOp = `not.${op}`;
  return [path.slice(0, -1).filter((x) => x !== "not"), path.includes("not") ? notOp : op];
});

/** Ports QueryParams.hs pColumns. */
export const pColumns: Parser<FieldName[]> = sepBy1(pFieldName, lexeme(char(",")));
