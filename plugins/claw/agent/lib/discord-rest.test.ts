// plugins/claw/agent/lib/discord-rest.test.ts
import { assertEquals } from "jsr:@std/assert";
import { fetchRecentMessages } from "./discord-rest.ts";

Deno.test("fetchRecentMessages calls the Discord API with auth and maps results", async () => {
  let seenUrl = ""; let seenAuth = "";
  const fetchFn = ((url: string, init: any) => {
    seenUrl = url; seenAuth = init.headers.Authorization;
    return Promise.resolve(new Response(JSON.stringify([
      { author: { username: "alice" }, content: "we should add rate limiting" },
      { author: { username: "bob" }, content: "agreed, 100/min" },
    ]), { status: 200 }));
  }) as unknown as typeof fetch;

  const msgs = await fetchRecentMessages(fetchFn, { botToken: "T", channelId: "123", limit: 50 });
  assertEquals(msgs, [
    { author: "alice", content: "we should add rate limiting" },
    { author: "bob", content: "agreed, 100/min" },
  ]);
  assertEquals(seenUrl, "https://discord.com/api/v10/channels/123/messages?limit=50");
  assertEquals(seenAuth, "Bot T");
});

Deno.test("fetchRecentMessages throws on non-200", async () => {
  const fetchFn = (() => Promise.resolve(new Response("nope", { status: 403 }))) as unknown as typeof fetch;
  let threw = false;
  try { await fetchRecentMessages(fetchFn, { botToken: "T", channelId: "1", limit: 10 }); }
  catch { threw = true; }
  assertEquals(threw, true);
});
