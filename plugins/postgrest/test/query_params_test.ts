// Tests for functions/parse/query-params.ts.
//
// The "doctest:" cases are 1:1 transcriptions of the `-- >>>` examples in
// PostgREST v12.2.3's QueryParams.hs (85 examples), asserting the same ASTs
// and — for failures — the same Parsec (line, column) and error details.
// The "spec:" cases pin the exact PGRST100 strings asserted by upstream's
// spec tests (QuerySpec, AndOrParamsSpec, JsonOperatorSpec, InsertSpec).

import { assert, assertEquals } from "std/assert/mod.ts";
import { PgrstError } from "../functions/errors.ts";
import {
  errorPosition,
  formatDetails,
  type Parser,
  runParser,
} from "../functions/parse/parsec.ts";
import {
  parseQueryParams,
  parseQueryString,
  pColumns,
  pFieldForest,
  pFieldName,
  pFieldSelect,
  pJsonPath,
  pLogicPath,
  pLogicTree,
  pOpExpr,
  pOrder,
  pRelationSelect,
  pRequestFilter,
  pRequestRange,
  pSingleVal,
  pSpreadRelationSelect,
  pTreePath,
} from "../functions/parse/query-params.ts";

// --- helpers ---------------------------------------------------------------

function ok<A>(p: Parser<A>, input: string): A {
  const r = runParser(p, input);
  if (!r.ok) throw new Error(`expected success on ${JSON.stringify(input)}, got: ${formatDetails(r.error)}`);
  return r.value;
}

function err<A>(p: Parser<A>, input: string): { line: number; column: number; details: string } {
  const r = runParser(p, input);
  if (r.ok) throw new Error(`expected failure on ${JSON.stringify(input)}`);
  return { ...errorPosition(input, r.error), details: formatDetails(r.error) };
}

function qpThrows(fn: () => unknown): { message: string; details: string } {
  try {
    fn();
  } catch (e) {
    if (e instanceof PgrstError) {
      assertEquals(e.body.code, "PGRST100");
      assertEquals(e.status, 400);
      return { message: e.body.message as string, details: e.body.details as string };
    }
    throw e;
  }
  throw new Error("expected a PgrstError to be thrown");
}

const jKey = (v: string): unknown => ({ kind: "JKey", jVal: v });
const jIdx = (v: string): unknown => ({ kind: "JIdx", jVal: v });
const jA = (op: unknown): unknown => ({ kind: "JArrow", jOp: op });
const j2A = (op: unknown): unknown => ({ kind: "J2Arrow", jOp: op });
const field = (name: string, jsonPath: unknown[] = []): unknown => ({ name, jsonPath });
const sf = (name: string, jsonPath: unknown[] = [], over: Record<string, unknown> = {}): unknown => ({
  kind: "SelectField",
  selField: field(name, jsonPath),
  selAggregateFunction: null,
  selAggregateCast: null,
  selCast: null,
  selAlias: null,
  ...over,
});
const rel = (name: string, over: Record<string, unknown> = {}): unknown => ({
  kind: "SelectRelation",
  selRelation: name,
  selAlias: null,
  selHint: null,
  selJoinType: null,
  ...over,
});
const spread = (name: string, over: Record<string, unknown> = {}): unknown => ({
  kind: "SpreadRelation",
  selRelation: name,
  selHint: null,
  selJoinType: null,
  ...over,
});
const node = (rootLabel: unknown, subForest: unknown[] = []): unknown => ({ rootLabel, subForest });
const opQuant = (op: string, quantifier: string | null, value: string): unknown => ({ kind: "OpQuant", op, quantifier, value });
const opExpr = (negated: boolean, operation: unknown): unknown => ({ kind: "OpExpr", negated, operation });
const flt = (name: string, jsonPath: unknown[], op: unknown): unknown => ({ field: field(name, jsonPath), opExpr: op });
const ordTerm = (name: string, jsonPath: unknown[], dir: string | null, nulls: string | null): unknown => ({
  kind: "OrderTerm",
  otTerm: field(name, jsonPath),
  otDirection: dir,
  otNullOrder: nulls,
});
const ordRelTerm = (relName: string, name: string, jsonPath: unknown[], dir: string | null, nulls: string | null): unknown => ({
  kind: "OrderRelationTerm",
  otRelation: relName,
  otRelTerm: field(name, jsonPath),
  otDirection: dir,
  otNullOrder: nulls,
});
const stmnt = (filter: unknown): unknown => ({ kind: "Stmnt", filter });
const lExpr = (negated: boolean, op: string, children: unknown[]): unknown => ({ kind: "Expr", negated, op, children });

// --- parse (QueryParams.hs top-level doctests) ------------------------------

Deno.test("doctest: parse canonicalizes the query string sorted alphabetically", () => {
  assertEquals(parseQueryParams("a=1&c=3&b=2&d", true).qsCanonical, "a=1&b=2&c=3&d=");
});

Deno.test("doctest: parse select=name,location", () => {
  assertEquals(parseQueryParams("select=name,location", false).qsSelect, [node(sf("name")), node(sf("location"))]);
});

