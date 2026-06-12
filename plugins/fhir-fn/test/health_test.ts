import { assertEquals } from "std/assert/mod.ts";
import { handle } from "../functions/index.ts";

Deno.test("health returns 200 ok", async () => {
  const res = await handle(new Request("http://x/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "ok");
});

Deno.test("health returns 200 ok via mounted path", async () => {
  const res = await handle(new Request("http://x/trex/fhir/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "ok");
});

Deno.test("unknown path returns 404 OperationOutcome", async () => {
  const res = await handle(new Request("http://x/nope"));
  assertEquals(res.status, 404);
  assertEquals((await res.json()).resourceType, "OperationOutcome");
});
