// Tests for the request-handling shell (mount stripping, admin endpoints).
import { assertEquals } from "std/assert/mod.ts";
import { handle } from "../functions/app.ts";
import { stripMount } from "../functions/state.ts";

Deno.test("stripMount handles both mounts", () => {
  assertEquals(stripMount("/postgrest"), "/");
  assertEquals(stripMount("/postgrest/projects"), "/projects");
  assertEquals(stripMount("/plugins/trex/postgrest"), "/");
  assertEquals(stripMount("/plugins/trex/postgrest/admin/live"), "/admin/live");
  assertEquals(stripMount("/postgrestx/projects"), null);
  assertEquals(stripMount("/other"), null);
});

Deno.test("admin live and ready respond 200", async () => {
  for (const path of ["/plugins/trex/postgrest/admin/live", "/plugins/trex/postgrest/admin/ready"]) {
    const res = await handle(new Request(`http://localhost${path}`));
    assertEquals(res.status, 200, path);
  }
});

Deno.test("unknown mount is a 404", async () => {
  const res = await handle(new Request("http://localhost/elsewhere"));
  assertEquals(res.status, 404);
});

Deno.test("API endpoints are stubbed with 501 until implemented", async () => {
  const res = await handle(new Request("http://localhost/postgrest/projects?select=*"));
  assertEquals(res.status, 501);
});
