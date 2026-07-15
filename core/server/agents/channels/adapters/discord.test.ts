// Discord adapter tests. NO live Discord — the platform HTTP is mocked via
// opts.api.fetch, and Ed25519 signatures are produced with a locally-generated
// keypair so the vendored WebCrypto verify path runs for real.

import { assertEquals, assertExists } from "jsr:@std/assert";
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
  input: { requestId?: string; decision?: string; inputResponses?: Array<{ requestId?: string; optionId?: string }> };
}

function mockArgs(
  resumeResult: { ok: boolean; error?: string } = { ok: true },
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

  // Deferred update ACK.
  const ack = await res.json();
  assertEquals(ack.type, 6); // DEFERRED_UPDATE_MESSAGE

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
  const { args, resumes } = mockArgs();
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
  // Deferred-update ACK preserved regardless of the resume outcome.
  assertEquals((await res.json()).type, 6);

  assertEquals(resumes.length, 1);
  // The requestId (from the custom_id) is what the layer resolves on — not the token.
  assertEquals(resumes[0].input.inputResponses, [{ requestId: "req-7", optionId: "deny" }]);
});

Deno.test("DEFERRED_UPDATE ACK still returned when args.resume reports {ok:false}", async () => {
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
  assertEquals((await res.json()).type, 6);
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
