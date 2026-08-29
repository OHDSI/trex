// Discord adapter tests. NO live Discord — the platform HTTP is mocked via
// opts.api.fetch, and Ed25519 signatures are produced with a locally-generated
// keypair so the vendored WebCrypto verify path runs for real.

import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { discordChannel } from "./discord.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";
import { renderInputRequestComponents } from "../vendor/discord/hitl.ts";

// ---- helpers ---------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function genKeypair() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { keypair: kp, publicKeyHex: bytesToHex(rawPub) };
}

async function signedRequest(
  privateKey: CryptoKey,
  body: string,
  opts: { timestamp?: string; badSig?: boolean } = {},
): Promise<Request> {
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const data = new TextEncoder().encode(`${timestamp}${body}`);
  const sigBytes = new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, data));
  let sigHex = bytesToHex(sigBytes);
  if (opts.badSig) sigHex = sigHex.replace(/^./, (c) => (c === "a" ? "b" : "a"));
  return new Request("https://worker.example/base/eve/v1/discord", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": sigHex,
      "x-signature-timestamp": timestamp,
    },
    body,
  });
}

interface SendCall {
  message: string;
  opts: { auth: ChannelAuth | null; continuationToken: string; state?: unknown; title?: string };
}

interface ResumeCall {
  continuationToken: string;
  input: { requestId?: string; decision?: string; inputResponses?: Array<{ requestId?: string; optionId?: string }>; text?: string };
}

function mockArgs(
  // Realistic default: no pending approval most of the time (gate-text resume
  // is tried on every thread reply — see discord.ts's tryResolveGate — so a
  // test that doesn't care about it must see the same "nothing pending" miss
  // production gets, and fall through to send() as before). Tests that
  // specifically exercise a HITL resume succeeding pass an explicit { ok: true
  // } override.
  resumeResult: { ok: boolean; error?: string } = { ok: false, error: "no single pending approval" },
): { args: ChannelRouteArgs; sends: SendCall[]; resumes: ResumeCall[] } {
  const sends: SendCall[] = [];
  const resumes: ResumeCall[] = [];
  const args: ChannelRouteArgs = {
    send(message, opts) {
      sends.push({ message, opts });
      return Promise.resolve({ id: "session-1" });
    },
    getSession: () => null,
    receive: () => Promise.resolve({ id: "session-1" }),
    resume(continuationToken, input) {
      resumes.push({ continuationToken, input });
      return Promise.resolve(resumeResult);
    },
    params: {},
    waitUntil: () => {},
    hasSession: () => Promise.resolve(false),
    requestIp: null,
  };
  return { args, sends, resumes };
}

const COMMAND_PAYLOAD = {
  type: 2, // APPLICATION_COMMAND
  id: "interaction-1",
  application_id: "app-1",
  channel_id: "chan-1",
  guild_id: "guild-1",
  token: "interaction-token-1",
  user: { id: "user-1", username: "alice" },
  data: {
    id: "cmd-1",
    name: "ask",
    options: [{ name: "message", value: "what is the weather" }],
  },
};

// ---- signature gate --------------------------------------------------------

Deno.test("valid Ed25519 signature passes the gate", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  const { args, sends } = mockArgs();
  const body = JSON.stringify(COMMAND_PAYLOAD);
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1); // reached send()
});

Deno.test("bad signature → 401 and no send()", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  const { args, sends } = mockArgs();
  const body = JSON.stringify(COMMAND_PAYLOAD);
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, body, { badSig: true }), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0); // signature gate ran BEFORE send()
});

// ---- PING ------------------------------------------------------------------

Deno.test("PING interaction → PONG ACK", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  const { args } = mockArgs();
  const body = JSON.stringify({ type: 1 });
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.type, 1); // PONG
});

// ---- command ---------------------------------------------------------------

Deno.test("command interaction → send() with the message + discord continuation token", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  const { args, sends } = mockArgs();
  const body = JSON.stringify(COMMAND_PAYLOAD);
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);

  // Deferred ACK.
  const ack = await res.json();
  assertEquals(ack.type, 5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE

  assertEquals(sends.length, 1);
  const call = sends[0];
  // Message option was extracted by the vendored parser.
  assertEquals(call.message.includes("what is the weather"), true);
  // Continuation token = <channelId>:<interactionId> (raw; layer namespaces it).
  assertEquals(call.opts.continuationToken, "chan-1:interaction-1");
  // Default auth attributes the session to the discord principal.
  assertEquals(call.opts.auth?.authenticator, "discord-interaction");
  assertEquals(call.opts.auth?.principalId, "discord:guild-1:user-1");
  // State carries the interaction token for later delivery.
  assertEquals((call.opts.state as { interactionToken?: string }).interactionToken, "interaction-token-1");
});

// ---- threads (thread-per-task) ----------------------------------------------

