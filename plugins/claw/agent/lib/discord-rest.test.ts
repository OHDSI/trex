// plugins/claw/agent/lib/discord-rest.test.ts
import { assertEquals } from "jsr:@std/assert";
import { fetchRecentMessages, postChannelMessage, startThreadFromMessage } from "./discord-rest.ts";

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

// --- postChannelMessage: JSON path (no files) ---
Deno.test("postChannelMessage sends embeds+components as a JSON message", async () => {
  let seenInit: any = null;
  const fetchFn = ((_url: string, init: any) => {
    seenInit = init;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;

  const embed = { title: "Design options", description: "pick one", color: 1 };
  const components = [{ type: 1, components: [{ type: 3, custom_id: "eve_choice", options: [] }] }];
  await postChannelMessage(fetchFn, { botToken: "T", channelId: "9", content: "hi", embeds: [embed], components });

  assertEquals(seenInit.method, "POST");
  assertEquals(seenInit.headers.Authorization, "Bot T");
  assertEquals(seenInit.headers["content-type"], "application/json");
  const body = JSON.parse(seenInit.body);
  assertEquals(body.content, "hi");
  assertEquals(body.embeds, [embed]);
  assertEquals(body.components, components);
  assertEquals(body.allowed_mentions, { parse: [] });
});

// --- postChannelMessage: multipart path (files) ---
Deno.test("postChannelMessage sends files as multipart with payload_json + attachments", async () => {
  let seenBody: any = null;
  const fetchFn = ((_url: string, init: any) => {
    seenBody = init.body;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;

  const bytes = new Uint8Array([1, 2, 3]);
  await postChannelMessage(fetchFn, {
    botToken: "T",
    channelId: "9",
    content: "shot",
    files: [{ name: "home.png", bytes, contentType: "image/png" }],
  });

  assertEquals(seenBody instanceof FormData, true);
  const payload = JSON.parse(seenBody.get("payload_json") as string);
  assertEquals(payload.content, "shot");
  assertEquals(payload.attachments, [{ id: 0, filename: "home.png" }]);
  const file = seenBody.get("files[0]") as File;
  assertEquals(file.name, "home.png");
  assertEquals(file.type, "image/png");
});

Deno.test("postChannelMessage throws on non-2xx", async () => {
  const fetchFn = (() => Promise.resolve(new Response("bad", { status: 400 }))) as unknown as typeof fetch;
  let threw = false;
  try { await postChannelMessage(fetchFn, { botToken: "T", channelId: "1", content: "x" }); }
  catch { threw = true; }
  assertEquals(threw, true);
});

Deno.test("postChannelMessage returns the created message id and honors allowedMentions", async () => {
  let captured: { url: string; body: string } | null = null;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    captured = { url: String(url), body: String(init?.body) };
    return Response.json({ id: "m1" });
  }) as typeof fetch;
  const r = await postChannelMessage(fakeFetch, {
    botToken: "t", channelId: "C1", content: "hi <@D1>",
    allowedMentions: { users: ["D1"] },
  });
  assertEquals(r.id, "m1");
  assertEquals(JSON.parse(captured!.body).allowed_mentions, { users: ["D1"] });
});

Deno.test("startThreadFromMessage posts to the threads endpoint and returns the thread id", async () => {
  let url = "";
  const fakeFetch = (async (u: string | URL) => {
    url = String(u);
    return Response.json({ id: "T9" });
  }) as typeof fetch;
  const r = await startThreadFromMessage(fakeFetch, { botToken: "t", channelId: "C1", messageId: "m1", name: "Support: export bug" });
  assertEquals(r.threadId, "T9");
  assertEquals(url.endsWith("/channels/C1/messages/m1/threads"), true);
});