Deno.test("doctest: parse a.b=eq.0 filter with embed path", () => {
  assertEquals(parseQueryParams("a.b=eq.0", false).qsFilters, [
    [["a"], flt("b", [], opExpr(false, opQuant("OpEqual", null, "0")))],
  ]);
});

Deno.test("doctest: parse a.b=noop.0 fails with unknown operator", () => {
  const e = qpThrows(() => parseQueryParams("a.b=noop.0", false));
  assertEquals(e.message, '"failed to parse filter (noop.0)" (line 1, column 1)');
  assertEquals(e.details, 'unexpected "o" expecting "not" or operator (eq, gt, ...)');
});

// --- pRequestFilter doctests -------------------------------------------------

Deno.test("doctest: pRequestFilter False id=eq.1", () => {
  assertEquals(pRequestFilter(false, "id", "eq.1"), [[], flt("id", [], opExpr(false, opQuant("OpEqual", null, "1")))]);
});

Deno.test("doctest: pRequestFilter False id=val fails", () => {
  const e = qpThrows(() => pRequestFilter(false, "id", "val"));
  assertEquals(e.message, '"failed to parse filter (val)" (line 1, column 1)');
  assertEquals(e.details, 'unexpected "v" expecting "not" or operator (eq, gt, ...)');
});

Deno.test("doctest: pRequestFilter True id=val becomes NoOpExpr", () => {
  assertEquals<unknown>(pRequestFilter(true, "id", "val"), [[], flt("id", [], { kind: "NoOpExpr", value: "val" })]);
});

// --- pFieldForest doctests ---------------------------------------------------

Deno.test("doctest: pFieldForest id", () => {
  assertEquals(ok(pFieldForest, "id"), [node(sf("id"))]);
});

Deno.test("doctest: pFieldForest client(id)", () => {
  assertEquals(ok(pFieldForest, "client(id)"), [node(rel("client"), [node(sf("id"))])]);
});

Deno.test("doctest: pFieldForest *,client(*,nested(*))", () => {
  assertEquals(ok(pFieldForest, "*,client(*,nested(*))"), [
    node(sf("*")),
    node(rel("client"), [node(sf("*")), node(rel("nested"), [node(sf("*"))])]),
  ]);
});

Deno.test("doctest: pFieldForest *,...client(*),other(*)", () => {
  assertEquals(ok(pFieldForest, "*,...client(*),other(*)"), [
    node(sf("*")),
    node(spread("client"), [node(sf("*"))]),
    node(rel("other"), [node(sf("*"))]),
  ]);
});

Deno.test("doctest: pFieldForest of empty input", () => {
  assertEquals(ok(pFieldForest, ""), []);
});

Deno.test("doctest: pFieldForest id,clients(name[])", () => {
  const e = err(pFieldForest, "id,clients(name[])");
  assertEquals([e.line, e.column], [1, 16]);
  assertEquals(e.details, `unexpected '[' expecting letter, digit, "-", "->>", "->", "::", ".", ")", "," or end of input`);
});

Deno.test("doctest: pFieldForest data->>-78xy", () => {
  const e = err(pFieldForest, "data->>-78xy");
  assertEquals([e.line, e.column], [1, 11]);
  assertEquals(e.details, `unexpected 'x' expecting digit, "->", "::", ".", "," or end of input`);
});

// --- pFieldName doctests -----------------------------------------------------

Deno.test("doctest: pFieldName accepts identifiers, spaces, dashes, digits", () => {
  assertEquals(ok(pFieldName, "identifier"), "identifier");
  assertEquals(ok(pFieldName, "identifier with spaces"), "identifier with spaces");
  assertEquals(ok(pFieldName, "identifier-with-dashes"), "identifier-with-dashes");
  assertEquals(ok(pFieldName, "123"), "123");
  assertEquals(ok(pFieldName, "_"), "_");
  assertEquals(ok(pFieldName, "$"), "$");
});

Deno.test("doctest: pFieldName rejects bare colon", () => {
  const e = err(pFieldName, ":");
  assertEquals([e.line, e.column], [1, 1]);
  assertEquals(e.details, 'unexpected ":" expecting field name (* or [a..z0..9_$])');
});

Deno.test("doctest: pFieldName quoted values", () => {
  assertEquals(ok(pFieldName, '":"'), ":");
  assertEquals(ok(pFieldName, " no leading or trailing spaces "), "no leading or trailing spaces");
  assertEquals(ok(pFieldName, '" leading and trailing spaces "'), " leading and trailing spaces ");
});

// --- pJsonPath doctests --------------------------------------------------------

Deno.test("doctest: pJsonPath arrows with keys and indexes", () => {
  assertEquals(ok(pJsonPath, "->text"), [jA(jKey("text"))]);
  assertEquals(ok(pJsonPath, "->!@#$%^&*_a"), [jA(jKey("!@#$%^&*_a"))]);
  assertEquals(ok(pJsonPath, "->1"), [jA(jIdx("+1"))]);
  assertEquals(ok(pJsonPath, "->>text"), [j2A(jKey("text"))]);
  assertEquals(ok(pJsonPath, "->>!@#$%^&*_a"), [j2A(jKey("!@#$%^&*_a"))]);
  assertEquals(ok(pJsonPath, "->>1"), [j2A(jIdx("+1"))]);
  assertEquals(ok(pJsonPath, "->0,other"), [jA(jIdx("+0"))]);
  assertEquals(ok(pJsonPath, "->0.desc"), [jA(jIdx("+0"))]);
});

