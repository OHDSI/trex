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

// ---------------------------------------------------------------------------
// WebAPI OIDC token exchange (lib/token-exchange.ts)
// ---------------------------------------------------------------------------
import { getWebApiToken } from "./lib/token-exchange.ts";

function unsignedJwt(payload: Record<string, unknown>): string {
  const segment = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${segment({ alg: "HS256", typ: "JWT" })}.${segment(payload)}.not-verified-here`;
}

const LOGTO_TOKEN = unsignedJwt({ sub: "q9j5vjrmba9x" });

/** Runs `fn` with `globalThis.fetch` replaced by `handler`, recording request URLs. */
async function withStubbedFetch<T>(
  handler: (url: string, init?: RequestInit) => Response,
  fn: () => Promise<T>,
): Promise<{ result: T; urls: string[] }> {
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  try {
    return { result: await fn(), urls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.test("token exchange redeems the openidDirect one-time code for a WebAPI JWT", async () => {
  const { result, urls } = await withStubbedFetch(
    (url, init) => {
      if (url.includes("/user/login/openidDirect")) {
        assertEquals(
          (init?.headers as Record<string, string>)?.Authorization,
          `Bearer ${LOGTO_TOKEN}`,
        );
        return jsonResponse({ code: "28ff5efa-6efa-4b54-bacd-d7144c01d6b4", expiresIn: "PT10M" });
      }
      return jsonResponse({ login: "q9j5vjrmba9x", jwt: "webapi.session.jwt", roles: null });
    },
    () => getWebApiToken(LOGTO_TOKEN),
  );

  assertEquals(result, "webapi.session.jwt");
  assertEquals(urls.length, 2);
  assertEquals(
    urls[1],
    "http://localhost:8080/WebAPI/user/login/otc?code=28ff5efa-6efa-4b54-bacd-d7144c01d6b4",
  );
});

Deno.test("token exchange fails when openidDirect returns no one-time code", async () => {
  const { result } = await withStubbedFetch(
    () => jsonResponse({ expiresIn: "PT10M" }),
    () => getWebApiToken(LOGTO_TOKEN),
  );
  assertEquals(result, null);
});

Deno.test("token exchange fails when the one-time code cannot be redeemed", async () => {
  const { result, urls } = await withStubbedFetch(
    (url) =>
      url.includes("/user/login/otc")
        ? jsonResponse({ message: "Invalid or expired code" }, 401)
        : jsonResponse({ code: "28ff5efa-6efa-4b54-bacd-d7144c01d6b4", expiresIn: "PT10M" }),
    () => getWebApiToken(LOGTO_TOKEN),
  );
  assertEquals(result, null);
  assertEquals(urls.length, 2);
});

Deno.test("token exchange fails without calling WebAPI when the Logto token is unreadable", async () => {
  const { result, urls } = await withStubbedFetch(
    () => jsonResponse({}),
    () => getWebApiToken("not-a-jwt"),
  );
  assertEquals(result, null);
  assertEquals(urls.length, 0);
});
