import { assertEquals } from "jsr:@std/assert";
import { checkAllowlist } from "./allowlist.ts";

Deno.test("env fallback allows without hitting the API", async () => {
  const ok = await checkAllowlist("U1", {
    envList: "U1,U2",
    fetchImpl: () => Promise.reject(new Error("must not be called")),
    mint: () => Promise.resolve("t"),
    supportUser: () => "u-support",
  });
  assertEquals(ok, true);
});

Deno.test("DB check drives the decision and failure denies", async () => {
  const yes = await checkAllowlist("U3", {
    envList: "",
    fetchImpl: async () => Response.json({ allowed: true }),
    mint: async () => "t",
    supportUser: () => "u-support",
  });
  const err = await checkAllowlist("U4", {
    envList: "",
    fetchImpl: async () => new Response("boom", { status: 500 }),
    mint: async () => "t",
    supportUser: () => "u-support",
  });
  assertEquals(yes, true);
  assertEquals(err, false);
});

Deno.test("successful result is cached for 60s: a later rejecting fetch is never reached", async () => {
  const yes = await checkAllowlist("U5", {
    envList: "",
    fetchImpl: async () => Response.json({ allowed: true }),
    mint: async () => "t",
    supportUser: () => "u-support",
  });
  const stillYes = await checkAllowlist("U5", {
    envList: "",
    fetchImpl: () => Promise.reject(new Error("must not be called — cached")),
    mint: async () => "t",
    supportUser: () => "u-support",
  });
  assertEquals(yes, true);
  assertEquals(stillYes, true);
});

Deno.test("missing user id denies", async () => {
  assertEquals(
    await checkAllowlist(undefined, {
      envList: "U1",
      fetchImpl: fetch,
      mint: async () => "t",
      supportUser: () => undefined,
    }),
    false,
  );
});