Deno.test("doctest: pJsonPath fails on badly formed negatives", () => {
  const e1 = err(pJsonPath, "->>-78xy");
  assertEquals([e1.line, e1.column], [1, 7]);
  assertEquals(e1.details, `unexpected 'x' expecting digit, "->", "::", ".", "," or end of input`);

  const e2 = err(pJsonPath, "->>--34");
  assertEquals([e2.line, e2.column], [1, 5]);
  assertEquals(e2.details, 'unexpected "-" expecting digit');

  const e3 = err(pJsonPath, "->>-xy-4");
  assertEquals([e3.line, e3.column], [1, 5]);
  assertEquals(e3.details, 'unexpected "x" expecting digit');
});

// --- pRelationSelect doctests --------------------------------------------------

Deno.test("doctest: pRelationSelect aliases, hints and join types", () => {
  assertEquals(ok(pRelationSelect, "rel(*)"), rel("rel"));
  assertEquals(ok(pRelationSelect, "alias:rel(*)"), rel("rel", { selAlias: "alias" }));
  assertEquals(ok(pRelationSelect, "rel!hint(*)"), rel("rel", { selHint: "hint" }));
  assertEquals(ok(pRelationSelect, "rel!inner(*)"), rel("rel", { selJoinType: "JTInner" }));
  assertEquals(ok(pRelationSelect, "rel!hint!inner(*)"), rel("rel", { selHint: "hint", selJoinType: "JTInner" }));
  assertEquals(
    ok(pRelationSelect, "alias:rel!inner!hint(*)"),
    rel("rel", { selAlias: "alias", selHint: "hint", selJoinType: "JTInner" }),
  );
});

Deno.test("doctest: pRelationSelect rejects json paths on relations", () => {
  const e1 = err(pRelationSelect, "rel->jsonpath(*)");
  assertEquals([e1.line, e1.column], [1, 6]);
  assertEquals(e1.details, "unexpected '>'");

  const e2 = err(pRelationSelect, "rel->jsonpath!hint(*)");
  assertEquals([e2.line, e2.column], [1, 6]);
  assertEquals(e2.details, "unexpected '>'");
});

// --- pFieldSelect doctests -------------------------------------------------------

Deno.test("doctest: pFieldSelect fields with json paths, casts and aliases", () => {
  assertEquals(ok(pFieldSelect, "name"), sf("name"));
  assertEquals(ok(pFieldSelect, "name->jsonpath"), sf("name", [jA(jKey("jsonpath"))]));
  assertEquals(ok(pFieldSelect, "name::cast"), sf("name", [], { selCast: "cast" }));
  assertEquals(ok(pFieldSelect, "alias:name"), sf("name", [], { selAlias: "alias" }));
  assertEquals(
    ok(pFieldSelect, "alias:name->jsonpath::cast"),
    sf("name", [jA(jKey("jsonpath"))], { selCast: "cast", selAlias: "alias" }),
  );
  assertEquals(
    ok(pFieldSelect, "alias:name->!@#$%^&*_a::cast"),
    sf("name", [jA(jKey("!@#$%^&*_a"))], { selCast: "cast", selAlias: "alias" }),
  );
  assertEquals(ok(pFieldSelect, "*"), sf("*"));
});

Deno.test("doctest: pFieldSelect name!hint", () => {
  const e = err(pFieldSelect, "name!hint");
  assertEquals([e.line, e.column], [1, 5]);
  assertEquals(e.details, `unexpected '!' expecting letter, digit, "-", "->>", "->", "::", ".", ")", "," or end of input`);
});

Deno.test("doctest: pFieldSelect *!hint", () => {
  const e = err(pFieldSelect, "*!hint");
  assertEquals([e.line, e.column], [1, 2]);
  assertEquals(e.details, `unexpected '!' expecting ")", "," or end of input`);
});

Deno.test("doctest: pFieldSelect name::", () => {
  const e = err(pFieldSelect, "name::");
  assertEquals([e.line, e.column], [1, 7]);
  assertEquals(e.details, "unexpected end of input expecting letter or digit");
});

// --- pSpreadRelationSelect doctests -----------------------------------------------

Deno.test("doctest: pSpreadRelationSelect spreads", () => {
  assertEquals(ok(pSpreadRelationSelect, "...rel(*)"), spread("rel"));
  assertEquals(ok(pSpreadRelationSelect, "...rel!hint!inner(*)"), spread("rel", { selHint: "hint", selJoinType: "JTInner" }));
});

