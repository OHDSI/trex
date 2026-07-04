// Ports src/PostgREST/RangeQuery.hs (PostgREST v12.2.3) — logic for the
// Range/Content-Range headers and the limit/offset querystring arguments.
//
// Upstream models ranges with Data.Ranged. All ranges here are closed integer
// intervals whose boundaries may be absent: `lower: null` is BoundaryBelowAll
// and `upper: null` is BoundaryAboveAll. The Data.Ranged adjacency quirk is
// preserved: [n, n-1] (upper exactly one below lower) is NOT considered empty
// — that's what makes the limitZeroRange ([0, -1]) trick work upstream.

import { invalidRange, type PgrstError, type RangeError } from "../errors.ts";

export interface NonnegRange {
  /** Closed lower bound; null = BoundaryBelowAll (unbounded). */
  lower: number | null;
  /** Closed upper bound; null = BoundaryAboveAll (unbounded). */
  upper: number | null;
}

/** rangeGeq n: [n, +inf). */
export function rangeGeq(n: number): NonnegRange {
  return { lower: n, upper: null };
}

/** allRange: [0, +inf). */
export const allRange: NonnegRange = rangeGeq(0);

/** rangeLeq n: (-inf, n]. */
export function rangeLeq(n: number): NonnegRange {
  return { lower: null, upper: n };
}

/**
 * Special case to allow limit 0 queries (upstream issue #1121): 0 <= x <= -1,
 * an "empty" range that Data.Ranged's adjacency rule does not flag as empty.
 */
export const limitZeroRange: NonnegRange = { lower: 0, upper: -1 };

/**
 * Data.Ranged rangeIsEmpty (upper <= lower on boundaries): with closed
 * integer boundaries this means upper < lower - 1; adjacent boundaries
 * ([n, n-1]) compare as non-empty.
 */
export function rangeIsEmpty(r: NonnegRange): boolean {
  return r.lower !== null && r.upper !== null && r.upper < r.lower - 1;
}

/** Range equality (Data.Ranged: equal boundaries, or both empty). */
export function rangeEq(a: NonnegRange, b: NonnegRange): boolean {
  if (rangeIsEmpty(a) && rangeIsEmpty(b)) return true;
  return a.lower === b.lower && a.upper === b.upper;
}

/** Data.Ranged rangeIntersection (empty inputs give an empty range). */
export function rangeIntersection(r1: NonnegRange, r2: NonnegRange): NonnegRange {
  if (rangeIsEmpty(r1) || rangeIsEmpty(r2)) return { lower: 0, upper: -2 };
  const lower = r1.lower === null ? r2.lower : r2.lower === null ? r1.lower : Math.max(r1.lower, r2.lower);
  const upper = r1.upper === null ? r2.upper : r2.upper === null ? r1.upper : Math.min(r1.upper, r2.upper);
  return { lower, upper };
}

/** Haskell readMaybe @Integer, restricted to plain decimal (no hex/parens). */
export function readMaybeInteger(s: string): number | null {
  const t = s.trim();
  return /^-?\d+$/.test(t) ? Number.parseInt(t, 10) : null;
}

/**
 * rangeParse: parses a Range header value like "0-9" or "5-".
 * Anything not matching ^([0-9]+)-([0-9]*)$ is allRange.
 */
export function rangeParse(range: string): NonnegRange {
  const m = /^([0-9]+)-([0-9]*)$/.exec(range);
  if (m === null) return allRange;
  const lower = rangeGeq(Number.parseInt(m[1], 10));
  const upper = m[2] === "" ? allRange : rangeLeq(Number.parseInt(m[2], 10));
  return rangeIntersection(lower, upper);
}

/** rangeRequested: the Range header of the request, or allRange. */
export function rangeRequested(headers: Headers | [string, string][]): NonnegRange {
  let value: string | null = null;
  if (headers instanceof Headers) {
    value = headers.get("Range");
  } else {
    const hit = headers.find(([k]) => k.toLowerCase() === "range");
    value = hit === undefined ? null : hit[1];
  }
  return value === null ? allRange : rangeParse(value);
}

/** restrictRange: apply a limit on top of a range (keeps its offset). */
export function restrictRange(limit: number | null, r: NonnegRange): NonnegRange {
  if (limit === null) return r;
  return rangeIntersection(r, { lower: null, upper: rangeOffset(r) + limit - 1 });
}

/** rangeLimit: row count of a bounded range, or null when unbounded. */
export function rangeLimit(range: NonnegRange): number | null {
  if (range.lower !== null && range.upper !== null) return 1 + range.upper - range.lower;
  return null;
}

/** rangeOffset: the concrete lower bound (upstream panics without one). */
export function rangeOffset(range: NonnegRange): number {
  if (range.lower === null) throw new Error("range without lower bound"); // should never happen
  return range.lower;
}

/** hasLimitZero: the range was produced by limit=0. */
export function hasLimitZero(r: NonnegRange): boolean {
  return r.upper === limitZeroRange.upper;
}

/**
 * convertToLimitZeroRange: bypass empty-range validations when limit=0 is
 * present in the query params (not allowed for the Range header).
 */
export function convertToLimitZeroRange(range: NonnegRange, fallbackRange: NonnegRange): NonnegRange {
  return hasLimitZero(range) ? limitZeroRange : fallbackRange;
}

/**
 * contentRangeH: the Content-Range header value, e.g. "0-9/*", "*&#47;0",
 * "0-9/15".
 */
export function contentRangeH(lower: number, upper: number, total: number | null): [string, string] {
  const totalNotZero = total !== 0;
  const fromInRange = lower <= upper;
  const rangeString = totalNotZero && fromInRange ? `${lower}-${upper}` : "*";
  const totalString = total === null ? "*" : String(total);
  return ["Content-Range", `${rangeString}/${totalString}`];
}

/** rangeStatusHeader: HTTP status (200/206/416) + Content-Range header. */
export function rangeStatusHeader(
  topLevelRange: NonnegRange,
  queryTotal: number,
  tableTotal: number | null,
): { status: number; header: [string, string] } {
  const lower = rangeOffset(topLevelRange);
  const upper = lower + queryTotal - 1;
  const header = contentRangeH(lower, upper, tableTotal);
  let status = 200;
  if (tableTotal !== null) {
    if (lower > tableTotal) status = 416; // 416 Range Not Satisfiable
    else if (1 + upper - lower < tableTotal) status = 206; // 206 Partial Content
  }
  return { status, header };
}

/** Maps a RangeError to the PGRST103 error (Error.hs ApiRequestError). */
export function rangeError(err: RangeError): PgrstError {
  return invalidRange(err);
}
