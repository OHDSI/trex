import { assertEquals } from "jsr:@std/assert";
import { D2E_COMPAT, applyD2eCompat, runD2eBoot } from "./index.ts";

Deno.test("compat is disabled by default", () => {
  assertEquals(D2E_COMPAT, false);
});

Deno.test("applyD2eCompat is a no-op when disabled (no throw, no routes)", () => {
  const calls: string[] = [];
  const fakeApp = { use: () => calls.push("use"), all: () => calls.push("all"),
    get: () => calls.push("get"), post: () => calls.push("post") } as unknown as import("express").Express;
  applyD2eCompat(fakeApp);
  assertEquals(calls.length, 0);
});

Deno.test("runD2eBoot resolves without side effects when disabled", async () => {
  await runD2eBoot();
});

// ---------------------------------------------------------------------------
// WebAPI proxy body handling (routes.ts shouldReserializeParsedBody)
// ---------------------------------------------------------------------------
import { parseAttachBody, shouldReserializeParsedBody } from "./routes.ts";

Deno.test("proxy re-serializes parsed JSON bodies, including empty {} and []", () => {
  // Non-empty JSON body (the WebAPI cache POST's schemaName case).
  assertEquals(shouldReserializeParsedBody("application/json", { schemaName: "demo_cdm" }), true);
  // Empty {} / [] (the cohort-characterization result POST sends an empty
  // filter) — must be re-serialized, not dropped: the parser already drained
  // the raw stream, so the fallback read would yield a bodiless request.
  assertEquals(shouldReserializeParsedBody("application/json", {}), true);
  assertEquals(shouldReserializeParsedBody("application/json", []), true);
  // Charset suffixes and +json media types count as JSON.
  assertEquals(shouldReserializeParsedBody("application/json; charset=utf-8", {}), true);
  assertEquals(shouldReserializeParsedBody("application/fhir+json", { resourceType: "Patient" }), true);
});

Deno.test("proxy streams non-JSON bodies raw (multipart placeholder {} must not be re-serialized)", () => {
  // express.json() leaves req.body as {} for content types it never parses;
  // their raw stream is still readable. Re-serializing the placeholder
  // replaced a multipart payload with the literal "{}" — WebAPI's
  // POST /source then failed with "Required part 'source' is not present"
  // (d2e demo-dataset setup E2E failure).
  assertEquals(shouldReserializeParsedBody("multipart/form-data; boundary=x", {}), false);
  assertEquals(shouldReserializeParsedBody("application/x-www-form-urlencoded", {}), false);
  assertEquals(shouldReserializeParsedBody("application/octet-stream", {}), false);
  assertEquals(shouldReserializeParsedBody(undefined, {}), false);
});

Deno.test("proxy streams genuinely unparsed bodies raw regardless of content type", () => {
  assertEquals(shouldReserializeParsedBody("application/json", undefined), false);
  assertEquals(shouldReserializeParsedBody("application/json", null), false);
  assertEquals(shouldReserializeParsedBody("application/json", "raw string"), false);
});

// ---------------------------------------------------------------------------
// POST /trex/attach body normalization (routes.ts parseAttachBody)
// ---------------------------------------------------------------------------

Deno.test("parseAttachBody — passes through string ids (the portal's attach hook shape)", () => {
  assertEquals(
    parseAttachBody({ cacheIds: ["cdm000111222"], connectionIds: ["alpdev_pg"] }),
    { cacheIds: ["cdm000111222"], connectionIds: ["alpdev_pg"] },
  );
});

Deno.test("parseAttachBody — tolerates missing/non-object bodies and absent keys", () => {
  const empty = { cacheIds: [], connectionIds: [] };
  assertEquals(parseAttachBody(undefined), empty);
  assertEquals(parseAttachBody(null), empty);
  assertEquals(parseAttachBody("raw string"), empty);
  assertEquals(parseAttachBody({}), empty);
  assertEquals(parseAttachBody({ cacheIds: ["c1"] }), { cacheIds: ["c1"], connectionIds: [] });
});

Deno.test("parseAttachBody — drops non-string entries and non-array values", () => {
  assertEquals(
    parseAttachBody({ cacheIds: ["ok", 42, null, { evil: true }], connectionIds: "not-an-array" }),
    { cacheIds: ["ok"], connectionIds: [] },
  );
});