function threadFetchMock(opts: { failCreate?: boolean } = {}) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get("authorization"),
    });
    if (url.endsWith("/threads")) {
      if (opts.failCreate) return Promise.resolve(new Response("{}", { status: 403 }));
      return Promise.resolve(new Response(JSON.stringify({ id: "thread-9" }), { status: 201 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  return { calls, fetchMock };
}

Deno.test("threads: command in a regular channel creates a thread and keys the session to it", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const { calls, fetchMock } = threadFetchMock();
  const waits: Promise<unknown>[] = [];
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, botToken: "bot-1", applicationId: "app-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
    threads: true,
  });
  const { args, sends } = mockArgs();
  args.waitUntil = (p) => { waits.push(p); };
  // Regular guild text channel (type 0).
  const payload = { ...COMMAND_PAYLOAD, channel: { id: "chan-1", type: 0 } };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals((await res.json()).type, 5); // deferred ACK

  // Thread created with bot auth, named after the ask.
  const create = calls.find((c) => c.url.endsWith("/channels/chan-1/threads"))!;
  assertExists(create);
  assertEquals(create.auth, "Bot bot-1");
  assertEquals((create.body as { name: string; type: number }).name, "what is the weather");
  assertEquals((create.body as { type: number }).type, 11);

  // Session keyed to the THREAD id; delivery state points at the thread and
  // carries NO interaction token (replies must not land in the parent channel).
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.continuationToken, "thread-9:thread-9");
  const state = sends[0].opts.state as { channelId?: string; interactionToken?: string; initialResponseSent?: boolean };
  assertEquals(state.channelId, "thread-9");
  assertEquals(state.interactionToken, undefined);
  assertEquals(state.initialResponseSent, true);
  assertEquals(sends[0].opts.title, "what is the weather");

  // The deferred original response becomes a pointer to the thread.
  await Promise.all(waits);
  const pointer = calls.find((c) => c.url.endsWith("/webhooks/app-1/interaction-token-1/messages/@original"))!;
  assertExists(pointer);
  assertEquals((pointer.body as { content: string }).content.includes("<#thread-9>"), true);
});

Deno.test("threads: command already inside a thread does NOT create another one", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const { calls, fetchMock } = threadFetchMock();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
    threads: true,
  });
  const { args, sends } = mockArgs();
  // Interaction from within a public thread (type 11).
  const payload = { ...COMMAND_PAYLOAD, channel_id: "thread-7", channel: { id: "thread-7", type: 11, parent_id: "chan-1" } };
  await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals(calls.filter((c) => c.url.endsWith("/threads")).length, 0);
  // Normal path: session continues on the thread's own channel id.
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.continuationToken.startsWith("thread-7:"), true);
});

Deno.test("DMs: a command without a guild is refused — no session, no turn", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const { fetchMock } = threadFetchMock();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, botToken: "bot-1", applicationId: "app-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
    threads: true,
  });
  const { args, sends } = mockArgs();
  // A DM interaction has no guild_id.
  const dm = { ...COMMAND_PAYLOAD, guild_id: undefined, channel: { id: "dm-1", type: 1 }, channel_id: "dm-1" };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(dm)), args);
  const body = await res.json();
  assertEquals(body.type, 4); // immediate message response, not a deferred turn
  assert(String(body.data?.content ?? "").includes("only work in server channels"));
  assertEquals(sends.length, 0, "a DM must never create a session");
});

Deno.test("DMs: a plain DM message is dropped silently — no session, no reply", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch();
  const channel = messagesChannel(publicKeyHex, rest.fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        id: "msg-31",
        channel_id: "dm-1",
        content: "hey trex, do a thing",
        author: { id: "user-1", username: "alice", bot: false },
        mentions: [{ id: "app-1" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0, "a DM must never create a session");
  // No reply is posted back to the DM channel either.
  const posted = rest.calls.find((c) => c.url.includes("/channels/dm-1/messages") && (c.init?.method ?? "GET") === "POST");
  assertEquals(posted, undefined);
});

Deno.test("threads: creation failure starts NO session and reports the error (no channel-keyed fallback)", async () => {
  // Regression: the old fallback keyed the session to the channel, merging every
  // failed-thread task in a channel into ONE session (shared history/chat/worktree).
  const { keypair, publicKeyHex } = await genKeypair();
  const { calls, fetchMock } = threadFetchMock({ failCreate: true });
  const waits: Promise<unknown>[] = [];
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, botToken: "bot-1", applicationId: "app-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
    threads: true,
  });
  const { args, sends } = mockArgs();
  args.waitUntil = (p) => { waits.push(p); };
  const payload = { ...COMMAND_PAYLOAD, channel: { id: "chan-1", type: 0 } };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals((await res.json()).type, 5); // deferred ACK still returned
  assertEquals(sends.length, 0, "no session may be created without a thread");
  await Promise.all(waits);
  // The deferred original is edited into the error message.
  const edit = calls.find((c) => c.url.includes("/messages/@original"));
  assert(edit, "expected the original response to be edited with the error");
  assert(String((edit!.body as { content?: string })?.content).includes("couldn't create a task thread"));
});

