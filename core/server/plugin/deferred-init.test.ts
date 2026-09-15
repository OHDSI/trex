import { assertEquals } from "jsr:@std/assert";
import { deferInit, runDeferredInits } from "./deferred-init.ts";

Deno.test("deferred inits run in registration order, one at a time", async () => {
  const seen: string[] = [];
  deferInit("a", async () => { await new Promise((r) => setTimeout(r, 5)); seen.push("a"); });
  deferInit("b", () => { seen.push("b"); return Promise.resolve(); });
  await runDeferredInits(() => {});
  assertEquals(seen, ["a", "b"]);
});

Deno.test("a failing deferred init is logged and does not stop the rest", async () => {
  const seen: string[] = [];
  const logged: string[] = [];
  deferInit("boom", () => Promise.reject(new Error("x")));
  deferInit("after", () => { seen.push("after"); return Promise.resolve(); });
  await runDeferredInits((msg) => logged.push(msg));
  assertEquals(seen, ["after"]);
  assertEquals(logged.some((m) => m.includes("boom")), true);
});

Deno.test("the queue is drained, so a second run does nothing", async () => {
  let count = 0;
  deferInit("once", () => { count++; return Promise.resolve(); });
  await runDeferredInits(() => {});
  await runDeferredInits(() => {});
  assertEquals(count, 1);
});