Deno.test("doctest: pSpreadRelationSelect requires the ... prefix", () => {
  const e1 = err(pSpreadRelationSelect, "rel(*)");
  assertEquals([e1.line, e1.column], [1, 1]);
  assertEquals(e1.details, 'unexpected "r" expecting "..."');

  const e2 = err(pSpreadRelationSelect, "alias:...rel(*)");
  assertEquals([e2.line, e2.column], [1, 1]);
  assertEquals(e2.details, 'unexpected "a" expecting "..."');

  const e3 = err(pSpreadRelationSelect, "...rel->jsonpath(*)");
  assertEquals([e3.line, e3.column], [1, 9]);
  assertEquals(e3.details, "unexpected '>'");
});

// --- pOpExpr doctests --------------------------------------------------------------

Deno.test("doctest: pOpExpr fts().value has no language", () => {
  const e = err(pOpExpr(pSingleVal), "fts().value");
  assertEquals([e.line, e.column], [1, 5]);
  assertEquals(e.details, 'unexpected ")" expecting operator (eq, gt, ...)');
});

Deno.test("doctest: pOpExpr quantified operators", () => {
  assertEquals(ok(pOpExpr(pSingleVal), "eq(any).value"), opExpr(false, opQuant("OpEqual", "QuantAny", "value")));
  assertEquals(ok(pOpExpr(pSingleVal), "eq(all).value"), opExpr(false, opQuant("OpEqual", "QuantAll", "value")));
  assertEquals(ok(pOpExpr(pSingleVal), "not.eq(all).value"), opExpr(true, opQuant("OpEqual", "QuantAll", "value")));
});

Deno.test("doctest: pOpExpr eq().value", () => {
  const e = err(pOpExpr(pSingleVal), "eq().value");
  assertEquals([e.line, e.column], [1, 4]);
  assertEquals(e.details, 'unexpected ")" expecting operator (eq, gt, ...)');
});

Deno.test("doctest: pOpExpr is().value", () => {
  const e = err(pOpExpr(pSingleVal), "is().value");
  assertEquals([e.line, e.column], [1, 3]);
  assertEquals(e.details, 'unexpected "(" expecting operator (eq, gt, ...)');
});

Deno.test("doctest: pOpExpr in().value", () => {
  const e = err(pOpExpr(pSingleVal), "in().value");
  assertEquals([e.line, e.column], [1, 3]);
  assertEquals(e.details, 'unexpected "(" expecting operator (eq, gt, ...)');
});

// --- pOrder doctests ------------------------------------------------------------------

Deno.test("doctest: pOrder terms with direction and nulls", () => {
  assertEquals(ok(pOrder, "name.desc.nullsfirst"), [ordTerm("name", [], "OrderDesc", "OrderNullsFirst")]);
  assertEquals(ok(pOrder, "json_col->key.asc.nullslast"), [
    ordTerm("json_col", [jA(jKey("key"))], "OrderAsc", "OrderNullsLast"),
  ]);
  assertEquals(ok(pOrder, "json_col->!@#$%^&*_a.asc.nullslast"), [
    ordTerm("json_col", [jA(jKey("!@#$%^&*_a"))], "OrderAsc", "OrderNullsLast"),
  ]);
});

Deno.test("doctest: pOrder related-table terms", () => {
  assertEquals(ok(pOrder, "clients(json_col->key).desc.nullsfirst"), [
    ordRelTerm("clients", "json_col", [jA(jKey("key"))], "OrderDesc", "OrderNullsFirst"),
  ]);
  assertEquals(ok(pOrder, "clients(json_col->!@#$%^&*_a).desc.nullsfirst"), [
    ordRelTerm("clients", "json_col", [jA(jKey("!@#$%^&*_a"))], "OrderDesc", "OrderNullsFirst"),
  ]);
});

Deno.test("doctest: pOrder clients(name,id) rejects multi-column relation terms", () => {
  const e = err(pOrder, "clients(name,id)");
  assertEquals([e.line, e.column], [1, 8]);
  assertEquals(e.details, `unexpected '(' expecting letter, digit, "-", "->>", "->", delimiter (.), "," or end of input`);
});

Deno.test("doctest: pOrder mixes plain and relation terms", () => {
  assertEquals(ok(pOrder, "name,clients(name),id"), [
    ordTerm("name", [], null, null),
    ordRelTerm("clients", "name", [], null, null),
    ordTerm("id", [], null, null),
  ]);
});

Deno.test("doctest: pOrder id.ac", () => {
  const e = err(pOrder, "id.ac");
  assertEquals([e.line, e.column], [1, 4]);
  assertEquals(e.details, 'unexpected "c" expecting "asc", "desc", "nullsfirst" or "nullslast"');
});

Deno.test("doctest: pOrder id.descc", () => {
  const e = err(pOrder, "id.descc");
  assertEquals([e.line, e.column], [1, 8]);
  assertEquals(e.details, `unexpected 'c' expecting delimiter (.), "," or end of input`);
});

Deno.test("doctest: pOrder id.nulsfist", () => {
  const e = err(pOrder, "id.nulsfist");
  assertEquals([e.line, e.column], [1, 4]);
  assertEquals(e.details, 'unexpected "n" expecting "asc", "desc", "nullsfirst" or "nullslast"');
});

Deno.test("doctest: pOrder id.nullslasttt", () => {
  const e = err(pOrder, "id.nullslasttt");
  assertEquals([e.line, e.column], [1, 13]);
  assertEquals(e.details, `unexpected 't' expecting "," or end of input`);
});

