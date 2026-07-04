// Tests for the request-handling shell (mount stripping, admin endpoints).
import { assertEquals } from "std/assert/mod.ts";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { corsPreflightResponse, headerBytes } from "../functions/response.ts";
import { stripMount } from "../functions/state.ts";

const hasDb = !!Deno.env.get("PGRST_DB_URI");
// Keep the LISTEN connection out of unit tests — it outlives single tests and
// would trip the resource sanitizer.
Deno.env.set("PGRST_DB_CHANNEL_ENABLED", "false");

/** handle() lazily opens config/pool singletons; drop them per test. */
async function cleanup(): Promise<void> {
  await shutdownForTests();
  await closePoolForTests();
  resetConfigForTests();
}

Deno.test("stripMount handles both mounts", () => {
  assertEquals(stripMount("/postgrest"), "/");
  assertEquals(stripMount("/postgrest/projects"), "/projects");
  assertEquals(stripMount("/plugins/trex/postgrest"), "/");
  assertEquals(stripMount("/plugins/trex/postgrest/admin/live"), "/admin/live");
  assertEquals(stripMount("/postgrestx/projects"), null);
  assertEquals(stripMount("/other"), null);
});

Deno.test("headerBytes re-encodes non-ASCII header values as UTF-8 bytes", () => {
  // Upstream builds header values with toUtf8 and warp writes the raw bytes
  // (e.g. Content-Location: /موارد in UnicodeSpec). The Fetch API only takes
  // ByteStrings, so every UTF-8 byte must become one <=0xFF char.
  assertEquals(headerBytes("/projects?select=*"), "/projects?select=*"); // ASCII untouched
  const bytes = headerBytes("/\u0645\u0648\u0627\u0631\u062f"); // "/موارد"
  assertEquals(
    [...bytes].map((c) => c.charCodeAt(0)),
    [0x2f, ...new TextEncoder().encode("\u0645\u0648\u0627\u0631\u062f")],
  );
  // and Headers accepts the result (it rejected the raw unicode string)
  const h = new Headers();
  h.append("Content-Location", bytes);
  assertEquals(h.get("Content-Location"), bytes);
});

Deno.test("admin live responds 200", async () => {
  try {
    const res = await handle(new Request("http://localhost/plugins/trex/postgrest/admin/live"));
    assertEquals(res.status, 200);
  } finally {
    await cleanup();
  }
});

Deno.test("admin ready reflects schema cache availability", async () => {
  try {
    const res = await handle(new Request("http://localhost/plugins/trex/postgrest/admin/ready"));
    // Admin.hs isReady: 200 once the schema cache loads, 503 before/without a db.
    assertEquals(res.status, hasDb ? 200 : 503);
  } finally {
    await cleanup();
  }
});

Deno.test("admin config dumps the effective config with the secret redacted", async () => {
  Deno.env.set("PGRST_JWT_SECRET", "reallyreallyreallyreallyverysafe");
  Deno.env.set("PGRST_DB_MAX_ROWS", "123");
  try {
    const res = await handle(new Request("http://localhost/plugins/trex/postgrest/admin/config"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.jwtSecret, "<redacted>");
    assertEquals(body.dbMaxRows, 123);
    assertEquals(body.dbChannelEnabled, false);
  } finally {
    Deno.env.delete("PGRST_JWT_SECRET");
    Deno.env.delete("PGRST_DB_MAX_ROWS");
    await cleanup();
  }
});

Deno.test("unknown mount is a 404", async () => {
  try {
    const res = await handle(new Request("http://localhost/elsewhere"));
    assertEquals(res.status, 404);
  } finally {
    await cleanup();
  }
});

Deno.test("CORS preflight is answered by the middleware, without an Allow header", async () => {
  // Cors.hs/wai-cors: OPTIONS + Origin + Access-Control-Request-Method is a
  // preflight — answered before auth and planning, so the OPTIONS info
  // responses (and their Allow header) never run. Works without a database.
  try {
    const res = await handle(
      new Request("http://localhost/postgrest/", {
        method: "OPTIONS",
        headers: {
          Origin: "http://example.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Foo,Bar",
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Allow"), null);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(res.headers.get("Access-Control-Allow-Methods"), "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
    assertEquals(
      res.headers.get("Access-Control-Allow-Headers"),
      "Authorization, Foo, Bar, Accept, Accept-Language, Content-Language",
    );
    assertEquals(res.headers.get("Access-Control-Max-Age"), "86400");
    assertEquals(await res.text(), "");
  } finally {
    await cleanup();
  }
});

Deno.test("OPTIONS without Access-Control-Request-Method is NOT a preflight", () => {
  // wai-cors only intercepts real preflights; a plain OPTIONS (even with an
  // Origin) falls through to the info responses.
  const noPreflight = corsPreflightResponse(null, {
    method: "OPTIONS",
    headers: new Headers({ Origin: "http://example.com" }),
  });
  assertEquals(noPreflight, null);
  // a configured origin allowlist rejects unknown origins (corsIgnoreFailures
  // passes the request through instead of failing it)
  const rejected = corsPreflightResponse(["http://ok.com"], {
    method: "OPTIONS",
    headers: new Headers({ Origin: "http://evil.com", "Access-Control-Request-Method": "GET" }),
  });
  assertEquals(rejected, null);
  const allowed = corsPreflightResponse(["http://ok.com"], {
    method: "OPTIONS",
    headers: new Headers({ Origin: "http://ok.com", "Access-Control-Request-Method": "GET" }),
  });
  assertEquals(allowed?.headers.get("Access-Control-Allow-Origin"), "http://ok.com");
});

Deno.test("API requests without a token and without an anon role are 401 PGRST302", async () => {
  // Auth runs before everything else (App.hs middleware order), so this
  // holds with and without a database.
  const savedAnon = Deno.env.get("PGRST_DB_ANON_ROLE");
  Deno.env.delete("PGRST_DB_ANON_ROLE");
  try {
    const res = await handle(new Request("http://localhost/postgrest/projects?select=*"));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.code, "PGRST302");
  } finally {
    if (savedAnon !== undefined) Deno.env.set("PGRST_DB_ANON_ROLE", savedAnon);
    await cleanup();
  }
});
