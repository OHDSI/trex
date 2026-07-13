// A minimal Parsec (Text.ParserCombinators.Parsec) clone, faithful enough to
// reproduce PostgREST's query-string parse errors byte-for-byte.
//
// QueryParams.hs turns Parsec's ParseError into the PGRST100 body via
// `show (errorPos e)` and `showErrorMessages "or" "unknown parse error"
// "expecting" "unexpected" "end of input"` — so this module replicates:
//
//   * the consumed/empty reply distinction (try / <|> backtracking),
//   * error merging (mergeError: highest position wins, same position
//     concatenates messages),
//   * message kinds (SysUnExpect < UnExpect < Expect < Message) and the
//     <?> label rule (replace Expect messages on empty replies),
//   * `string`'s "error at match start" behavior,
//   * eof reporting the offending char Haskell-`show`n in single quotes while
//     satisfy/string report it double-quoted,
//   * showErrorMessages rendering (nub, "or" separator, end-of-input text).

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

/** Text.Parsec.Error Message constructors; the order is the Enum/Ord order. */
export const SYS_UNEXPECT = 0;
export const UNEXPECT = 1;
export const EXPECT = 2;
export const RAW_MESSAGE = 3;

export interface Msg {
  kind: 0 | 1 | 2 | 3;
  text: string;
}

/** ParseError: a string offset plus messages (offset → line/col lazily). */
export interface PError {
  pos: number;
  msgs: Msg[];
}

export function unknownError(pos: number): PError {
  return { pos, msgs: [] };
}

/** Text.Parsec.Error mergeError. */
export function mergeError(e1: PError, e2: PError): PError {
  if (e2.msgs.length === 0 && e1.msgs.length !== 0) return e1;
  if (e1.msgs.length === 0 && e2.msgs.length !== 0) return e2;
  if (e1.pos === e2.pos) return { pos: e1.pos, msgs: [...e1.msgs, ...e2.msgs] };
  return e1.pos > e2.pos ? e1 : e2;
}

/** Text.Parsec.Error setErrorMessage (used by <?>): replace Expect msgs. */
function setExpect(e: PError, text: string): PError {
  return { pos: e.pos, msgs: [{ kind: EXPECT, text }, ...e.msgs.filter((m) => m.kind !== EXPECT)] };
}

// --------------------------------------------------------------------------
// Haskell `show` for Chars and Strings (GHC.Show showLitChar)
// --------------------------------------------------------------------------

const ASCII_TAB = [
  "NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL",
  "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI",
  "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB",
  "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US",
];

function showLitChar(c: string, next: string | null): string {
  const code = c.codePointAt(0) ?? 0;
  if (code > 127) {
    // protectEsc isDigit: a following digit needs the "\&" separator
    const guard = next !== null && next >= "0" && next <= "9" ? "\\&" : "";
    return `\\${code}${guard}`;
  }
  if (code === 127) return "\\DEL";
  if (c === "\\") return "\\\\";
  if (code >= 32) return c;
  if (c === "\x07") return "\\a";
  if (c === "\b") return "\\b";
  if (c === "\f") return "\\f";
  if (c === "\n") return "\\n";
  if (c === "\r") return "\\r";
  if (c === "\t") return "\\t";
  if (c === "\v") return "\\v";
  if (code === 14) return `\\SO${next === "H" ? "\\&" : ""}`;
  return `\\${ASCII_TAB[code]}`;
}

/** Haskell `show` of a String — double-quoted, escaped. */
export function showHsString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      out += '\\"';
      continue;
    }
    out += showLitChar(c, i + 1 < s.length ? s[i + 1] : null);
  }
  return `${out}"`;
}

/** Haskell `show` of a Char — single-quoted, escaped. */
export function showHsChar(c: string): string {
  if (c === "'") return "'\\''";
  return `'${showLitChar(c, null)}'`;
}

// --------------------------------------------------------------------------
// Replies and the parser type
// --------------------------------------------------------------------------

export interface Ok<A> {
  ok: true;
  value: A;
  index: number;
  consumed: boolean;
  /** Carried error for later merging (Parsec threads errors through eok). */
  error: PError;
}

export interface Fail {
  ok: false;
  consumed: boolean;
  error: PError;
}

export type Reply<A> = Ok<A> | Fail;