Deno.test("threads: allow-listed parent channel admits interactions from its threads", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const { fetchMock } = threadFetchMock();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
    threads: true,
    allow: { conversations: ["chan-1"] },
  });
  const { args, sends } = mockArgs();
  const payload = { ...COMMAND_PAYLOAD, channel_id: "thread-7", channel: { id: "thread-7", type: 11, parent_id: "chan-1" } };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1, "thread of an allow-listed channel must pass");

  // A thread of a DIFFERENT channel is still rejected.
  const { args: args2, sends: sends2 } = mockArgs();
  const other = { ...COMMAND_PAYLOAD, channel_id: "thread-8", channel: { id: "thread-8", type: 11, parent_id: "chan-2" } };
  const res2 = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(other)), args2);
  const body2 = await res2.json();
  assertEquals(sends2.length, 0);
  assertEquals((body2.data.content as string).includes("not authorized"), true);
});

// ---- delivery: message.completed ------------------------------------------

Deno.test("message.completed delivers split content via edit + followup", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const channel = discordChannel({
    credentials: { applicationId: "app-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
  });

  const longMessage = "A".repeat(1800) + "\n" + "B".repeat(800); // > 2000 → 2 chunks
  const channelCtx = { state: { interactionToken: "tok-1", applicationId: "app-1", channelId: "chan-1", initialResponseSent: false } };
  await channel.events!["message.completed"]({ turnId: "t1", message: longMessage, finishReason: "stop" }, channelCtx);

  assertEquals(calls.length, 2);
  // First chunk edits the deferred original response.
  assertEquals(calls[0].method, "PATCH");
  assertEquals(calls[0].url.endsWith("/webhooks/app-1/tok-1/messages/@original"), true);
  // Second chunk is a followup.
  assertEquals(calls[1].method, "POST");
  assertEquals(calls[1].url.endsWith("/webhooks/app-1/tok-1"), true);
  // Content was split, not concatenated.
  assertEquals((calls[0].body as { content: string }).content.startsWith("A"), true);
  assertEquals((calls[1].body as { content: string }).content.startsWith("B"), true);
});

Deno.test("message.completed: <@id> mentions in the reply are allowed to ping (roles/@everyone stay suppressed)", async () => {
  // Regression: the vendored sender defaulted allowed_mentions to {parse: []},
  // so an agent reply containing a correct <@id> mention pinged nobody.
  const calls: Array<{ body: any }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const channel = discordChannel({
    credentials: { applicationId: "app-1", botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
  });
  const channelCtx = { state: { channelId: "chan-1", applicationId: "app-1", initialResponseSent: true } };

  await channel.events!["message.completed"](
    { turnId: "t1", message: "Please review, <@4242>!", finishReason: "stop" },
    channelCtx,
  );
  assertEquals(calls[0].body.allowed_mentions, { parse: [], users: ["4242"] });

  // No mention in the reply → the suppress-everything default stays.
  await channel.events!["message.completed"](
    { turnId: "t2", message: "done, no ping needed", finishReason: "stop" },
    channelCtx,
  );
  assertEquals(calls[1].body.allowed_mentions, { parse: [] });
});

Deno.test("message.completed channel-message fallback sends bot auth from env credentials", async () => {
  // Regression: with env-provided credentials (the documented default) the
  // adapter passed botToken: undefined and callDiscordApi skipped the
  // Authorization header entirely — Discord 401'd every typing/channel-message
  // call. The credentials() builder must resolve the env fallback itself.
  const headers: Array<string | null> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    headers.push(new Headers(init?.headers).get("authorization"));
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const prev = Deno.env.get("DISCORD_BOT_TOKEN");
  Deno.env.set("DISCORD_BOT_TOKEN", "env-bot-token");
  try {
    const channel = discordChannel({
      api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
    });
    // No interactionToken in state → delivery goes through the bot-token
    // channel-message path.
    const channelCtx = { state: { channelId: "chan-9" } };
    await channel.events!["message.completed"]({ turnId: "t1", message: "hi", finishReason: "stop" }, channelCtx);
  } finally {
    if (prev === undefined) Deno.env.delete("DISCORD_BOT_TOKEN");
    else Deno.env.set("DISCORD_BOT_TOKEN", prev);
  }
  assertEquals(headers, ["Bot env-bot-token"]);
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const channel = discordChannel({ credentials: { applicationId: "app-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { interactionToken: "tok-1", channelId: "chan-1" } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, channelCtx);
  assertEquals(called, 0);
});

// ---- delivery: message.queued ---------------------------------------------

Deno.test("message.queued posts a one-line channel acknowledgement (not a reply-edit, not a reaction)", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const channel = discordChannel({
    credentials: { applicationId: "app-1", botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
  });
  // Deliberately carries an interactionToken too — message.queued must still
  // go to the plain channel-message endpoint (not the interaction edit/
  // followup endpoints message.completed uses), since this is a background
  // ack for a turn that is NOT the one owning the interaction response.
  const channelCtx = { state: { channelId: "chan-1", interactionToken: "tok-1", initialResponseSent: false } };

  await channel.events!["message.queued"]({ text: "also rename the tests" }, channelCtx);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].url.endsWith("/channels/chan-1/messages"), true);
  const content = (calls[0].body as { content: string }).content;
  assert(content.includes("queued"));
});

// When the busy branch resolves a pending gate as deny (handler.ts's
// startTurn, signalled via `deniedPendingGate`), the ack must say so — the
// generic "queued" line falsely implies the ball is still in the running
// turn's court.
Deno.test("message.queued names the closed gate when deniedPendingGate is set", async () => {
  const calls: Array<{ body: unknown }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const channel = discordChannel({
    credentials: { applicationId: "app-1", botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
  });
  const channelCtx = { state: { channelId: "chan-1" } };

  await channel.events!["message.queued"](
    { text: "yes but first explain why the chunk count is wrong", deniedPendingGate: true },
    channelCtx,
  );

  assertEquals(calls.length, 1);
  const content = (calls[0].body as { content: string }).content;
  assert(/closed the pending approval|feedback/i.test(content), `expected the deny-ack wording, got: ${content}`);
});

Deno.test("message.queued is a no-op without a channelId, and swallows a delivery failure", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("boom", { status: 500 }));
  };
  const channel = discordChannel({ credentials: { applicationId: "app-1" }, api: { fetch: fetchMock } });

  // No channelId in state → nothing to post to.
  await channel.events!["message.queued"]({ text: "hi" }, { state: {} });
  assertEquals(called, 0);

  // A channelId that leads to a failed delivery must not throw (best-effort).
  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await channel.events!["message.queued"]({ text: "hi" }, { state: { channelId: "chan-1" } });
  } finally {
    console.warn = origWarn;
  }
  assertEquals(called, 1);
  assert(logged.some((l) => l.includes("message.queued")));
});