Deno.test("doctest: pOrder id.smth34", () => {
  const e = err(pOrder, "id.smth34");
  assertEquals([e.line, e.column], [1, 4]);
  assertEquals(e.details, 'unexpected "s" expecting "asc", "desc", "nullsfirst" or "nullslast"');
});

Deno.test("doctest: pOrder id.asc.nlsfst", () => {
  const e = err(pOrder, "id.asc.nlsfst");
  assertEquals([e.line, e.column], [1, 8]);
  assertEquals(e.details, 'unexpected "l" expecting "nullsfirst" or "nullslast"');
});

Deno.test("doctest: pOrder id.asc.nullslasttt", () => {
  const e = err(pOrder, "id.asc.nullslasttt");
  assertEquals([e.line, e.column], [1, 17]);
  assertEquals(e.details, `unexpected 't' expecting "," or end of input`);
});

Deno.test("doctest: pOrder id.asc.smth34", () => {
  const e = err(pOrder, "id.asc.smth34");
  assertEquals([e.line, e.column], [1, 8]);
  assertEquals(e.details, 'unexpected "s" expecting "nullsfirst" or "nullslast"');
});

// --- pLogicTree doctests -----------------------------------------------------------------

Deno.test("doctest: pLogicTree or()", () => {
  const e = err(pLogicTree, "or()");
  assertEquals([e.line, e.column], [1, 4]);
  assertEquals(
    e.details,
    'unexpected ")" expecting field name (* or [a..z0..9_$]), negation operator (not) or logic operator (and, or)',
  );
});

Deno.test("doctest: pLogicTree or(id.in.1,2,id.eq.3)", () => {
  const e = err(pLogicTree, "or(id.in.1,2,id.eq.3)");
  assertEquals([e.line, e.column], [1, 10]);
  assertEquals(e.details, 'unexpected "1" expecting "("');
});

Deno.test("doctest: pLogicTree or)(", () => {
  const e = err(pLogicTree, "or)(");
  assertEquals([e.line, e.column], [1, 3]);
  assertEquals(e.details, 'unexpected ")" expecting "("');
});

Deno.test("doctest: pLogicTree and(ord(...),...)", () => {
  const e = err(pLogicTree, "and(ord(id.eq.1,id.eq.1),id.eq.2)");
  assertEquals([e.line, e.column], [1, 7]);
  assertEquals(e.details, 'unexpected "d" expecting "("');
});

Deno.test("doctest: pLogicTree not.xor is not a logic operator", () => {
  const e = err(pLogicTree, "or(id.eq.1,not.xor(id.eq.2,id.eq.3))");
  assertEquals([e.line, e.column], [1, 16]);
  assertEquals(e.details, 'unexpected "x" expecting logic operator (and, or)');
});

// --- spec-test PGRST100 strings (byte-parity with upstream spec suite) ------------------

Deno.test("spec: QuerySpec order=id.asc.nullslasttt", () => {
  const e = qpThrows(() => parseQueryParams("order=id.asc.nullslasttt", false));
  assertEquals(e.message, '"failed to parse order (id.asc.nullslasttt)" (line 1, column 17)');
  assertEquals(e.details, `unexpected 't' expecting "," or end of input`);
});

Deno.test("spec: QuerySpec filter without operator id=0", () => {
  const e = qpThrows(() => parseQueryParams("id=0", false));
  assertEquals(e.message, '"failed to parse filter (0)" (line 1, column 1)');
  assertEquals(e.details, 'unexpected "0" expecting "not" or operator (eq, gt, ...)');
});

Deno.test("spec: AndOrParamsSpec or=()", () => {
  const e = qpThrows(() => parseQueryParams("or=()", false));
  assertEquals(e.message, '"failed to parse logic tree (())" (line 1, column 4)');
  assertEquals(
    e.details,
    'unexpected ")" expecting field name (* or [a..z0..9_$]), negation operator (not) or logic operator (and, or)',
  );
});

Deno.test("spec: InsertSpec blank ?columns", () => {
  const e = qpThrows(() => parseQueryParams("columns=", false));
  assertEquals(e.message, '"failed to parse columns parameter ()" (line 1, column 1)');
  assertEquals(e.details, "unexpected end of input expecting field name (* or [a..z0..9_$])");
});

Deno.test("spec: JsonOperatorSpec select=data->>--34", () => {
  const e = qpThrows(() => parseQueryParams("select=data->>--34", false));
  assertEquals(e.message, '"failed to parse select parameter (data->>--34)" (line 1, column 9)');
  assertEquals(e.details, 'unexpected "-" expecting digit');
});

Deno.test("spec: JsonOperatorSpec reserved char in json key", () => {
  const e = qpThrows(() => parseQueryParams("select=data->(!@%23$%25^%26*_d->>!@%23$%25^%26*_e::integer", false));
  assertEquals(e.message, '"failed to parse select parameter (data->(!@#$%^&*_d->>!@#$%^&*_e::integer)" (line 1, column 7)');
  assertEquals(e.details, 'unexpected "(" expecting "-", digit or any non reserved character different from: .,>()');
});

