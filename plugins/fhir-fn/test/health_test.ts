import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handle } from "../functions/index.ts";

Deno.test("health returns 200 ok", async () => {
  const res = await handle(new Request("http://x/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "ok");
});
