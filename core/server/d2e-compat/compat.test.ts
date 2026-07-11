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
import { shouldReserializeParsedBody } from "./routes.ts";

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
