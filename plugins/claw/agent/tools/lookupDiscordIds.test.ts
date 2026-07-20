import { assertEquals } from "jsr:@std/assert";
import { lookupCore } from "./lookupDiscordIds.ts";

Deno.test("lookupCore queries devx and passes through mappings/unmapped", async () => {
  const r = await lookupCore(["alice", "bob"], "u1", (async (url: string | URL, init?: RequestInit) => {
    assertEquals(String(url).includes("/support/discord-ids?logins=alice%2Cbob"), true);
    assertEquals(new Headers(init?.headers).get("authorization")?.startsWith("Bearer "), true);
    return Response.json({ mappings: { alice: "D1" }, unmapped: ["bob"] });
  }) as typeof fetch, async () => "tok");
  assertEquals(r.mappings, { alice: "D1" });
  assertEquals(r.unmapped, ["bob"]);
});
