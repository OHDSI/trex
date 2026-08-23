// Kept out of bootstrap.test.ts so that file stays type-checkable: importing
// ./index.ts pulls in routes.ts, which has pre-existing Buffer type errors.
import { assertEquals } from "jsr:@std/assert";
import { runD2eBootstrap } from "./index.ts";

Deno.test("runD2eBootstrap is a no-op when D2E_COMPAT is disabled", async () => {
  assertEquals(Deno.env.get("D2E_COMPAT"), undefined);
  await runD2eBootstrap();
});
