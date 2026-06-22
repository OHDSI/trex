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