// --- raw query-string handling ------------------------------------------------------------

Deno.test("parseQueryString decodes plus, percent escapes and bare keys", () => {
  assertEquals(parseQueryString("a=1+2&b=%2C&c"), [
    { key: "a", value: "1 2" },
    { key: "b", value: "," },
    { key: "c", value: null },
  ]);
  assertEquals(parseQueryString("?x=1;y=2"), [
    { key: "x", value: "1" },
    { key: "y", value: "2" },
  ]);
  assertEquals(parseQueryString(""), []);
  assertEquals(parseQueryString("a=1&"), [{ key: "a", value: "1" }]);
  assertEquals(parseQueryString("d="), [{ key: "d", value: "" }]);
});

Deno.test("repeated filter keys each become filters", () => {
  const qs = parseQueryParams("id=gt.1&id=lt.10", false);
  assertEquals(qs.qsFilters, [
    [[], flt("id", [], opExpr(false, opQuant("OpGreaterThan", null, "1")))],
    [[], flt("id", [], opExpr(false, opQuant("OpLessThan", null, "10")))],
  ]);
});

Deno.test("select uses the first occurrence (L.lookup)", () => {
  const qs = parseQueryParams("select=id&select=name", false);
  assertEquals(qs.qsSelect, [node(sf("id"))]);
});

Deno.test("bare ?select (no =) falls back to * (join of Nothing)", () => {
  const qs = parseQueryParams("select&id=eq.1", false);
  assertEquals(qs.qsSelect, [node(sf("*"))]);
});

Deno.test("URLSearchParams input is accepted", () => {
  const qs = parseQueryParams(new URLSearchParams("select=id,name&id=eq.1"), false);
  assertEquals(qs.qsSelect, [node(sf("id")), node(sf("name"))]);
  assertEquals(qs.qsFilters.length, 1);
});

// --- broad grammar matrix -------------------------------------------------------------------

Deno.test("quoted identifiers with escapes", () => {
  assertEquals(ok(pFieldName, '"weird \\"name\\""'), 'weird "name"');
  assertEquals(ok(pFieldName, '"back\\\\slash"'), "back\\slash");
  const qs = parseQueryParams('select=%22quoted%20col%22', false);
  assertEquals(qs.qsSelect, [node(sf("quoted col"))]);
});

Deno.test("in lists with quoted values and backslash escapes", () => {
  assertEquals(ok(pOpExpr(pSingleVal), "in.(1,2,3)"), opExpr(false, { kind: "In", value: ["1", "2", "3"] }));
  assertEquals(
    ok(pOpExpr(pSingleVal), 'in.("a,b","c)d",plain)'),
    opExpr(false, { kind: "In", value: ["a,b", "c)d", "plain"] }),
  );
  assertEquals(ok(pOpExpr(pSingleVal), 'in.("quo\\"te")'), opExpr(false, { kind: "In", value: ['quo"te'] }));
  // lexeme eats ws right after "(" but inner spaces stay part of the value
  assertEquals(ok(pOpExpr(pSingleVal), "in.( 1, 2 )"), opExpr(false, { kind: "In", value: ["1", " 2 "] }));
});

Deno.test("is filter accepts null/true/false/unknown case-insensitively", () => {
  assertEquals(ok(pOpExpr(pSingleVal), "is.null"), opExpr(false, { kind: "Is", value: "TriNull" }));
  assertEquals(ok(pOpExpr(pSingleVal), "is.NULL"), opExpr(false, { kind: "Is", value: "TriNull" }));
  assertEquals(ok(pOpExpr(pSingleVal), "is.true"), opExpr(false, { kind: "Is", value: "TriTrue" }));
  assertEquals(ok(pOpExpr(pSingleVal), "is.False"), opExpr(false, { kind: "Is", value: "TriFalse" }));
  assertEquals(ok(pOpExpr(pSingleVal), "is.unknown"), opExpr(false, { kind: "Is", value: "TriUnknown" }));
  assertEquals(ok(pOpExpr(pSingleVal), "not.is.null"), opExpr(true, { kind: "Is", value: "TriNull" }));
});

Deno.test("isdistinct and simple operators", () => {
  assertEquals(ok(pOpExpr(pSingleVal), "isdistinct.5"), opExpr(false, { kind: "IsDistinctFrom", value: "5" }));
  assertEquals(ok(pOpExpr(pSingleVal), "neq.x"), opExpr(false, { kind: "Op", op: "OpNotEqual", value: "x" }));
  assertEquals(ok(pOpExpr(pSingleVal), "cs.{1,2}"), opExpr(false, { kind: "Op", op: "OpContains", value: "{1,2}" }));
  assertEquals(ok(pOpExpr(pSingleVal), "adj.(1,2)"), opExpr(false, { kind: "Op", op: "OpAdjacent", value: "(1,2)" }));
  assertEquals(ok(pOpExpr(pSingleVal), "nxl.(10,20)"), opExpr(false, { kind: "Op", op: "OpNotExtendsLeft", value: "(10,20)" }));
});