export type Parser<A> = (input: string, index: number) => Reply<A>;

function emptyOk<A>(value: A, index: number, error?: PError): Ok<A> {
  return { ok: true, value, index, consumed: false, error: error ?? unknownError(index) };
}

// --------------------------------------------------------------------------
// Core combinators
// --------------------------------------------------------------------------

export function pure<A>(value: A): Parser<A> {
  return (_s, i) => emptyOk(value, i);
}

/** parserZero / mzero (what `guard False` produces). */
export const parserZero: Parser<never> = (_s, i) => ({ ok: false, consumed: false, error: unknownError(i) });

export function bind<A, B>(p: Parser<A>, f: (a: A) => Parser<B>): Parser<B> {
  return (s, i) => {
    const r = p(s, i);
    if (!r.ok) return r;
    const r2 = f(r.value)(s, r.index);
    const consumed = r.consumed || r2.consumed;
    // Parsec parserBind: q consuming input discards p's carried error.
    const error = r2.consumed ? r2.error : mergeError(r.error, r2.error);
    if (!r2.ok) return { ok: false, consumed, error };
    return { ok: true, value: r2.value, index: r2.index, consumed, error };
  };
}

export function fmap<A, B>(p: Parser<A>, f: (a: A) => B): Parser<B> {
  return (s, i) => {
    const r = p(s, i);
    if (!r.ok) return r;
    return { ok: true, value: f(r.value), index: r.index, consumed: r.consumed, error: r.error };
  };
}

/** p *> q */
export function then_<A, B>(p: Parser<A>, q: Parser<B>): Parser<B> {
  return bind(p, () => q);
}

/** p <* q */
export function left<A, B>(p: Parser<A>, q: Parser<B>): Parser<A> {
  return bind(p, (a) => fmap(q, () => a));
}

/** p <|> q */
export function alt<A>(p: Parser<A>, q: Parser<A>): Parser<A> {
  return (s, i) => {
    const r = p(s, i);
    if (r.ok || r.consumed) return r;
    const r2 = q(s, i);
    if (r2.consumed) return r2;
    return { ...r2, error: mergeError(r.error, r2.error) };
  };
}

export function choice<A>(ps: Parser<A>[]): Parser<A> {
  return ps.reduce((acc, p) => alt(acc, p));
}

/** Parsec `try`: a consumed failure becomes an empty one (backtrack). */
export function tryP<A>(p: Parser<A>): Parser<A> {
  return (s, i) => {
    const r = p(s, i);
    if (!r.ok && r.consumed) return { ok: false, consumed: false, error: r.error };
    return r;
  };
}

/** Parsec lookAhead: success consumes nothing; failures propagate as-is. */
export function lookAhead<A>(p: Parser<A>): Parser<A> {
  return (s, i) => {
    const r = p(s, i);
    if (!r.ok) return r;
    return emptyOk(r.value, i);
  };
}

/** p <?> msg: on empty replies, replace the Expect messages with `msg`. */
export function label<A>(p: Parser<A>, msg: string): Parser<A> {
  return (s, i) => {
    const r = p(s, i);
    if (r.consumed) return r;
    if (r.ok) {
      if (r.error.msgs.length === 0) return r;
      return { ...r, error: setExpect(r.error, msg) };
    }
    return { ...r, error: setExpect(r.error, msg) };
  };
}

export function many<A>(p: Parser<A>): Parser<A[]> {
  return (s, i) => {
    const out: A[] = [];
    let idx = i;
    let consumed = false;
    for (;;) {
      const r = p(s, idx);
      if (r.ok) {
        if (!r.consumed) throw new Error("combinator 'many' applied to a parser that accepts an empty string");
        out.push(r.value);
        idx = r.index;
        consumed = true;
      } else {
        if (r.consumed) return r;
        return { ok: true, value: out, index: idx, consumed, error: r.error };
      }
    }
  };
}

export function many1<A>(p: Parser<A>): Parser<A[]> {
  return bind(p, (x) => fmap(many(p), (xs) => [x, ...xs]));
}

export function sepBy1<A, B>(p: Parser<A>, sep: Parser<B>): Parser<A[]> {
  return bind(p, (x) => fmap(many(then_(sep, p)), (xs) => [x, ...xs]));
}

