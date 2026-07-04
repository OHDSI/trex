// Tests for functions/parse/payload.ts — the ApiRequest.hs getPayload port:
// json/csv/urlencoded body parsing, key extraction and the verbatim PGRST102
// error message strings.

import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { PgrstError } from "../functions/errors.ts";
import type { Action, Payload } from "../functions/parse/api-request.ts";
import type { MediaType } from "../functions/parse/media-type.ts";
import { csvToJson, decodeByName, getPayload, parseCsv, parseSimpleQuery, payloadAttributes } from "../functions/parse/payload.ts";

const qi = { schema: "test", name: "projects" };
const actCreate: Action = { kind: "ActDb", db: { kind: "ActRelationMut", qi, mutation: "MutationCreate" } };
const actUpdate: Action = { kind: "ActDb", db: { kind: "ActRelationMut", qi, mutation: "MutationUpdate" } };
const actUpsert: Action = { kind: "ActDb", db: { kind: "ActRelationMut", qi, mutation: "MutationSingleUpsert" } };
const actDelete: Action = { kind: "ActDb", db: { kind: "ActRelationMut", qi, mutation: "MutationDelete" } };
const actInv: Action = { kind: "ActDb", db: { kind: "ActRoutine", qi, invMethod: { kind: "Inv" } } };

const json: MediaType = { kind: "MTApplicationJSON" };
const csv: MediaType = { kind: "MTTextCSV" };
const urlencoded: MediaType = { kind: "MTUrlEncoded" };

function payloadErr(fn: () => unknown): Partial<{ code: string; message: string; details: unknown; hint: unknown }> {
  const err = assertThrows(fn) as PgrstError;
  if (!(err instanceof PgrstError)) throw new Error(`expected PgrstError, got ${err}`);
  assertEquals(err.status, 400);
  return err.body;
}

// --- json ---------------------------------------------------------------------

Deno.test("payload: json object — keys become iColumns", () => {
  const [p, cols] = getPayload('{"b":1,"a":2}', json, null, actCreate);
  assertEquals(p, { kind: "ProcessedJSON", payRaw: '{"b":1,"a":2}', payKeys: new Set(["b", "a"]) });
  assertEquals([...cols].sort(), ["a", "b"]);
});

Deno.test("payload: json array with uniform keys", () => {
  const raw = '[{"a":1,"b":2},{"b":3,"a":4}]';
  const [p, cols] = getPayload(raw, json, null, actCreate);
  assertEquals(p, { kind: "ProcessedJSON", payRaw: raw, payKeys: new Set(["a", "b"]) });
  assertEquals(cols, new Set(["a", "b"]));
});

Deno.test("payload: json array with mismatched keys → 'All object keys must match'", () => {
  assertEquals(
    payloadErr(() => getPayload('[{"a":1},{"a":1,"b":2}]', json, null, actCreate)),
    { code: "PGRST102", message: "All object keys must match", details: null, hint: null },
  );
  // first element not an object counts as a mismatch too
  assertEquals(payloadErr(() => getPayload("[1,2]", json, null, actCreate)).message, "All object keys must match");
});

Deno.test("payload: empty / invalid json → 'Empty or invalid json'", () => {
  assertEquals(
    payloadErr(() => getPayload("", json, null, actCreate)),
    { code: "PGRST102", message: "Empty or invalid json", details: null, hint: null },
  );
  assertEquals(payloadErr(() => getPayload("{oops", json, null, actUpdate)).message, "Empty or invalid json");
  assertEquals(payloadErr(() => getPayload("", json, null, actUpsert)).message, "Empty or invalid json");
});

Deno.test("payload: empty json array / scalar truncate to []", () => {
  assertEquals(getPayload("[]", json, null, actCreate)[0], { kind: "ProcessedJSON", payRaw: "[]", payKeys: new Set<string>() });
  assertEquals(getPayload('"scalar"', json, null, actCreate)[0], { kind: "ProcessedJSON", payRaw: "[]", payKeys: new Set<string>() });
  assertEquals(getPayload("42", json, null, actCreate)[0], { kind: "ProcessedJSON", payRaw: "[]", payKeys: new Set<string>() });
});

Deno.test("payload: ?columns= bypasses parsing (RawJSON) and provides the columns", () => {
  const [p, cols] = getPayload("not even json", json, new Set(["a", "b"]), actCreate);
  assertEquals(p, { kind: "RawJSON", payRaw: "not even json" });
  assertEquals(cols, new Set(["a", "b"]));
});

Deno.test("payload: PUT ignores ?columns= (only POST/PATCH/RPC use them)", () => {
  const [p, cols] = getPayload('{"a":1}', json, new Set(["ignored"]), actUpsert);
  assertEquals(p?.kind, "ProcessedJSON");
  assertEquals(cols, new Set(["a"]));
});

