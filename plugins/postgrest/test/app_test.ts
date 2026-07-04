// Tests for the request-handling shell (mount stripping, admin endpoints).
import { assertEquals } from "std/assert/mod.ts";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
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

Deno.test("API endpoints are stubbed with 501 until implemented", async () => {
  try {
    const res = await handle(new Request("http://localhost/postgrest/projects?select=*"));
    assertEquals(res.status, 501);
  } finally {
    await cleanup();
  }
});