// ---- delivery: turn.reaped --------------------------------------------------

Deno.test("turn.reaped posts a channel notification (singular wording for count 1)", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const channel = discordChannel({
    credentials: { applicationId: "app-1", botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
  });
  const channelCtx = { state: { channelId: "chan-1" } };

  await channel.events!["turn.reaped"]({ count: 1, reason: "stale" }, channelCtx);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].method, "POST");
  assertEquals(calls[0].url.endsWith("/channels/chan-1/messages"), true);
  const content = (calls[0].body as { content: string }).content;
  assert(content.includes("timed out"));
  assert(content.includes("reset"));
});

Deno.test("turn.reaped posts a channel notification (plural wording with the count for count > 1)", async () => {
  const calls: Array<{ body: unknown }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };
  const channel = discordChannel({
    credentials: { applicationId: "app-1", botToken: "bot-1" },
    api: { fetch: fetchMock, apiBaseUrl: "https://discord.test/api/v10" },
  });
  const channelCtx = { state: { channelId: "chan-1" } };

  await channel.events!["turn.reaped"]({ count: 3, reason: "stale" }, channelCtx);

  assertEquals(calls.length, 1);
  const content = (calls[0].body as { content: string }).content;
  assert(content.includes("3"));
});

Deno.test("turn.reaped is a no-op without a channelId, and swallows a delivery failure", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("boom", { status: 500 }));
  };
  const channel = discordChannel({ credentials: { applicationId: "app-1" }, api: { fetch: fetchMock } });

  // No channelId in state → nothing to post to.
  await channel.events!["turn.reaped"]({ count: 1, reason: "stale" }, { state: {} });
  assertEquals(called, 0);

  // A channelId that leads to a failed delivery must not throw (best-effort).
  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await channel.events!["turn.reaped"]({ count: 1, reason: "stale" }, { state: { channelId: "chan-1" } });
  } finally {
    console.warn = origWarn;
  }
  assertEquals(called, 1);
  assert(logged.some((l) => l.includes("turn.reaped")));
});

// ---- delivery: input.requested → HITL components --------------------------

Deno.test("input.requested renders approve/deny button components", async () => {
  const calls: Array<{ body: { content?: string; components?: unknown[] } }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : {} });
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const channel = discordChannel({ credentials: { applicationId: "app-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { interactionToken: "tok-1", channelId: "chan-1", initialResponseSent: false } };

  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId: "req-1", action: { kind: "tool-call", callId: "c1", toolName: "delete_file", input: {} } }] },
    channelCtx,
  );

  assertEquals(calls.length, 1);
  const components = calls[0].body.components as Array<{ type: number; components: Array<{ custom_id: string; label: string }> }>;
  assertExists(components);
  // One action row with two buttons (approve, deny).
  assertEquals(components[0].type, 1); // ACTION_ROW
  assertEquals(components[0].components.length, 2);
  assertEquals(components[0].components[0].label, "Approve");
  assertEquals(components[0].components[1].label, "Deny");
  // custom_ids are eve HITL ids the vendored decoder round-trips.
  assertEquals(components[0].components[0].custom_id.startsWith("eve_input:"), true);
});

// ---- HITL callback → resume -----------------------------------------------

