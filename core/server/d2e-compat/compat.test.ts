import { assertEquals } from "jsr:@std/assert";
import { D2E_COMPAT, applyD2eCompat, runD2eAtlasDbInit, runD2eBoot } from "./index.ts";

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

Deno.test("runD2eAtlasDbInit resolves without side effects when disabled", async () => {
  // index.ts chains this off startNativeWebApi(), which runs on every node —
  // including ones with D2E_COMPAT off, where it must touch nothing at all.
  await runD2eAtlasDbInit();
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
  // A raw, unparsed body also arrives as a string; re-serializing would
  // double-encode it, so strings keep streaming through untouched.
  assertEquals(shouldReserializeParsedBody("application/json", "raw string"), false);
});

Deno.test("proxy re-serializes primitive JSON bodies (WebAPI tag assign posts a bare int)", () => {
  // POST /{conceptset|cohortdefinition}/{id}/tag/ sends `2` as the whole body.
  // The global parser is non-strict, so it parses to a number and drains the
  // stream — without re-serializing, the POST would reach WebAPI bodiless and
  // the tag would never be assigned.
  assertEquals(shouldReserializeParsedBody("application/json", 2), true);
  assertEquals(shouldReserializeParsedBody("application/json; charset=utf-8", 0), true);
  assertEquals(shouldReserializeParsedBody("application/json", false), true);
  // Still gated on the request actually being JSON.
  assertEquals(shouldReserializeParsedBody("multipart/form-data; boundary=x", 2), false);
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

// openidDirect answers with one of two shapes depending on the pinned
// webapi-be: LoginService.Result — {login, jwt, roles, message}, mirrored in a
// `Bearer` response header — or an OneTimeCodeResponse — {code, expiresIn} —
// redeemed at /user/login/otc. Both are exercised here; a shim that reads only
// one 401s every /WebAPI call against the other.
Deno.test("token exchange reads the WebAPI session JWT from the openidDirect body", async () => {
  const { result, urls } = await withStubbedFetch(
    (url, init) => {
      assertEquals(url, "http://localhost:8080/WebAPI/user/login/openidDirect");
      assertEquals(
        (init?.headers as Record<string, string>)?.Authorization,
        `Bearer ${LOGTO_TOKEN}`,
      );
      return jsonResponse({
        login: "q9j5vjrmba9x",
        jwt: "webapi.session.jwt",
        roles: null,
        message: null,
      });
    },
    () => getWebApiToken(LOGTO_TOKEN),
  );

  assertEquals(result, "webapi.session.jwt");
  assertEquals(urls.length, 1);
});

Deno.test("token exchange falls back to the Bearer header when the body carries no jwt", async () => {
  const { result } = await withStubbedFetch(
    () =>
      new Response("", {
        status: 200,
        headers: { Bearer: "webapi.session.jwt", "Content-Type": "text/plain" },
      }),
    () => getWebApiToken(LOGTO_TOKEN),
  );
  assertEquals(result, "webapi.session.jwt");
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

Deno.test("token exchange fails when the redeemed one-time code carries no JWT", async () => {
  const { result } = await withStubbedFetch(
    (url) =>
      url.includes("/user/login/otc")
        ? jsonResponse({ login: "q9j5vjrmba9x", jwt: null, roles: null })
        : jsonResponse({ code: "28ff5efa-6efa-4b54-bacd-d7144c01d6b4", expiresIn: "PT10M" }),
    () => getWebApiToken(LOGTO_TOKEN),
  );
  assertEquals(result, null);
});

Deno.test("token exchange fails when openidDirect answers 200 with neither JWT nor code", async () => {
  const { result, urls } = await withStubbedFetch(
    () => jsonResponse({ login: "q9j5vjrmba9x", jwt: null, roles: null, message: null }),
    () => getWebApiToken(LOGTO_TOKEN),
  );
  assertEquals(result, null);
  assertEquals(urls.length, 1);
});

Deno.test("token exchange fails when openidDirect rejects the Logto token", async () => {
  const { result, urls } = await withStubbedFetch(
    () => jsonResponse({ login: null, jwt: null, roles: null, message: "Invalid token" }, 401),
    () => getWebApiToken(LOGTO_TOKEN),
  );
  assertEquals(result, null);
  assertEquals(urls.length, 1);
});

Deno.test("token exchange fails without calling WebAPI when the Logto token is unreadable", async () => {
  const { result, urls } = await withStubbedFetch(
    () => jsonResponse({}),
    () => getWebApiToken("not-a-jwt"),
  );
  assertEquals(result, null);
  assertEquals(urls.length, 0);
});

// ---------------------------------------------------------------------------
// POST /trex/attach status selection (routes.ts attachResponseStatus)
// ---------------------------------------------------------------------------
import { attachResponseStatus, type AttachResult } from "./routes.ts";

const attachedResult = (id: string): AttachResult =>
  ({ type: "cache", id, catalog: id, status: "attached" });
const failedResult = (id: string): AttachResult =>
  ({ type: "cache", id, status: "failed", error: "boom" });
const skippedResult = (id: string): AttachResult =>
  ({ type: "connection", id, status: "skipped", error: "no source attach for dialect hana" });

Deno.test("attach returns 200 when nothing failed", () => {
  assertEquals(attachResponseStatus([attachedResult("a")], false), 200);
  assertEquals(attachResponseStatus([attachedResult("a"), attachedResult("b")], false), 200);
});

Deno.test("attach treats a skip as non-failure (HANA connections have no __srcdb)", () => {
  // The HANA dataset-creation shape: cache attached, connection skipped.
  assertEquals(
    attachResponseStatus([attachedResult("hana_db_cache"), skippedResult("hana_db")], false),
    200,
  );
  assertEquals(attachResponseStatus([skippedResult("hana_db")], false), 200);
});

Deno.test("attach returns 207 only for a genuinely partial failure", () => {
  assertEquals(attachResponseStatus([attachedResult("a"), failedResult("b")], false), 207);
  assertEquals(attachResponseStatus([skippedResult("a"), failedResult("b")], false), 207);
});

Deno.test("attach returns 500 when every item failed, never a 2xx", () => {
  // 207 is inside fetch's res.ok, so an all-failed 207 would read as success to
  // the d2e portal caller, which logs only on !res.ok.
  assertEquals(attachResponseStatus([failedResult("a")], false), 500);
  assertEquals(attachResponseStatus([failedResult("a"), failedResult("b")], false), 500);
});

Deno.test("attach returns 500 on a fatal error regardless of collected results", () => {
  assertEquals(attachResponseStatus([], true), 500);
  assertEquals(attachResponseStatus([attachedResult("a")], true), 500);
  // No items and no fatal cannot happen (parseAttachBody rejects an empty
  // request), but it must not report failure.
  assertEquals(attachResponseStatus([], false), 200);
});

// ---------------------------------------------------------------------------
// /d2e/oauth/token client authentication (routes.ts applyClientAuthentication)
// ---------------------------------------------------------------------------
import { applyClientAuthentication } from "./routes.ts";
// The provider's OWN decoder, not a reimplementation. These assertions are only
// worth anything if what this proxy encodes is what the thing at the other end
// decodes, and that is exactly the pair the plugin uses
// (extractClientCredentials -> basicToClientCredentials -> decodeBasicCredentials).
import { decodeBasicCredentials } from "better-auth/oauth2";

const TREX_CFG = {
  clientId: "d2e-webapi",
  clientSecret: "5FT0DkLlEvzGXAjP08EMuRSU3U72yh",
  tokenEndpointAuthMethod: "client_secret_basic" as const,
};

Deno.test("trex: the secret moves into a Basic header and OUT of the body", () => {
  // Both halves, because either one alone is a bug the stack showed:
  // a body-only secret is refused with `client registered for
  // client_secret_basic cannot use client_secret_post`, and a body secret sent
  // ALONGSIDE the header is what Logto refuses and what would leave an unusable
  // credential in this route's own log line.
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "d2e-webapi",
    code: "abc",
    client_secret: "posted-by-the-caller",
  });
  const headers = applyClientAuthentication(params, TREX_CFG);
  assertEquals(params.has("client_secret"), false);
  assertEquals(params.get("code"), "abc");
  assertEquals(Object.keys(headers), ["Authorization"]);
  assertEquals(decodeBasicCredentials(headers.Authorization), {
    clientId: "d2e-webapi",
    clientSecret: "5FT0DkLlEvzGXAjP08EMuRSU3U72yh",
  });
});

Deno.test("trex: a secret with reserved characters survives the round trip", () => {
  // RFC 6749 §2.3.1 form-url-encodes each half before base64, and the provider
  // form-url-DECODES each half. A hand-rolled `btoa(id + ":" + secret)` agrees
  // with that for the alphanumeric secret d2e generates today and silently
  // corrupts anything else, so the case that would catch it is asserted rather
  // than the case that would not.
  const params = new URLSearchParams({ grant_type: "refresh_token" });
  const headers = applyClientAuthentication(params, {
    ...TREX_CFG,
    clientId: "d2e webapi+x",
    clientSecret: "se:cr%et+ /",
  });
  assertEquals(decodeBasicCredentials(headers.Authorization), {
    clientId: "d2e webapi+x",
    clientSecret: "se:cr%et+ /",
  });
});

Deno.test("logto: the secret stays in the body and no header is added", () => {
  // The no-D2E_IDP regression. An existing deployment must be bit-for-bit what
  // it was, and Logto refuses a request presenting client auth two ways.
  const params = new URLSearchParams({ grant_type: "authorization_code", code: "abc" });
  const headers = applyClientAuthentication(params, {
    clientId: "portal-app",
    clientSecret: "shh",
    tokenEndpointAuthMethod: "client_secret_post",
  });
  assertEquals(headers, {});
  assertEquals(params.get("client_secret"), "shh");
});

Deno.test("logto: a secret the caller already supplied is not overwritten", () => {
  const params = new URLSearchParams({ client_secret: "callers-own" });
  applyClientAuthentication(params, {
    clientId: "portal-app",
    clientSecret: "shh",
    tokenEndpointAuthMethod: "client_secret_post",
  });
  assertEquals(params.getAll("client_secret"), ["callers-own"]);
});

Deno.test("no secret configured adds neither a header nor a body parameter", () => {
  for (const method of ["client_secret_basic", "client_secret_post"] as const) {
    const params = new URLSearchParams({ grant_type: "authorization_code" });
    const headers = applyClientAuthentication(params, {
      clientId: "c",
      clientSecret: "",
      tokenEndpointAuthMethod: method,
    });
    assertEquals(headers, {}, method);
    assertEquals(params.has("client_secret"), false, method);
  }
});

// ---------------------------------------------------------------------------
// /portal/env.js end_session_endpoint (routes.ts portalEndSessionUrl)
// ---------------------------------------------------------------------------
import { portalEndSessionUrl } from "./routes.ts";

const ES_GATEWAY = "https://localhost/";
const ES_TREX = { idp: "trex", endSessionPath: "trex/oidc/oauth2/end-session" } as const;
const ES_LOGTO = { idp: "logto", endSessionPath: "oidc/session/end" } as const;

Deno.test("trex: the end-session endpoint carries no query of its own", () => {
  assertEquals(
    portalEndSessionUrl(ES_GATEWAY, ES_TREX, "d2e-webapi"),
    "https://localhost/trex/oidc/oauth2/end-session",
  );
});

// The behaviour the value exists for, asserted the way the bug presented: the
// endpoint looked plausible in the logs and parsed to the wrong thing. The
// client appends with a hard-coded `?`, so anything already there swallows the
// hint into the previous parameter's value.
Deno.test("trex: the client's appended hint parses as its own parameter", () => {
  const appended = `${portalEndSessionUrl(ES_GATEWAY, ES_TREX, "d2e-webapi")}?id_token_hint=a.b.c`;
  assertEquals(new URL(appended).searchParams.get("id_token_hint"), "a.b.c");
});

// The regression this replaces, pinned so it cannot come back unnoticed.
Deno.test("a query on the endpoint would hide the hint from the provider", () => {
  const withQuery = "https://localhost/trex/oidc/oauth2/end-session" +
    "?client_id=d2e-webapi&redirect=https://localhost/d2e/portal";
  assertEquals(new URL(`${withQuery}?id_token_hint=a.b.c`).searchParams.get("id_token_hint"), null);
});

// Logto's confirm page auto-submits, so its path works with the query it has
// always been given; changing it would risk a logout that works today.
Deno.test("logto: the endpoint keeps the query it has always been handed", () => {
  assertEquals(
    portalEndSessionUrl(ES_GATEWAY, ES_LOGTO, "d2e-app"),
    "https://localhost/oidc/session/end" +
      "?client_id=d2e-app&redirect={window.location.origin}/d2e/portal",
  );
});
