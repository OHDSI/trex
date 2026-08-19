import { assertEquals } from "jsr:@std/assert";
import { healthFromResponse } from "./codeHealth.ts";

Deno.test("200 is healthy", () => {
  assertEquals(healthFromResponse({ ok: true, status: 200 }), {
    ok: true,
    detail: "The workspace is reachable.",
  });
});

Deno.test("401 names the auth repair", () => {
  const got = healthFromResponse({ ok: false, status: 401, detail: "token expired" });
  assertEquals(got.ok, false);
  assertEquals(
    got.detail,
    "The workspace rejected my credentials (401). Someone needs to re-authenticate the devx workspace.",
  );
});

Deno.test("a transport failure is reported as unreachable with the cause", () => {
  const got = healthFromResponse({ ok: false, detail: "connection refused" });
  assertEquals(got.ok, false);
  assertEquals(got.detail, "The workspace is not reachable: connection refused.");
});
