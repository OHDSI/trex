// Telegram adapter tests. NO live Telegram — the platform HTTP is mocked via
// opts.api.fetch, and the secret-token gate runs for real against a configured
// webhook secret.

import { assertEquals, assertExists } from "jsr:@std/assert";
import { telegramChannel } from "./telegram.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";
import { deriveTelegramInputResponse, encodeTelegramCallbackData, renderTelegramInputRequest } from "../vendor/telegram/hitl.ts";

const SECRET = "s3cr3t-webhook-token";

// ---- helpers ---------------------------------------------------------------

function webhookRequest(body: string, opts: { secret?: string; omitSecret?: boolean } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!opts.omitSecret) headers["x-telegram-bot-api-secret-token"] = opts.secret ?? SECRET;
  return new Request("https://worker.example/base/eve/v1/telegram", { method: "POST", headers, body });
}

interface SendCall {
  message: string;
  opts: { auth: ChannelAuth | null; continuationToken: string; state?: unknown; title?: string };
}

function mockArgs(): { args: ChannelRouteArgs; sends: SendCall[] } {
  const sends: SendCall[] = [];
  const args: ChannelRouteArgs = {
    send(message, opts) {
      sends.push({ message, opts });
      return Promise.resolve({ id: "session-1" });
    },
    getSession: () => null,
    receive: () => Promise.resolve({ id: "session-1" }),
    params: {},
    waitUntil: () => {},
    requestIp: null,
  };
  return { args, sends };
}

const MESSAGE_UPDATE = {
  update_id: 1,
  message: {
    message_id: 42,
    from: { id: 777, is_bot: false, username: "alice", first_name: "Alice" },
    chat: { id: 555, type: "private", username: "alice" },
    text: "what is the weather",
  },
};

// ---- secret-token gate -----------------------------------------------------

Deno.test("correct secret-token header passes the gate → reaches send()", async () => {
  const channel = telegramChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(webhookRequest(JSON.stringify(MESSAGE_UPDATE)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
});

Deno.test("wrong secret-token → 401 and no send()", async () => {
  const channel = telegramChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(webhookRequest(JSON.stringify(MESSAGE_UPDATE), { secret: "nope" }), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0); // gate ran BEFORE send()
});

Deno.test("missing secret-token header → 401 and no send()", async () => {
  const channel = telegramChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(webhookRequest(JSON.stringify(MESSAGE_UPDATE), { omitSecret: true }), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0);
});

Deno.test("missing configured secret (fail closed) → 401", async () => {
  const channel = telegramChannel({}); // no secret, no env
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(webhookRequest(JSON.stringify(MESSAGE_UPDATE)), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0);
});

// ---- inbound message -------------------------------------------------------

Deno.test("message Update → send() with the text + chatId continuation token + telegram auth", async () => {
  const channel = telegramChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(webhookRequest(JSON.stringify(MESSAGE_UPDATE)), args);

  assertEquals(sends.length, 1);
  const call = sends[0];
  assertEquals(call.message.includes("what is the weather"), true);
  // Continuation token = raw chatId (layer namespaces it).
  assertEquals(call.opts.continuationToken, "555");
  assertEquals(call.opts.auth?.authenticator, "telegram-webhook");
  assertEquals(call.opts.auth?.principalId, "telegram:777");
  const state = call.opts.state as { chatId?: string };
  assertEquals(state.chatId, "555");
});

Deno.test("a message from a bot is ignored (no send)", async () => {
  const channel = telegramChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends } = mockArgs();
  const botMsg = {
    update_id: 2,
    message: { message_id: 1, from: { id: 9, is_bot: true }, chat: { id: 3, type: "private" }, text: "echo" },
  };
  const res = await channel.routes[0].handler(webhookRequest(JSON.stringify(botMsg)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0);
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const channel = telegramChannel({ credentials: { webhookSecret: SECRET }, onCommand: () => ({ auth: null }) });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(webhookRequest(JSON.stringify(MESSAGE_UPDATE)), args);
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.auth, null);
});

// ---- delivery: message.completed ------------------------------------------

Deno.test("message.completed posts the reply to the chat", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 7, chat: { id: 555, type: "private" } } }), { status: 200 }));
  };
  const channel = telegramChannel({ credentials: { botToken: "bot-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { chatId: "555" } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "the weather is sunny", finishReason: "stop" }, channelCtx);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url.endsWith("/sendMessage"), true);
  assertEquals(calls[0].body.chat_id, "555");
  assertEquals(calls[0].body.text, "the weather is sunny");
});

Deno.test("message.completed splits a >4096-char reply into multiple sendMessage calls", async () => {
  const calls: Array<{ body: { text: string } }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: 555, type: "private" } } }), { status: 200 }));
  };
  const channel = telegramChannel({ credentials: { botToken: "bot-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { chatId: "555" } };
  const longMessage = "A".repeat(4000) + "\n" + "B".repeat(2000); // > 4096 → 2 chunks
  await channel.events!["message.completed"]({ turnId: "t1", message: longMessage, finishReason: "stop" }, channelCtx);

  assertEquals(calls.length, 2);
  assertEquals(calls[0].body.text.startsWith("A"), true);
  assertEquals(calls[1].body.text.startsWith("B"), true);
  // Each chunk is within Telegram's limit.
  assertEquals(calls[0].body.text.length <= 4096, true);
  assertEquals(calls[1].body.text.length <= 4096, true);
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  const channel = telegramChannel({ credentials: { botToken: "bot-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { chatId: "555" } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, channelCtx);
  assertEquals(called, 0);
});

// ---- delivery: input.requested → inline keyboard --------------------------

Deno.test("input.requested renders an approve/deny inline keyboard (real UUID requestId)", async () => {
  const calls: Array<{ body: { text: string; reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } } }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: 555, type: "private" } } }), { status: 200 }));
  };
  const channel = telegramChannel({ credentials: { botToken: "bot-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { chatId: "555" } };

  // trex approval requestIds are gen_random_uuid() UUIDs — exercise the REAL format.
  const requestId = crypto.randomUUID();
  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId, action: { kind: "tool-call", callId: "c1", toolName: "delete_file", input: {} } }] },
    channelCtx,
  );

  assertEquals(calls.length, 1); // did NOT throw + swallow → the keyboard rendered
  const keyboard = calls[0].body.reply_markup?.inline_keyboard;
  assertExists(keyboard);
  const buttons = keyboard!.flat();
  assertEquals(buttons.length, 2);
  assertEquals(buttons[0].text, "Approve");
  assertEquals(buttons[1].text, "Deny");
  // Every callback_data is within Telegram's 64-byte cap AND round-trips to the
  // exact UUID requestId + optionId.
  for (const [i, optionId] of ["approve", "deny"].entries()) {
    const data = buttons[i].callback_data;
    assertEquals(data.startsWith("eve:"), true);
    assertEquals(new TextEncoder().encode(data).length <= 64, true);
    const decoded = deriveTelegramInputResponse(data);
    assertEquals(decoded, { requestId, optionId });
  }
});