Deno.test("payload: DELETE has no payload", () => {
  assertEquals(getPayload('{"a":1}', json, null, actDelete), [null, new Set<string>()]);
});

Deno.test("payload: empty body on RPC POST is an empty object", () => {
  const [p, cols] = getPayload("", json, null, actInv);
  assertEquals(p, { kind: "ProcessedJSON", payRaw: "", payKeys: new Set<string>() });
  assertEquals(cols, new Set());
});

// --- csv ---------------------------------------------------------------------

Deno.test("payload: csv converts to a json array; NULL becomes null", () => {
  const [p, cols] = getPayload("name,qty\napple,1\nnull-me,NULL", csv, null, actCreate);
  assertEquals(p?.kind, "ProcessedJSON");
  const pj = p as Extract<Payload, { kind: "ProcessedJSON" }>;
  assertEquals(JSON.parse(pj.payRaw), [{ name: "apple", qty: "1" }, { name: "null-me", qty: null }]);
  assertEquals(pj.payKeys, new Set(["name", "qty"]));
  assertEquals(cols, new Set(["name", "qty"]));
});

Deno.test("payload: csv short row → 'All lines must have same number of fields'", () => {
  assertEquals(
    payloadErr(() => getPayload("a,b\nfoo,bar\nbaz", csv, null, actCreate)),
    { code: "PGRST102", message: "All lines must have same number of fields", details: null, hint: null },
  );
});

Deno.test("payload: empty csv is a parse error", () => {
  assertEquals(payloadErr(() => getPayload("", csv, null, actCreate)).message, "parse error (not enough input)");
});

Deno.test("payload: csv quoting (embedded commas, quotes and newlines)", () => {
  assertEquals(parseCsv('a,b\n"x,y","he said ""hi"""\n"line\nbreak",z'), [
    ["a", "b"],
    ["x,y", 'he said "hi"'],
    ["line\nbreak", "z"],
  ]);
  // trailing newline does not produce an extra record; blank lines are dropped
  assertEquals(decodeByName("a,b\r\n1,2\r\n"), [{ a: "1", b: "2" }]);
  assertEquals(decodeByName("a\n\nx\n"), [{ a: "x" }]);
});

Deno.test("payload: csvToJson NULL handling", () => {
  assertEquals(csvToJson([{ a: "NULL", b: "NULLish" }]), [{ a: null, b: "NULLish" }]);
});

// --- urlencoded ---------------------------------------------------------------

Deno.test("payload: urlencoded to a relation becomes a single-row json object", () => {
  const [p, cols] = getPayload("name=John+Doe&age=50&pct=100%25", urlencoded, null, actCreate);
  assertEquals(p?.kind, "ProcessedJSON");
  const pj = p as Extract<Payload, { kind: "ProcessedJSON" }>;
  assertEquals(JSON.parse(pj.payRaw), { name: "John Doe", age: "50", pct: "100%" });
  assertEquals(cols, new Set(["name", "age", "pct"]));
});

Deno.test("payload: urlencoded to an RPC stays a parameter list", () => {
  const [p, cols] = getPayload("a=1&b=2", urlencoded, null, actInv);
  assertEquals(p, { kind: "ProcessedUrlEncoded", payArray: [["a", "1"], ["b", "2"]], payKeys: new Set(["a", "b"]) });
  assertEquals(cols, new Set(["a", "b"]));
});

Deno.test("payload: parseSimpleQuery splits on & and ;", () => {
  assertEquals(parseSimpleQuery("a=1;b=2&c"), [["a", "1"], ["b", "2"], ["c", ""]]);
});

// --- other content types -------------------------------------------------------

Deno.test("payload: raw content types are only for RPC", () => {
  const plain: MediaType = { kind: "MTTextPlain" };
  assertEquals(getPayload("raw!", plain, null, actInv)[0], { kind: "RawPay", payRaw: "raw!" });
  assertEquals(
    payloadErr(() => getPayload("raw!", plain, null, actCreate)),
    { code: "PGRST102", message: "Content-Type not acceptable: text/plain", details: null, hint: null },
  );
  assertEquals(
    payloadErr(() => getPayload("x", { kind: "MTOther", value: "application/x-foo" } as MediaType, null, actCreate)).message,
    "Content-Type not acceptable: application/x-foo",
  );
});

// --- payloadAttributes unit ----------------------------------------------------

Deno.test("payloadAttributes mirrors upstream's uniform-key checks", () => {
  assertEquals(payloadAttributes('{"a":1}', { a: 1 }), { kind: "ProcessedJSON", payRaw: '{"a":1}', payKeys: new Set(["a"]) });
  assertEquals(payloadAttributes("x", [{ a: 1 }, { b: 2 }]), null);
  assertEquals(payloadAttributes("x", [null]), null);
  assertEquals(payloadAttributes("x", "str"), { kind: "ProcessedJSON", payRaw: "[]", payKeys: new Set<string>() });
});