Deno.test("component callback derives input responses + calls resume", async () => {
  const { keypair, publicKeyHex } = await genKeypair();

  // Produce a valid approve-button custom_id using the vendored renderer.
  const rendered = renderInputRequestComponents({
    requestId: "req-42",
    prompt: "Approve `delete_file`?",
    display: "confirmation",
    options: [
      { id: "approve", label: "Approve", style: "primary" },
      { id: "deny", label: "Deny", style: "danger" },
    ],
  }) as Array<{ components: Array<{ custom_id: string }> }>;
  const approveCustomId = rendered[0].components[0].custom_id;

  const resumeCalls: Array<{ continuationToken: string; inputResponses: readonly unknown[] }> = [];
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex },
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, inputResponses: ctx.inputResponses });
    },
  });
  const { args, resumes } = mockArgs();

  const componentPayload = {
    type: 3, // MESSAGE_COMPONENT
    id: "interaction-2",
    application_id: "app-1",
    channel_id: "chan-1",
    token: "component-token",
    user: { id: "user-1", username: "alice" },
    message: { id: "msg-99", content: "Approve `delete_file`?" },
    data: { custom_id: approveCustomId, component_type: 2 },
  };
  const body = JSON.stringify(componentPayload);
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);

  // UPDATE_MESSAGE ACK: the outcome is written onto the message itself so the
  // whole channel sees who picked what, and the controls are removed.
  const ack = await res.json();
  assertEquals(ack.type, 7); // UPDATE_MESSAGE
  assertEquals(ack.data.components, []);
  assertEquals(ack.data.content.includes("Approve `delete_file`?"), true); // original text kept
  assertEquals(ack.data.content.includes("✅"), true);
  assertEquals(ack.data.content.includes("by <@user-1>"), true);

  assertEquals(resumeCalls.length, 1);
  const responses = resumeCalls[0].inputResponses as Array<{ requestId: string; optionId: string }>;
  assertEquals(responses.length, 1);
  assertEquals(responses[0].requestId, "req-42");
  assertEquals(responses[0].optionId, "approve");
  // opts.resume wins → the layer primitive is NOT invoked.
  assertEquals(resumes.length, 0);
});

// Discord's send-time token (channelId:interactionId) never equals the callback's
// (channelId:messageId), so resume works via MODE A: the requestId decoded from
// the button custom_id is forwarded to args.resume, which resolves BY REQUEST ID.
Deno.test("default resume (no opts.resume) forwards the decoded requestId+optionId to args.resume", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rendered = renderInputRequestComponents({
    requestId: "req-7",
    prompt: "Approve `x`?",
    display: "confirmation",
    options: [{ id: "approve", label: "Approve", style: "primary" }, { id: "deny", label: "Deny", style: "danger" }],
  }) as Array<{ components: Array<{ custom_id: string }> }>;
  const denyCustomId = rendered[0].components[1].custom_id;

  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  // Explicit ok:true — this test asserts the "applied" (✅) outcome, which
  // needs a real success unlike mockArgs()'s realistic default miss.
  const { args, resumes } = mockArgs({ ok: true });
  const payload = {
    type: 3,
    id: "i3",
    application_id: "app-1",
    channel_id: "chan-1",
    token: "t",
    user: { id: "u", username: "bob" },
    message: { id: "msg-5", content: "Approve `x`?" },
    data: { custom_id: denyCustomId, component_type: 2 },
  };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  // UPDATE_MESSAGE ACK recording the pick (message had no components in this
  // payload, so the label falls back to the decoded option id).
  const ack = await res.json();
  assertEquals(ack.type, 7);
  assertEquals(ack.data.content.includes("deny"), true);

  assertEquals(resumes.length, 1);
  // The requestId (from the custom_id) is what the layer resolves on — not the token.
  assertEquals(resumes[0].input.inputResponses, [{ requestId: "req-7", optionId: "deny" }]);
});

Deno.test("resume {ok:false} → message updated with a NOT-applied warning, never a silent ack", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rendered = renderInputRequestComponents({
    requestId: "req-8",
    prompt: "Approve `x`?",
    display: "confirmation",
    options: [{ id: "approve", label: "Approve", style: "primary" }, { id: "deny", label: "Deny", style: "danger" }],
  }) as Array<{ components: Array<{ custom_id: string }> }>;
  const approveCustomId = rendered[0].components[0].custom_id;

  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  const { args, resumes } = mockArgs({ ok: false, error: "no approval for request" });
  const payload = {
    type: 3,
    id: "i4",
    application_id: "app-1",
    channel_id: "chan-1",
    token: "t",
    user: { id: "u", username: "bob" },
    message: { id: "msg-6", content: "Approve `x`?" },
    data: { custom_id: approveCustomId, component_type: 2 },
  };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  const ack = await res.json();
  assertEquals(ack.type, 7);
  assertEquals(ack.data.content.includes("could NOT be applied"), true);
  assertEquals(ack.data.components, []);
  assertEquals(resumes.length, 1); // attempted, soft-failed, never threw
});

// ---- conversationId override -----------------------------------------------

Deno.test("conversationId override replaces interaction.id in the continuation token", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex },
    conversationId: (interaction) => `stable:${interaction.channelId}`,
  });
  const { args, sends } = mockArgs();
  const body = JSON.stringify(COMMAND_PAYLOAD);
  await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);

  assertEquals(sends.length, 1);
  // Uses the override's return value, not interaction.id.
  assertEquals(sends[0].opts.continuationToken, "chan-1:stable:chan-1");
});

Deno.test("without conversationId, continuation token still defaults to interaction.id", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({ credentials: { publicKey: publicKeyHex } });
  const { args, sends } = mockArgs();
  const body = JSON.stringify(COMMAND_PAYLOAD);
  await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);

  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.continuationToken, "chan-1:interaction-1");
});