Deno.test("encodeTelegramCallbackData for a UUID + approve stays well under 64 bytes and round-trips", () => {
  const requestId = crypto.randomUUID();
  const data = encodeTelegramCallbackData(requestId, "approve");
  const bytes = new TextEncoder().encode(data).length;
  assertEquals(bytes <= 64, true);
  // Compact packing: ~36 bytes, nowhere near the cap.
  assertEquals(bytes < 40, true);
  assertEquals(deriveTelegramInputResponse(data), { requestId, optionId: "approve" });
});

// ---- HITL callback → resume -----------------------------------------------

function callbackUpdate(callbackData: string): string {
  return JSON.stringify({
    update_id: 3,
    callback_query: {
      id: "cbq-1",
      from: { id: 777, is_bot: false, username: "alice" },
      message: { message_id: 100, chat: { id: 555, type: "private" } },
      data: callbackData,
    },
  });
}

Deno.test("callback_query derives input responses + calls opts.resume", async () => {
  const resumeCalls: Array<{ continuationToken: string; inputResponses: readonly unknown[] }> = [];
  // answerCallbackQuery is best-effort; mock it away.
  const fetchMock: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const channel = telegramChannel({
    credentials: { webhookSecret: SECRET, botToken: "bot-1" },
    api: { fetch: fetchMock },
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, inputResponses: ctx.inputResponses });
    },
  });
  const { args } = mockArgs();
  const data = encodeTelegramCallbackData("req-42", "approve");
  const res = await channel.routes[0].handler(webhookRequest(callbackUpdate(data)), args);
  assertEquals(res.status, 200);

  assertEquals(resumeCalls.length, 1);
  assertEquals(resumeCalls[0].continuationToken, "555");
  const responses = resumeCalls[0].inputResponses as Array<{ requestId: string; optionId: string }>;
  assertEquals(responses.length, 1);
  assertEquals(responses[0].requestId, "req-42");
  assertEquals(responses[0].optionId, "approve");
});

Deno.test("default resume (no opts.resume) is a loud no-op: warns, does NOT POST a resume route", async () => {
  // Only answerCallbackQuery (best-effort spinner) may be called; capture URLs
  // to assert nothing looks like a session-resume POST.
  const urls: string[] = [];
  const fetchMock: typeof fetch = (input) => {
    urls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
  try {
    const channel = telegramChannel({ credentials: { webhookSecret: SECRET, botToken: "bot-1" }, api: { fetch: fetchMock } });
    const { args } = mockArgs();
    const data = encodeTelegramCallbackData("req-7", "deny");
    const res = await channel.routes[0].handler(webhookRequest(callbackUpdate(data)), args);
    assertEquals(res.status, 200);
  } finally {
    console.warn = origWarn;
  }
  assertEquals(warnings.some((w) => w.includes("no opts.resume provided")), true);
  // The only outbound HTTP is answerCallbackQuery — never a session resume.
  assertEquals(urls.every((u) => u.endsWith("/answerCallbackQuery")), true);
});

// Sanity: the vendored renderer produces callback_data the decoder round-trips.
Deno.test("renderTelegramInputRequest callback_data round-trips through decode (UUID id)", () => {
  const requestId = crypto.randomUUID();
  const rendered = renderTelegramInputRequest({
    requestId,
    prompt: "Approve `x`?",
    display: "confirmation",
    options: [{ id: "approve", label: "Approve", style: "primary" }, { id: "deny", label: "Deny", style: "danger" }],
  }) as unknown as { replyMarkup: { inline_keyboard: Array<Array<{ callback_data: string }>> } };
  const approve = rendered.replyMarkup.inline_keyboard.flat()[0].callback_data;
  assertEquals(approve, encodeTelegramCallbackData(requestId, "approve"));
  assertEquals(deriveTelegramInputResponse(approve), { requestId, optionId: "approve" });
});
