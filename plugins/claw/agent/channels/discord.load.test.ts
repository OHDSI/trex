import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../../core/server/agents/loader.ts";

Deno.test("claw loads the discord channel", async () => {
  const a = await loadAgent(new URL("../", import.meta.url).pathname);
  assert(Object.hasOwn(a.channels, "discord"), "channels.discord must load");
  assertEquals(typeof a.channels.discord, "object");
});