// ---- commands inside a thread + messages:true (thread-history injection) ---

Deno.test("command inside a FOREIGN thread with messages:true gets thread history injected", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    // More specific key first — "/channels/thread-2" is a prefix of the
    // messages URL below, so it must be checked after the longer match.
    "/channels/thread-2/messages?": () =>
      Response.json([{ id: "9", content: "earlier stuff", author: { username: "bob", bot: false } }]),
    "/channels/thread-2": () => Response.json({ type: 11, parent_id: "chan-1", owner_id: "someone-else" }),
  });
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, applicationId: "app-1", botToken: "tok" },
    api: { fetch: rest.fn },
    messages: true,
  });
  const { args, sends } = mockArgs();
  const payload = { ...COMMAND_PAYLOAD, channel_id: "thread-2", channel: { type: 11, parent_id: "chan-1" } };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
  assert(sends[0].message.includes("<thread_messages>"));
  assert(sends[0].message.includes("[bob] earlier stuff"));
});

Deno.test("command inside a BOT-OWNED thread with messages:true gets no thread history", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    "/channels/thread-2": () => Response.json({ type: 11, parent_id: "chan-1", owner_id: "app-1" }),
  });
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, applicationId: "app-1", botToken: "tok" },
    api: { fetch: rest.fn },
    messages: true,
  });
  const { args, sends } = mockArgs();
  const payload = { ...COMMAND_PAYLOAD, channel_id: "thread-2", channel: { type: 11, parent_id: "chan-1" } };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
  assert(!sends[0].message.includes("<thread_messages>"));
});

Deno.test("command inside a thread with messages:false (regression): no history fetches, message unchanged", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, applicationId: "app-1", botToken: "tok" },
    api: { fetch: rest.fn },
  });
  const { args, sends } = mockArgs();
  const payload = { ...COMMAND_PAYLOAD, channel_id: "thread-2", channel: { type: 11, parent_id: "chan-1" } };
  const res = await channel.routes[0].handler(await signedRequest(keypair.privateKey, JSON.stringify(payload)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
  assertEquals(rest.calls.length, 0);
  assert(!sends[0].message.includes("<thread_messages>"));
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex },
    onCommand: () => ({ auth: null }),
  });
  const { args, sends } = mockArgs();
  const body = JSON.stringify(COMMAND_PAYLOAD);
  await channel.routes[0].handler(await signedRequest(keypair.privateKey, body), args);
  assertEquals(sends.length, 1);
  // Explicit null is honored, NOT collapsed into the default discord identity.
  assertEquals(sends[0].opts.auth, null);
});

// ---- allow-list -------------------------------------------------------------

Deno.test("allow-list: non-allowed user gets an ephemeral rejection, no send()", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex },
    allow: { users: ["someone-else"] },
  });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(
    await signedRequest(keypair.privateKey, JSON.stringify(COMMAND_PAYLOAD)),
    args,
  );
  const body = await res.json();
  assertEquals(body.data.flags, 64); // ephemeral
  assertEquals(body.data.content.includes("not authorized"), true);
  assertEquals(sends.length, 0);
});

Deno.test("allow-list: allowed user + channel passes through to send()", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex },
    allow: { users: ["user-1"], conversations: ["chan-1"] },
  });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(
    await signedRequest(keypair.privateKey, JSON.stringify(COMMAND_PAYLOAD)),
    args,
  );
  assertEquals(sends.length, 1);
});

Deno.test("allow-list: allowed user in a non-allowed channel is rejected", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex },
    allow: { users: ["user-1"], conversations: ["other-chan"] },
  });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(
    await signedRequest(keypair.privateKey, JSON.stringify(COMMAND_PAYLOAD)),
    args,
  );
  assertEquals(sends.length, 0);
});

// ---- MESSAGE_CREATE route ----------------------------------------------

const MESSAGE_IN_CLAW_THREAD = {
  id: "msg-10",
  channel_id: "thread-1",
  guild_id: "guild-1",
  content: "please also add tests",
  author: { id: "user-1", username: "alice", bot: false },
  mentions: [],
};

// Discord REST fake: channel lookup says thread-1 is a bot-owned public thread.
function discordRestFetch(overrides: Record<string, (url: string, init?: RequestInit) => Response> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = ((input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [needle, respond] of Object.entries(overrides)) {
      if (url.includes(needle)) return Promise.resolve(respond(url, init));
    }
    if (url.endsWith("/channels/thread-1")) {
      return Promise.resolve(Response.json({ type: 11, parent_id: "chan-1", owner_id: "app-1" }));
    }
    if (url.endsWith("/channels/chan-1")) {
      return Promise.resolve(Response.json({ type: 0 }));
    }
    if (url.includes("/messages?")) return Promise.resolve(Response.json([]));
    return Promise.resolve(Response.json({}));
  }) as typeof fetch;
  return { fn, calls };
}

function messagesChannel(publicKeyHex: string, fetchFn: typeof fetch) {
  return discordChannel({
    credentials: { publicKey: publicKeyHex, applicationId: "app-1", botToken: "tok" },
    api: { fetch: fetchFn },
    messages: true,
  });
}