Deno.test("fts operators with optional language", () => {
  assertEquals(ok(pOpExpr(pSingleVal), "fts.cat"), opExpr(false, { kind: "Fts", op: "FilterFts", language: null, value: "cat" }));
  assertEquals(
    ok(pOpExpr(pSingleVal), "plfts(french).amusant"),
    opExpr(false, { kind: "Fts", op: "FilterFtsPlain", language: "french", value: "amusant" }),
  );
  assertEquals(ok(pOpExpr(pSingleVal), "phfts.c"), opExpr(false, { kind: "Fts", op: "FilterFtsPhrase", language: null, value: "c" }));
  assertEquals(ok(pOpExpr(pSingleVal), "wfts.c"), opExpr(false, { kind: "Fts", op: "FilterFtsWebsearch", language: null, value: "c" }));
});

Deno.test("quantified operators across the whole quantifiable set", () => {
  for (const [txt, op] of [
    ["eq", "OpEqual"],
    ["gte", "OpGreaterThanEqual"],
    ["gt", "OpGreaterThan"],
    ["lte", "OpLessThanEqual"],
    ["lt", "OpLessThan"],
    ["like", "OpLike"],
    ["ilike", "OpILike"],
    ["match", "OpMatch"],
    ["imatch", "OpIMatch"],
  ] as const) {
    assertEquals(ok(pOpExpr(pSingleVal), `${txt}.v`), opExpr(false, opQuant(op, null, "v")));
    assertEquals(ok(pOpExpr(pSingleVal), `${txt}(any).v`), opExpr(false, opQuant(op, "QuantAny", "v")));
  }
});

Deno.test("json path filters via pTreePath", () => {
  assertEquals(ok(pTreePath, "a.b.c->>d"), [["a", "b"], field("c", [j2A(jKey("d"))])]);
  assertEquals(ok(pTreePath, "id"), [[], field("id")]);
  assertEquals(ok(pTreePath, "data->1->>-2"), [[], field("data", [jA(jIdx("+1")), j2A(jIdx("-2"))])]);
});

Deno.test("aggregate functions in select, with and without casts", () => {
  assertEquals(ok(pFieldSelect, "amount.sum()"), sf("amount", [], { selAggregateFunction: "Sum" }));
  assertEquals(ok(pFieldSelect, "amount.avg()::int"), sf("amount", [], { selAggregateFunction: "Avg", selAggregateCast: "int" }));
  assertEquals(ok(pFieldSelect, "amount.max()"), sf("amount", [], { selAggregateFunction: "Max" }));
  assertEquals(ok(pFieldSelect, "amount.min()"), sf("amount", [], { selAggregateFunction: "Min" }));
  assertEquals(ok(pFieldSelect, "amount.count()"), sf("amount", [], { selAggregateFunction: "Count" }));
  assertEquals(
    ok(pFieldSelect, "total:amount::numeric.sum()::text"),
    sf("amount", [], { selAlias: "total", selCast: "numeric", selAggregateFunction: "Sum", selAggregateCast: "text" }),
  );
  // bare count() aggregates over the star field
  assertEquals(ok(pFieldSelect, "count()"), sf("*", [], { selAggregateFunction: "Count" }));
  assertEquals(ok(pFieldSelect, "cnt:count()::bigint"), sf("*", [], { selAlias: "cnt", selAggregateFunction: "Count", selAggregateCast: "bigint" }));
});

Deno.test("nested and/or logic with negation and pg arrays", () => {
  assertEquals<unknown>(
    ok(pLogicTree, "and(name.eq.N,or(id.eq.1,id.eq.2))"),
    lExpr(false, "And", [
      stmnt(flt("name", [], opExpr(false, opQuant("OpEqual", null, "N")))),
      lExpr(false, "Or", [
        stmnt(flt("id", [], opExpr(false, opQuant("OpEqual", null, "1")))),
        stmnt(flt("id", [], opExpr(false, opQuant("OpEqual", null, "2")))),
      ]),
    ]),
  );
  const negated = ok(pLogicTree, "not.and(id.eq.1)");
  assert(negated.kind === "Expr" && negated.negated);
  const arr = ok(pLogicTree, "or(arr.cs.{1,2},id.eq.3)");
  assert(arr.kind === "Expr");
  assertEquals<unknown>(arr.children[0], stmnt(flt("arr", [], opExpr(false, { kind: "Op", op: "OpContains", value: "{1,2}" }))));
});

Deno.test("whitespace tolerance inside logic trees (AndOrParamsSpec)", () => {
  const t = ok(pLogicTree, "and( and ( id.in.( 1, 2, 3 ) , id.eq.3 ) , or ( id.eq.2 , id.eq.3 ) )");
  assert(t.kind === "Expr" && t.op === "And" && t.children.length === 2);
});

Deno.test("logic path parsing incl. not and embed paths", () => {
  assertEquals(ok(pLogicPath, "and"), [[], "and"]);
  assertEquals(ok(pLogicPath, "not.or"), [[], "not.or"]);
  assertEquals(ok(pLogicPath, "clients.projects.and"), [["clients", "projects"], "and"]);
  assertEquals(ok(pLogicPath, "clients.not.and"), [["clients"], "not.and"]);
});