export function sepBy<A, B>(p: Parser<A>, sep: Parser<B>): Parser<A[]> {
  return alt(sepBy1(p, sep), pure([]));
}

export function between<O, C, A>(open: Parser<O>, close: Parser<C>, p: Parser<A>): Parser<A> {
  return then_(open, left(p, close));
}

export function option<A>(def: A, p: Parser<A>): Parser<A> {
  return alt(p, pure(def));
}

export function optionMaybe<A>(p: Parser<A>): Parser<A | null> {
  return option<A | null>(null, p);
}

/**
 * Parsec notFollowedBy: `try $ do{ c <- try p; unexpected (show c) } <|>
 * return ()`. On p succeeding, the UnExpect error sits at the position after
 * p (satisfy advances the position); on p failing, its error is carried.
 */
export function notFollowedBy<A>(p: Parser<A>, show: (a: A) => string = (a) => showHsChar(String(a))): Parser<undefined> {
  return (s, i) => {
    const r = tryP(p)(s, i);
    if (r.ok) return { ok: false, consumed: false, error: { pos: r.index, msgs: [{ kind: UNEXPECT, text: show(r.value) }] } };
    return { ok: true, value: undefined, index: i, consumed: false, error: r.error };
  };
}

/**
 * Parsec eof = notFollowedBy anyToken <?> "end of input". anyToken does not
 * advance the position, so the offending char is reported at its own column
 * and single-quoted (via `show :: Char -> String`).
 */
export const eof: Parser<undefined> = (s, i) => {
  if (i >= s.length) {
    return {
      ok: true,
      value: undefined,
      index: i,
      consumed: false,
      error: { pos: i, msgs: [{ kind: EXPECT, text: "end of input" }, { kind: SYS_UNEXPECT, text: "" }] },
    };
  }
  return {
    ok: false,
    consumed: false,
    error: { pos: i, msgs: [{ kind: EXPECT, text: "end of input" }, { kind: UNEXPECT, text: showHsChar(s[i]) }] },
  };
};

// --------------------------------------------------------------------------
// Character primitives
// --------------------------------------------------------------------------

export function satisfy(pred: (c: string) => boolean): Parser<string> {
  return (s, i) => {
    if (i >= s.length) return { ok: false, consumed: false, error: { pos: i, msgs: [{ kind: SYS_UNEXPECT, text: "" }] } };
    const c = s[i];
    if (pred(c)) return { ok: true, value: c, index: i + 1, consumed: true, error: unknownError(i + 1) };
    return { ok: false, consumed: false, error: { pos: i, msgs: [{ kind: SYS_UNEXPECT, text: showHsString(c) }] } };
  };
}

export function char(c: string): Parser<string> {
  return label(satisfy((x) => x === c), showHsString(c));
}

export const anyChar: Parser<string> = satisfy(() => true);

export function oneOf(cs: string): Parser<string> {
  return satisfy((c) => cs.includes(c));
}

export function noneOf(cs: string): Parser<string> {
  return satisfy((c) => !cs.includes(c));
}

export const digit: Parser<string> = label(satisfy((c) => c >= "0" && c <= "9"), "digit");

// Data.Char.isAlpha covers all unicode letters.
const LETTER_RE = /\p{L}/u;
export const letter: Parser<string> = label(satisfy((c) => LETTER_RE.test(c)), "letter");

/**
 * Parsec `string` (tokens): errors always sit at the match start; the first
 * char failing gives an empty reply, later chars a consumed one.
 */
export function string(str: string): Parser<string> {
  return (s, i) => {
    if (str.length === 0) return emptyOk("", i);
    for (let k = 0; k < str.length; k++) {
      const found = i + k >= s.length ? "" : showHsString(s[i + k]);
      if (i + k >= s.length || s[i + k] !== str[k]) {
        return {
          ok: false,
          consumed: k > 0,
          error: { pos: i, msgs: [{ kind: SYS_UNEXPECT, text: found }, { kind: EXPECT, text: showHsString(str) }] },
        };
      }
    }
    return { ok: true, value: str, index: i + str.length, consumed: true, error: unknownError(i + str.length) };
  };
}

// --------------------------------------------------------------------------
// do-notation via generators (each run restarts the generator, so
// backtracking re-executes the whole block — matching a pure parser).
// --------------------------------------------------------------------------