function messagesRouteOf(channel: ReturnType<typeof discordChannel>) {
  const r = channel.routes.find((x) => x.path === "/messages");
  assertExists(r);
  return r!;
}

async function signedMessagesRequest(privateKey: CryptoKey, body: string): Promise<Request> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const data = new TextEncoder().encode(`${timestamp}${body}`);
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, data));
  return new Request("https://worker.example/base/eve/v1/discord/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join(""),
      "x-signature-timestamp": timestamp,
    },
    body,
  });
}

Deno.test("messages route: absent unless opts.messages, and routes[0] stays interactions", async () => {
  const { publicKeyHex } = await genKeypair();
  const off = discordChannel({ credentials: { publicKey: publicKeyHex } });
  assertEquals(off.routes.length, 1);
  const on = messagesChannel(publicKeyHex, discordRestFetch().fn);
  assertEquals(on.routes[0].path, "/");
  assertEquals(on.routes.length, 2);
  assertEquals(on.routes[1].path, "/messages");
});

Deno.test("messages route: unsigned POST → 401, no send", async () => {
  const { publicKeyHex } = await genKeypair();
  const channel = messagesChannel(publicKeyHex, discordRestFetch().fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    new Request("https://worker.example/base/eve/v1/discord/messages", {
      method: "POST",
      body: JSON.stringify(MESSAGE_IN_CLAW_THREAD),
    }),
    args,
  );
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0);
});

Deno.test("messages route: human message in bot-owned thread → send keyed to thread id", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = messagesChannel(publicKeyHex, discordRestFetch().fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(keypair.privateKey, JSON.stringify(MESSAGE_IN_CLAW_THREAD)),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.continuationToken, "thread-1:thread-1");
  assert(sends[0].message.includes("please also add tests"));
  assert(sends[0].message.includes("message_id: msg-10"));
  assert(!sends[0].message.includes("<thread_messages>")); // plain thread turn: no history block
  const state = sends[0].opts.state as { channelId?: string; initialResponseSent?: boolean };
  assertEquals(state.channelId, "thread-1");
  assertEquals(state.initialResponseSent, true);
  assertEquals(sends[0].opts.auth?.principalId, "user-1");
});

// ---- gate-text resolution -------------------------------------------------
// 27 of 43 real approval gates (63%) were never clicked — the human answered
// by typing "approve" in the thread instead, and only a button click resumed
// the parked session. These prove the wiring: a thread reply is tried against
// the session's pending gate FIRST (args.resume with the SAME continuation
// token send() would have used), and only starts an ordinary turn when that
// misses.

Deno.test("messages route: an ordinary reply tries gate-text resume first (miss), then falls through to send()", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = messagesChannel(publicKeyHex, discordRestFetch().fn);
  // mockArgs()'s default is a realistic "no pending approval" miss.
  const { args, sends, resumes } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(keypair.privateKey, JSON.stringify(MESSAGE_IN_CLAW_THREAD)),
    args,
  );
  assertEquals(res.status, 200);
  // resume() was tried, keyed to the SAME continuation token send() uses, with
  // the raw reply text — and only THEN did the ordinary turn start.
  assertEquals(resumes, [{ continuationToken: "thread-1:thread-1", input: { text: "please also add tests" } }]);
  assertEquals(sends.length, 1);
});

Deno.test("messages route: a plain-text 'approve' reply resolves the pending gate — no turn is started", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = messagesChannel(publicKeyHex, discordRestFetch().fn);
  const { args, sends, resumes } = mockArgs({ ok: true });
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({ ...MESSAGE_IN_CLAW_THREAD, content: "approve" }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(resumes, [{ continuationToken: "thread-1:thread-1", input: { text: "approve" } }]);
  // The parked turn continues itself (layer.ts resume()) — a SECOND turn for
  // the same reply must never start (this was a real concurrent-turn bug).
  assertEquals(sends.length, 0, "resolving the gate must not also start a new turn");
});

Deno.test("messages route: gate-text resume is also tried for an @mention reply in an existing thread", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    "/channels/thread-2/messages?": () => Response.json([]),
    "/channels/thread-2": () => Response.json({ type: 11, parent_id: "chan-1", owner_id: "someone-else" }),
  });
  const channel = messagesChannel(publicKeyHex, rest.fn);
  const { args, sends, resumes } = mockArgs({ ok: true });
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        id: "msg-31",
        channel_id: "thread-2",
        guild_id: "guild-1",
        content: "<@app-1> approve",
        author: { id: "user-1", username: "alice", bot: false },
        mentions: [{ id: "app-1" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(resumes, [{ continuationToken: "thread-2:thread-2", input: { text: "approve" } }]);
  assertEquals(sends.length, 0);
  // The (expensive) thread-history fetch for the mention-in-thread path is
  // skipped once the gate already resolved the reply.
  assert(!rest.calls.some((c) => c.url.includes("/channels/thread-2/messages?")));
});