Deno.test("qsLogic assembles the embed path and the tree", () => {
  const qs = parseQueryParams("clients.or=(id.eq.1,id.eq.2)", false);
  assertEquals(qs.qsLogic.length, 1);
  assertEquals(qs.qsLogic[0][0], ["clients"]);
  assert(qs.qsLogic[0][1].kind === "Expr");
});

Deno.test("spread embeds and hints in a full select", () => {
  const qs = parseQueryParams("select=*,...projects!fk!left(id),clients!inner(name)", false);
  assertEquals(qs.qsSelect, [
    node(sf("*")),
    node(spread("projects", { selHint: "fk", selJoinType: "JTLeft" }), [node(sf("id"))]),
    node(rel("clients", { selJoinType: "JTInner" }), [node(sf("name"))]),
  ]);
});

Deno.test("filters partition into root and not-root", () => {
  const qs = parseQueryParams("id=eq.1&clients.id=eq.2&select=clients(id)", false);
  assertEquals(qs.qsFiltersRoot, [flt("id", [], opExpr(false, opQuant("OpEqual", null, "1")))]);
  assertEquals(qs.qsFiltersNotRoot, [[["clients"], flt("id", [], opExpr(false, opQuant("OpEqual", null, "2")))]]);
  assertEquals([...qs.qsFilterFields].sort(), ["clients.id", "id"]);
});

Deno.test("RPC GET params: non-reserved operator-less keys are qsParams", () => {
  const qs = parseQueryParams("a=1&b=two&id=eq.3&select=x&limit=4&order=a", true);
  assertEquals(qs.qsParams, [["a", "1"], ["b", "two"]]);
  assertEquals(qs.qsFilters.length, 1);
  assertEquals(qs.qsRanges.get("limit"), { lower: 0, upper: 3 });
  assertEquals(qs.qsOrder.length, 1);
});

Deno.test("RPC GET param whose value starts like an operator but is not", () => {
  const qs = parseQueryParams("x=equals", true);
  assertEquals(qs.qsParams, [["x", "equals"]]);
});

Deno.test("on_conflict and columns parse into field name lists", () => {
  const qs = parseQueryParams("on_conflict=id,name&columns=a,b,%22c%20d%22", false);
  assertEquals(qs.qsOnConflict, ["id", "name"]);
  assertEquals([...(qs.qsColumns ?? [])], ["a", "b", "c d"]);
  assertEquals(parseQueryParams("", false).qsColumns, null);
  assertEquals(parseQueryParams("", false).qsOnConflict, null);
});

Deno.test("doctest: pColumns via qsColumns simple cases", () => {
  assertEquals(ok(pColumns, "id"), ["id"]);
  assertEquals(ok(pColumns, "id, name , other"), ["id", "name", "other"]);
});

Deno.test("limit/offset params become ranges keyed by path", () => {
  const qs = parseQueryParams("limit=10&offset=5&clients.limit=2&clients.projects.offset=3", false);
  assertEquals(qs.qsRanges.get("limit"), { lower: 5, upper: 14 });
  assertEquals(qs.qsRanges.get("clients.limit"), { lower: 0, upper: 1 });
  assertEquals(qs.qsRanges.get("clients.projects.limit"), { lower: 3, upper: null });
  assertEquals(pRequestRange("clients.projects.limit", { lower: 3, upper: null }), [
    ["clients", "projects"],
    { lower: 3, upper: null },
  ]);
});

Deno.test("unparseable limit value falls back to allRange", () => {
  const qs = parseQueryParams("limit=abc", false);
  assertEquals(qs.qsRanges.get("limit"), { lower: 0, upper: null });
});

Deno.test("order on embedded levels", () => {
  const qs = parseQueryParams("clients.order=name.asc,id.desc.nullslast", false);
  assertEquals(qs.qsOrder, [
    [["clients"], [ordTerm("name", [], "OrderAsc", null), ordTerm("id", [], "OrderDesc", "OrderNullsLast")]],
  ]);
});

Deno.test("filters on json paths through the query string", () => {
  const qs = parseQueryParams("data->>id=eq.3", false);
  assertEquals(qs.qsFilters, [[[], flt("data", [j2A(jKey("id"))], opExpr(false, opQuant("OpEqual", null, "3")))]]);
});

Deno.test("quoted values in logic filters keep commas (AndOrParamsSpec)", () => {
  const t = ok(pLogicTree, 'or(name.eq."(grandchild,entity,4)",name.eq."(grandchild,entity,5)")');
  assert(t.kind === "Expr");
  assertEquals<unknown>(
    t.children[0],
    stmnt(flt("name", [], opExpr(false, opQuant("OpEqual", null, "(grandchild,entity,4)")))),
  );
});

Deno.test("canonical groups repeated keys with commas and percent-encodes", () => {
  assertEquals(parseQueryParams("b=2&a=1&a=3", true).qsCanonical, "a=1,3&b=2");
  assertEquals(parseQueryParams("a=%22x%20y%22", true).qsCanonical, "a=%22x%20y%22");
});
