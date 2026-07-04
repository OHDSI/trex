// Tests for functions/parse/range.ts (RangeQuery.hs port). The Haskell
// module has no doctests; these cases pin the Data.Ranged behaviors the port
// must preserve (incl. the limit-zero adjacency quirk) and the
// Content-Range/status logic.

import { assertEquals, assertThrows } from "std/assert/mod.ts";
import {
  allRange,
  contentRangeH,
  convertToLimitZeroRange,
  hasLimitZero,
  limitZeroRange,
  rangeEq,
  rangeGeq,
  rangeIntersection,
  rangeIsEmpty,
  rangeLeq,
  rangeLimit,
  rangeOffset,
  rangeParse,
  rangeRequested,
  rangeStatusHeader,
  readMaybeInteger,
  restrictRange,
} from "../functions/parse/range.ts";

Deno.test("rangeParse bounded, half-open and invalid ranges", () => {
  assertEquals(rangeParse("0-9"), { lower: 0, upper: 9 });
  assertEquals(rangeParse("5-"), { lower: 5, upper: null });
  assertEquals(rangeParse("5-7"), { lower: 5, upper: 7 });
  // no leading digits / garbage → allRange
  assertEquals(rangeParse("-9"), allRange);
  assertEquals(rangeParse("bytes=0-9"), allRange);
  assertEquals(rangeParse(""), allRange);
  assertEquals(rangeParse("1-2-3"), allRange);
});

Deno.test("rangeRequested reads the Range header", () => {
  assertEquals(rangeRequested(new Headers({ Range: "0-4" })), { lower: 0, upper: 4 });
  assertEquals(rangeRequested(new Headers()), allRange);
  assertEquals(rangeRequested([["Range", "2-"]]), { lower: 2, upper: null });
});

Deno.test("restrictRange applies a limit keeping the offset", () => {
  assertEquals(restrictRange(null, { lower: 5, upper: null }), { lower: 5, upper: null });
  assertEquals(restrictRange(10, allRange), { lower: 0, upper: 9 });
  assertEquals(restrictRange(10, { lower: 5, upper: null }), { lower: 5, upper: 14 });
  assertEquals(restrictRange(3, { lower: 5, upper: 6 }), { lower: 5, upper: 6 });
  // limit=0 produces the limitZeroRange shape at the offset
  assertEquals(restrictRange(0, allRange), limitZeroRange);
});

Deno.test("rangeLimit and rangeOffset", () => {
  assertEquals(rangeLimit({ lower: 0, upper: 9 }), 10);
  assertEquals(rangeLimit(allRange), null);
  assertEquals(rangeLimit({ lower: null, upper: 9 }), null);
  assertEquals(rangeOffset({ lower: 5, upper: null }), 5);
  assertThrows(() => rangeOffset({ lower: null, upper: 9 }), Error, "range without lower bound");
});

Deno.test("rangeGeq / rangeLeq / allRange", () => {
  assertEquals(rangeGeq(3), { lower: 3, upper: null });
  assertEquals(rangeLeq(3), { lower: null, upper: 3 });
  assertEquals(allRange, { lower: 0, upper: null });
});

Deno.test("Data.Ranged emptiness: adjacent boundaries are NOT empty", () => {
  // [0,-1] (limit zero) is not "empty" — the upstream trick relies on this
  assertEquals(rangeIsEmpty(limitZeroRange), false);
  assertEquals(rangeIsEmpty({ lower: 5, upper: 4 }), false); // adjacent
  assertEquals(rangeIsEmpty({ lower: 5, upper: 3 }), true);
  assertEquals(rangeIsEmpty({ lower: 0, upper: -2 }), true); // limit=-1
  assertEquals(rangeIsEmpty(allRange), false);
  assertEquals(rangeIsEmpty({ lower: null, upper: -5 }), false);
});

Deno.test("rangeEq treats empty ranges as equal", () => {
  assertEquals(rangeEq({ lower: 5, upper: 1 }, { lower: 9, upper: 2 }), true);
  assertEquals(rangeEq(allRange, { lower: 0, upper: null }), true);
  assertEquals(rangeEq(allRange, { lower: 0, upper: 3 }), false);
});

Deno.test("rangeIntersection", () => {
  assertEquals(rangeIntersection(rangeGeq(5), rangeLeq(9)), { lower: 5, upper: 9 });
  assertEquals(rangeIntersection({ lower: 0, upper: 9 }, { lower: 3, upper: 20 }), { lower: 3, upper: 9 });
  assertEquals(rangeIntersection(allRange, allRange), allRange);
  assertEquals(rangeIsEmpty(rangeIntersection({ lower: 0, upper: 1 }, { lower: 5, upper: 9 })), true);
});

Deno.test("hasLimitZero and convertToLimitZeroRange", () => {
  assertEquals(hasLimitZero(limitZeroRange), true);
  assertEquals(hasLimitZero({ lower: 3, upper: -1 }), true); // upper comparison only
  assertEquals(hasLimitZero(allRange), false);
  assertEquals(convertToLimitZeroRange(limitZeroRange, allRange), limitZeroRange);
  assertEquals(convertToLimitZeroRange({ lower: 0, upper: 9 }, { lower: 0, upper: 4 }), { lower: 0, upper: 4 });
});

Deno.test("readMaybeInteger", () => {
  assertEquals(readMaybeInteger("15"), 15);
  assertEquals(readMaybeInteger("-3"), -3);
  assertEquals(readMaybeInteger(" 7 "), 7);
  assertEquals(readMaybeInteger("abc"), null);
  assertEquals(readMaybeInteger("1.5"), null);
  assertEquals(readMaybeInteger(""), null);
});

Deno.test("contentRangeH renders 0-9/*, */0 and 0-9/15", () => {
  assertEquals(contentRangeH(0, 9, null), ["Content-Range", "0-9/*"]);
  assertEquals(contentRangeH(0, -1, 0), ["Content-Range", "*/0"]);
  assertEquals(contentRangeH(0, 9, 15), ["Content-Range", "0-9/15"]);
  assertEquals(contentRangeH(5, 4, 15), ["Content-Range", "*/15"]); // lower > upper
  assertEquals(contentRangeH(0, 9, 0), ["Content-Range", "*/0"]); // total 0 → star
});

Deno.test("rangeStatusHeader: 200 without count", () => {
  const r = rangeStatusHeader(allRange, 10, null);
  assertEquals(r.status, 200);
  assertEquals(r.header, ["Content-Range", "0-9/*"]);
});

Deno.test("rangeStatusHeader: 206 partial content", () => {
  const r = rangeStatusHeader({ lower: 0, upper: 9 }, 10, 15);
  assertEquals(r.status, 206);
  assertEquals(r.header, ["Content-Range", "0-9/15"]);
});

Deno.test("rangeStatusHeader: 200 when the whole set is returned", () => {
  const r = rangeStatusHeader(allRange, 15, 15);
  assertEquals(r.status, 200);
  assertEquals(r.header, ["Content-Range", "0-14/15"]);
});

Deno.test("rangeStatusHeader: 416 when offset is past the total", () => {
  const r = rangeStatusHeader({ lower: 100, upper: null }, 0, 15);
  assertEquals(r.status, 416);
  assertEquals(r.header, ["Content-Range", "*/15"]);
});
