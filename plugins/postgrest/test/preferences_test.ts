// Tests for functions/parse/preferences.ts — transcribes the Preferences.hs
// doctests plus a parse matrix and Preference-Applied rendering.

import { assertEquals } from "std/assert/mod.ts";
import { fromHeaders, prefAppliedHeader, type Preferences, shouldCount, toHeaderValue } from "../functions/parse/preferences.ts";

const tz = new Set(["America/Los_Angeles"]);

Deno.test("doctest: one header with comma-separated values sets multiple preferences", () => {
  const p = fromHeaders(true, tz, [
    ["Prefer", "resolution=ignore-duplicates, count=exact, timezone=America/Los_Angeles, max-affected=100"],
  ]);
  assertEquals(p, {
    preferResolution: "IgnoreDuplicates",
    preferRepresentation: null,
    preferParameters: null,
    preferCount: "ExactCount",
    preferTransaction: null,
    preferMissing: null,
    preferHandling: null,
    preferTimezone: "America/Los_Angeles",
    preferMaxAffected: 100,
    invalidPrefs: [],
  } satisfies Preferences);
});

Deno.test("doctest: multiple Prefer headers combine; invalid prefs are collected", () => {
  const p = fromHeaders(true, tz, [
    ["Prefer", "resolution=ignore-duplicates"],
    ["Prefer", "count=exact"],
    ["Prefer", "missing=null"],
    ["Prefer", "handling=lenient"],
    ["Prefer", "invalid"],
    ["Prefer", "max-affected=5999"],
  ]);
  assertEquals(p.preferResolution, "IgnoreDuplicates");
  assertEquals(p.preferCount, "ExactCount");
  assertEquals(p.preferMissing, "ApplyNulls");
  assertEquals(p.preferHandling, "Lenient");
  assertEquals(p.preferMaxAffected, 5999);
  assertEquals(p.invalidPrefs, ["invalid"]);
});

Deno.test("doctest: if a preference is set more than once, only the first is used", () => {
  const p = fromHeaders(true, tz, [["Prefer", "tx=commit, tx=rollback"]]);
  assertEquals(p.preferTransaction, "Commit");
});

Deno.test("doctest: first-wins also holds across multiple headers", () => {
  const p = fromHeaders(true, tz, [
    ["Prefer", "resolution=ignore-duplicates"],
    ["Prefer", "resolution=merge-duplicates"],
  ]);
  assertEquals(p.preferResolution, "IgnoreDuplicates");
});

Deno.test("doctest: arbitrary spacing and lower-case header name", () => {
  const p = fromHeaders(true, tz, [
    ["prefer", "count=exact,    tx=commit   ,return=representation , missing=default, handling=strict, anything"],
  ]);
  assertEquals(p.preferResolution, null);
  assertEquals(p.preferRepresentation, "Full");
  assertEquals(p.preferParameters, null);
  assertEquals(p.preferCount, "ExactCount");
  assertEquals(p.preferTransaction, "Commit");
  assertEquals(p.preferMissing, "ApplyDefaults");
  assertEquals(p.preferHandling, "Strict");
  assertEquals(p.preferTimezone, null);
  assertEquals(p.preferMaxAffected, null);
  assertEquals(p.invalidPrefs, ["anything"]);
});

Deno.test("doctest: toHeaderValue MergeDuplicates", () => {
  assertEquals(toHeaderValue("MergeDuplicates"), "resolution=merge-duplicates");
});

Deno.test("full parse matrix of enum preferences", () => {
  const cases: [string, keyof Preferences, unknown][] = [
    ["resolution=merge-duplicates", "preferResolution", "MergeDuplicates"],
    ["resolution=ignore-duplicates", "preferResolution", "IgnoreDuplicates"],
    ["return=representation", "preferRepresentation", "Full"],
    ["return=minimal", "preferRepresentation", "None"],
    ["return=headers-only", "preferRepresentation", "HeadersOnly"],
    ["params=single-object", "preferParameters", "SingleObject"],
    ["count=exact", "preferCount", "ExactCount"],
    ["count=planned", "preferCount", "PlannedCount"],
    ["count=estimated", "preferCount", "EstimatedCount"],
    ["tx=commit", "preferTransaction", "Commit"],
    ["tx=rollback", "preferTransaction", "Rollback"],
    ["missing=default", "preferMissing", "ApplyDefaults"],
    ["missing=null", "preferMissing", "ApplyNulls"],
    ["handling=strict", "preferHandling", "Strict"],
    ["handling=lenient", "preferHandling", "Lenient"],
  ];
  for (const [header, key, expected] of cases) {
    const p = fromHeaders(true, tz, [["Prefer", header]]);
    assertEquals(p[key], expected, header);
    assertEquals(p.invalidPrefs, [], header);
  }
});

Deno.test("tx prefs are ignored (not invalid) unless db-tx-end allows override", () => {
  const p = fromHeaders(false, tz, [["Prefer", "tx=rollback"]]);
  assertEquals(p.preferTransaction, null);
  assertEquals(p.invalidPrefs, []);
});

Deno.test("unknown timezones are invalid and not applied", () => {
  const p = fromHeaders(true, tz, [["Prefer", "timezone=Not/AZone"]]);
  assertEquals(p.preferTimezone, null);
  assertEquals(p.invalidPrefs, ["timezone=Not/AZone"]);
});

Deno.test("unparseable max-affected is ignored but not invalid", () => {
  const p = fromHeaders(true, tz, [["Prefer", "max-affected=abc"]]);
  assertEquals(p.preferMaxAffected, null);
  assertEquals(p.invalidPrefs, []);
});

Deno.test("fromHeaders accepts a Headers object", () => {
  const h = new Headers();
  h.append("Prefer", "count=planned");
  h.append("Prefer", "return=minimal");
  const p = fromHeaders(true, tz, h);
  assertEquals(p.preferCount, "PlannedCount");
  assertEquals(p.preferRepresentation, "None");
});

Deno.test("shouldCount", () => {
  assertEquals(shouldCount("ExactCount"), true);
  assertEquals(shouldCount("EstimatedCount"), true);
  assertEquals(shouldCount("PlannedCount"), false);
  assertEquals(shouldCount(null), false);
});

Deno.test("prefAppliedHeader renders in upstream order", () => {
  const p = fromHeaders(true, tz, [
    ["Prefer", "handling=strict, timezone=America/Los_Angeles, max-affected=10, count=exact, return=minimal, missing=null, resolution=merge-duplicates, tx=rollback, params=single-object"],
  ]);
  assertEquals(
    prefAppliedHeader(p),
    "resolution=merge-duplicates, missing=null, return=minimal, params=single-object, count=exact, tx=rollback, handling=strict, timezone=America/Los_Angeles, max-affected=10",
  );
});

Deno.test("prefAppliedHeader omits max-affected unless handling=strict", () => {
  const p = fromHeaders(true, tz, [["Prefer", "handling=lenient, max-affected=10"]]);
  assertEquals(prefAppliedHeader(p), "handling=lenient");
});

Deno.test("prefAppliedHeader is null when nothing applied", () => {
  const p = fromHeaders(true, tz, [["Prefer", "nonsense"]]);
  assertEquals(prefAppliedHeader(p), null);
  assertEquals(prefAppliedHeader(fromHeaders(true, tz, [])), null);
});