export function doP<A>(gen: () => Generator<Parser<unknown>, A, unknown>): Parser<A> {
  return (s, i) => {
    const it = gen();
    let idx = i;
    let consumed = false;
    let error = unknownError(i);
    let feed: unknown;
    for (;;) {
      const n = it.next(feed);
      if (n.done) return { ok: true, value: n.value, index: idx, consumed, error };
      const r = n.value(s, idx);
      if (!r.ok) {
        return { ok: false, consumed: consumed || r.consumed, error: r.consumed ? r.error : mergeError(error, r.error) };
      }
      error = r.consumed ? r.error : mergeError(error, r.error);
      consumed = consumed || r.consumed;
      idx = r.index;
      feed = r.value;
    }
  };
}

/** Defers resolution — for mutually recursive grammars. */
export function ref<A>(f: () => Parser<A>): Parser<A> {
  return (s, i) => f()(s, i);
}

// --------------------------------------------------------------------------
// Running parsers and rendering errors
// --------------------------------------------------------------------------

export type RunResult<A> = { ok: true; value: A } | { ok: false; error: PError };

/** P.parse: run at offset 0; does NOT require the input to be consumed. */
export function runParser<A>(p: Parser<A>, input: string): RunResult<A> {
  const r = p(input, 0);
  if (r.ok) return { ok: true, value: r.value };
  return { ok: false, error: r.error };
}

export interface SourcePosition {
  line: number;
  column: number;
}

/** Text.Parsec.Pos updatePosChar folded over the input prefix. */
export function errorPosition(input: string, e: PError): SourcePosition {
  let line = 1;
  let column = 1;
  const end = Math.min(e.pos, input.length);
  for (let i = 0; i < end; i++) {
    const c = input[i];
    if (c === "\n") {
      line++;
      column = 1;
    } else if (c === "\t") {
      column = column + 8 - ((column - 1) % 8);
    } else {
      column++;
    }
  }
  return { line, column };
}

function nubNonEmpty(xs: string[]): string[] {
  return [...new Set(xs.filter((x) => x !== ""))];
}

/**
 * Text.Parsec.Error showErrorMessages "or" "unknown parse error" "expecting"
 * "unexpected" "end of input" — pre-joined with spaces and stripped, exactly
 * like QueryParams.hs mapError does with the raw newline-separated output.
 */
export function formatDetails(e: PError): string {
  if (e.msgs.length === 0) return "unknown parse error";
  const of_ = (kind: number) => e.msgs.filter((m) => m.kind === kind);
  const sysUnExpect = of_(SYS_UNEXPECT);
  const unExpect = of_(UNEXPECT);
  const expect = of_(EXPECT);
  const messages = of_(RAW_MESSAGE);

  const commasOr = (ms: string[]): string => {
    if (ms.length === 0) return "";
    if (ms.length === 1) return ms[0];
    return `${ms.slice(0, -1).join(", ")} or ${ms[ms.length - 1]}`;
  };
  const showMany = (pre: string, ms: Msg[]): string => {
    const cleaned = nubNonEmpty(ms.map((m) => m.text));
    if (cleaned.length === 0) return "";
    return pre === "" ? commasOr(cleaned) : `${pre} ${commasOr(cleaned)}`;
  };

  const showUnExpect = showMany("unexpected", unExpect);
  const showExpect = showMany("expecting", expect);
  const showMessages = showMany("", messages);
  let showSysUnExpect: string;
  if (unExpect.length > 0 || sysUnExpect.length === 0) {
    showSysUnExpect = "";
  } else if (sysUnExpect[0].text === "") {
    showSysUnExpect = "unexpected end of input";
  } else {
    showSysUnExpect = `unexpected ${sysUnExpect[0].text}`;
  }

  return nubNonEmpty([showSysUnExpect, showUnExpect, showExpect, showMessages]).join(" ");
}

/**
 * QueryParams.hs mapError: message is `show (errorPos e)` for a named source
 * — `"<name>" (line l, column c)` — and details is the flattened
 * showErrorMessages output.
 */
export function toQPError(sourceName: string, input: string, e: PError): { qpMessage: string; qpDetails: string } {
  const { line, column } = errorPosition(input, e);
  return {
    qpMessage: `"${sourceName}" (line ${line}, column ${column})`,
    qpDetails: formatDetails(e),
  };
}
