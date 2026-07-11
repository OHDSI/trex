// Tests for functions/parse/media-type.ts — transcribes the MediaType.hs
// doctests (decodeMediaType + tokenizeMediaType) plus toMime/toContentType
// and the wai-extra parseHttpAccept ordering.

import { assertEquals } from "std/assert/mod.ts";
import {
  decodeMediaType,
  type MediaType,
  parseHttpAccept,
  toContentType,
  toMime,
  tokenizeMediaType,
} from "../functions/parse/media-type.ts";

const json: MediaType = { kind: "MTApplicationJSON" };

Deno.test("doctest: decodeMediaType application/json", () => {
  assertEquals(decodeMediaType("application/json"), json);
});

Deno.test("doctest: decodeMediaType application/vnd.pgrst.plan;", () => {
  assertEquals(decodeMediaType("application/vnd.pgrst.plan;"), {
    kind: "MTVndPlan",
    mtFor: json,
    format: "PlanText",
    options: [],
  });
});

Deno.test('doctest: decodeMediaType application/vnd.pgrst.plan;for="application/json"', () => {
  assertEquals(decodeMediaType('application/vnd.pgrst.plan;for="application/json"'), {
    kind: "MTVndPlan",
    mtFor: json,
    format: "PlanText",
    options: [],
  });
});

Deno.test('doctest: decodeMediaType application/vnd.pgrst.plan+json;for="text/csv"', () => {
  assertEquals(decodeMediaType('application/vnd.pgrst.plan+json;for="text/csv"'), {
    kind: "MTVndPlan",
    mtFor: { kind: "MTTextCSV" },
    format: "PlanJSON",
    options: [],
  });
});

Deno.test("doctest: decodeMediaType vnd.pgrst.array with and without nulls=stripped", () => {
  assertEquals(decodeMediaType("application/vnd.pgrst.array+json;nulls=stripped"), { kind: "MTVndArrayJSONStrip" });
  assertEquals(decodeMediaType("application/vnd.pgrst.array+json"), json);
});

Deno.test("doctest: decodeMediaType vnd.pgrst.object with and without nulls=stripped", () => {
  assertEquals(decodeMediaType("application/vnd.pgrst.object+json;nulls=stripped"), {
    kind: "MTVndSingularJSON",
    stripNulls: true,
  });
  assertEquals(decodeMediaType("application/vnd.pgrst.object+json"), { kind: "MTVndSingularJSON", stripNulls: false });
});

Deno.test("doctest: decodeMediaType parses uppercase (issue #3478)", () => {
  assertEquals(decodeMediaType("ApplicatIon/vnd.PgRsT.object+json"), { kind: "MTVndSingularJSON", stripNulls: false });
});

Deno.test("doctest: decodeMediaType unknown type is MTOther", () => {
  assertEquals(decodeMediaType("application/vnd.twkb"), { kind: "MTOther", value: "application/vnd.twkb" });
});

Deno.test('doctest: tokenizeMediaType application/vnd.pgrst.plan+json;for="text/csv"', () => {
  assertEquals(tokenizeMediaType('application/vnd.pgrst.plan+json;for="text/csv"'), [
    "application",
    "vnd.pgrst.plan+json",
    [["for", "text/csv"]],
  ]);
});

Deno.test("doctest: tokenizeMediaType */*", () => {
  assertEquals(tokenizeMediaType("*/*"), ["*", "*", []]);
});

Deno.test("doctest: tokenizeMediaType is naive about ';' in quoted values", () => {
  assertEquals(tokenizeMediaType('application/vnd.pgrst.plan;wat="application/json;text/csv"'), [
    "application",
    "vnd.pgrst.plan",
    [["wat", "application/json"], ['text/csv"', ""]],
  ]);
});

Deno.test("decodeMediaType covers the full catalog", () => {
  assertEquals(decodeMediaType("application/geo+json"), { kind: "MTGeoJSON" });
  assertEquals(decodeMediaType("text/csv"), { kind: "MTTextCSV" });
  assertEquals(decodeMediaType("text/plain"), { kind: "MTTextPlain" });
  assertEquals(decodeMediaType("text/xml"), { kind: "MTTextXML" });
  assertEquals(decodeMediaType("application/openapi+json"), { kind: "MTOpenAPI" });
  assertEquals(decodeMediaType("application/x-www-form-urlencoded"), { kind: "MTUrlEncoded" });
  assertEquals(decodeMediaType("application/octet-stream"), { kind: "MTOctetStream" });
  assertEquals(decodeMediaType("*/*"), { kind: "MTAny" });
  assertEquals(decodeMediaType("application/vnd.pgrst.plan+text"), {
    kind: "MTVndPlan",
    mtFor: json,
    format: "PlanText",
    options: [],
  });
});

Deno.test("decodeMediaType parses plan options", () => {
  assertEquals(decodeMediaType("application/vnd.pgrst.plan+json;options=analyze|verbose|wal"), {
    kind: "MTVndPlan",
    mtFor: json,
    format: "PlanJSON",
    options: ["PlanAnalyze", "PlanVerbose", "PlanWAL"],
  });
});

Deno.test("toMime round trips", () => {
  assertEquals(toMime(json), "application/json");
  assertEquals(toMime({ kind: "MTVndArrayJSONStrip" }), "application/vnd.pgrst.array+json;nulls=stripped");
  assertEquals(toMime({ kind: "MTVndSingularJSON", stripNulls: true }), "application/vnd.pgrst.object+json;nulls=stripped");
  assertEquals(toMime({ kind: "MTVndSingularJSON", stripNulls: false }), "application/vnd.pgrst.object+json");
  assertEquals(toMime({ kind: "MTAny" }), "*/*");
  assertEquals(toMime({ kind: "MTOther", value: "application/vnd.twkb" }), "application/vnd.twkb");
  assertEquals(
    toMime({ kind: "MTVndPlan", mtFor: { kind: "MTTextCSV" }, format: "PlanJSON", options: [] }),
    'application/vnd.pgrst.plan+json; for="text/csv"',
  );
  assertEquals(
    toMime({ kind: "MTVndPlan", mtFor: json, format: "PlanText", options: ["PlanAnalyze", "PlanBuffers"] }),
    'application/vnd.pgrst.plan+text; for="application/json"; options=analyze|buffers',
  );
});

Deno.test("toContentType adds charset except for octet-stream and other", () => {
  assertEquals(toContentType(json), ["Content-Type", "application/json; charset=utf-8"]);
  assertEquals(toContentType({ kind: "MTOctetStream" }), ["Content-Type", "application/octet-stream"]);
  assertEquals(toContentType({ kind: "MTOther", value: "application/vnd.twkb" }), ["Content-Type", "application/vnd.twkb"]);
});

Deno.test("parseHttpAccept sorts by q then specificity, stable", () => {
  assertEquals(
    parseHttpAccept("text/csv;q=0.5, application/json"),
    ["application/json", "text/csv"],
  );
  // wai-extra doctest-ish case: specificity prefers more params, fewer stars
  assertEquals(
    parseHttpAccept("text/html, image/gif, image/jpeg, *; q=.2, */*; q=.2"),
    ["text/html", "image/gif", "image/jpeg", "*", "*/*"],
  );
  // equal q keeps the original order (stable sort)
  assertEquals(parseHttpAccept("text/a, text/b"), ["text/a", "text/b"]);
  // params before ;q= stay part of the media type; spaces are stripped
  assertEquals(
    parseHttpAccept('application/vnd.pgrst.plan+json; for="text/csv"; q=0.5, text/plain'),
    ["text/plain", 'application/vnd.pgrst.plan+json;for="text/csv"'],
  );
});
