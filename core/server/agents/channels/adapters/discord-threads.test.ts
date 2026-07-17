import { assertEquals, assertRejects } from "jsr:@std/assert";
import { createDiscordThreadFromMessage } from "./discord-threads.ts";

function fakeFetch(respond: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = ((input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(respond(String(input), init));
  }) as typeof fetch;
  return { fn, calls };
}

Deno.test("createDiscordThreadFromMessage POSTs to the message-anchored threads route", async () => {
  const { fn, calls } = fakeFetch(() => Response.json({ id: "thread-9" }));
  const r = await createDiscordThreadFromMessage({
    credentials: { botToken: "tok" },
    fetch: fn,
    channelId: "chan-1",
    messageId: "msg-1",
    name: "fix login",
  });
  assertEquals(r.id, "thread-9");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://discord.com/api/v10/channels/chan-1/messages/msg-1/threads");
  const body = JSON.parse(String(calls[0].init?.body));
  assertEquals(body.name, "fix login");
});

Deno.test("createDiscordThreadFromMessage throws on non-2xx", async () => {
  const { fn } = fakeFetch(() => new Response("nope", { status: 403 }));
  await assertRejects(() =>
    createDiscordThreadFromMessage({
      credentials: { botToken: "tok" },
      fetch: fn,
      channelId: "chan-1",
      messageId: "msg-1",
      name: "x",
    })
  );
});