Deno.test("messages route: an attachment-only reply (empty text) never attempts gate resume", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = messagesChannel(publicKeyHex, discordRestFetch().fn);
  const { args, sends, resumes } = mockArgs({ ok: true }); // even if it WOULD resolve, there's no text to try
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        ...MESSAGE_IN_CLAW_THREAD,
        content: "",
        attachments: [{ id: "a1", filename: "screenshot.png", url: "https://cdn.example/screenshot.png" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(resumes, []);
  assertEquals(sends.length, 1);
});

Deno.test("messages route: bot-authored message ignored", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = messagesChannel(publicKeyHex, discordRestFetch().fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({ ...MESSAGE_IN_CLAW_THREAD, author: { id: "app-1", username: "trex", bot: true } }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0);
});

Deno.test("messages route: @mention in regular channel creates message-anchored thread with channel history", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    "/messages/msg-20/threads": () => Response.json({ id: "thread-new" }),
    "/channels/chan-1/messages?": () =>
      Response.json([
        { id: "5", content: "we should automate this", author: { username: "bob", bot: false } },
      ]),
  });
  const channel = messagesChannel(publicKeyHex, rest.fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        id: "msg-20",
        channel_id: "chan-1",
        guild_id: "guild-1",
        content: "<@app-1> build the report exporter",
        author: { id: "user-1", username: "alice", bot: false },
        mentions: [{ id: "app-1" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.continuationToken, "thread-new:thread-new");
  assert(sends[0].message.includes("build the report exporter"));
  assert(!sends[0].message.includes("<@app-1>")); // mention stripped
  assert(sends[0].message.includes("<channel_messages>"));
  assert(sends[0].message.includes("[bob] we should automate this"));
  assertEquals(sends[0].opts.title, "build the report exporter");
});

Deno.test("messages route: @mention in foreign thread → send keyed to that thread with thread history", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    // Order matters: discordRestFetch matches by first-substring-wins, and
    // "/channels/thread-2" is itself a prefix of the messages URL below — the
    // more specific key must come first or it never gets checked.
    "/channels/thread-2/messages?": () =>
      Response.json([{ id: "7", content: "earlier discussion", author: { username: "bob", bot: false } }]),
    "/channels/thread-2": () => Response.json({ type: 11, parent_id: "chan-1", owner_id: "someone-else" }),
  });
  const channel = messagesChannel(publicKeyHex, rest.fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        id: "msg-30",
        channel_id: "thread-2",
        guild_id: "guild-1",
        content: "<@app-1> what do you think?",
        author: { id: "user-1", username: "alice", bot: false },
        mentions: [{ id: "app-1" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends[0].opts.continuationToken, "thread-2:thread-2");
  assert(sends[0].message.includes("<thread_messages>"));
  assert(sends[0].message.includes("[bob] earlier discussion"));
});

Deno.test("messages route: anchored thread creation failure falls back to a plain thread", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    "/messages/msg-21/threads": () => new Response("missing permission", { status: 403 }),
    "/channels/chan-1/threads": () => Response.json({ id: "thread-plain" }),
  });
  const channel = messagesChannel(publicKeyHex, rest.fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        id: "msg-21",
        channel_id: "chan-1",
        guild_id: "guild-1",
        content: "<@app-1> ship it",
        author: { id: "user-1", username: "alice", bot: false },
        mentions: [{ id: "app-1" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends[0].opts.continuationToken, "thread-plain:thread-plain");
});

Deno.test("messages route: both thread creations failing starts NO session and posts the error", async () => {
  // Regression: the old fallback keyed the session to `chan-1:chan-1`, merging
  // every failed-thread mention task in the channel into ONE session.
  const { keypair, publicKeyHex } = await genKeypair();
  const rest = discordRestFetch({
    "/messages/msg-22/threads": () => new Response("missing permission", { status: 403 }),
    "/channels/chan-1/threads": () => new Response("missing permission", { status: 403 }),
  });
  const channel = messagesChannel(publicKeyHex, rest.fn);
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(
      keypair.privateKey,
      JSON.stringify({
        id: "msg-22",
        channel_id: "chan-1",
        guild_id: "guild-1",
        content: "<@app-1> ship it anyway",
        author: { id: "user-1", username: "alice", bot: false },
        mentions: [{ id: "app-1" }],
      }),
    ),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0, "no session may be created without a thread");
  // The error lands in the channel as a bot message.
  const post = rest.calls.find((c) =>
    c.url.endsWith("/channels/chan-1/messages") && (c.init?.method ?? "GET") === "POST" &&
    String(c.init?.body ?? "").includes("couldn't create a task thread")
  );
  assert(post, "expected the thread-creation error to be posted to the channel");
});

Deno.test("messages route: allow-list miss is silently ignored", async () => {
  const { keypair, publicKeyHex } = await genKeypair();
  const channel = discordChannel({
    credentials: { publicKey: publicKeyHex, applicationId: "app-1", botToken: "tok" },
    api: { fetch: discordRestFetch().fn },
    messages: true,
    allow: { users: ["someone-else"] },
  });
  const { args, sends } = mockArgs();
  const res = await messagesRouteOf(channel).handler(
    await signedMessagesRequest(keypair.privateKey, JSON.stringify(MESSAGE_IN_CLAW_THREAD)),
    args,
  );
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0);
});
