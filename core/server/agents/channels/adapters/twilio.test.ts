// Twilio (SMS) adapter tests. NO live Twilio — the REST HTTP is mocked via
// opts.api.fetch, and the X-Twilio-Signature gate runs for REAL (a genuine
// HMAC-SHA1 over the request URL + sorted params, keyed by the auth token).

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { defaultTwilioResume, twilioChannel } from "./twilio.ts";
import { signTwilioRequest } from "../vendor/twilio/verify.ts";
import { deriveTwilioInputResponse, renderTwilioInputRequest } from "../vendor/twilio/hitl.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";

const AUTH_TOKEN = "test-auth-token";
const ACCOUNT_SID = "AC00000000000000000000000000000000";
const WEBHOOK_URL = "https://worker.example/base/eve/v1/twilio";
const USER = "+15551234567"; // the human's phone (inbound From / reply To)
const TWILIO_NUMBER = "+15559990000"; // our Twilio number (inbound To / reply From)

// ---- request helpers -------------------------------------------------------

async function smsRequest(
  fields: Record<string, string>,
  opts: { url?: string; token?: string; signature?: string; omitSignature?: boolean } = {},
): Promise<Request> {
  const url = opts.url ?? WEBHOOK_URL;
  const params = new URLSearchParams(fields);
  const body = params.toString();
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (!opts.omitSignature) {
    headers["x-twilio-signature"] = opts.signature ??
      await signTwilioRequest({ authToken: opts.token ?? AUTH_TOKEN, url, params });
  }
  return new Request(url, { method: "POST", headers, body });
}

const INBOUND_SMS: Record<string, string> = {
  From: USER,
  To: TWILIO_NUMBER,
  Body: "what is the weather",
  MessageSid: "SM123",
  AccountSid: ACCOUNT_SID,
};

interface SendCall {
  message: string;
  opts: { auth: ChannelAuth | null; continuationToken: string; state?: unknown; title?: string };
}

interface ResumeCall {
  continuationToken: string;
  input: { requestId?: string; decision?: string; inputResponses?: Array<{ requestId?: string; optionId?: string }> };
}

// Default resumeResult is {ok:false} — the common case is "no pending approval",
// where a reply-shaped inbound must fall through to a normal message.
function mockArgs(
  resumeResult: { ok: boolean; error?: string } = { ok: false },
): { args: ChannelRouteArgs; sends: SendCall[]; resumes: ResumeCall[]; flush: () => Promise<void> } {
  const sends: SendCall[] = [];
  const resumes: ResumeCall[] = [];
  const pending: Promise<unknown>[] = [];
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
    waitUntil: (p) => {
      pending.push(p);
    },
    requestIp: null,
  };
  return { args, sends, resumes, flush: async () => void (await Promise.allSettled(pending)) };
}

// ---- signature gate --------------------------------------------------------

Deno.test("valid X-Twilio-Signature passes the gate → reaches send() + TwiML ack", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await smsRequest(INBOUND_SMS), args);
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get("content-type") ?? "", "xml");
  assertStringIncludes(await res.text(), "<Response");
  await flush();
  assertEquals(sends.length, 1);
});

Deno.test("bad signature → 401 and zero send()", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await smsRequest(INBOUND_SMS, { signature: "totally-wrong" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("wrong-token signature → 401 (mismatch) and zero send()", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, flush } = mockArgs();
  // Signed with a DIFFERENT token → valid-looking base64 but wrong HMAC.
  const res = await channel.routes[0].handler(await smsRequest(INBOUND_SMS, { token: "other-token" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("missing signature header → 401 and zero send()", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await smsRequest(INBOUND_SMS, { omitSignature: true }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("missing configured auth token (fail closed) → 401", async () => {
  const channel = twilioChannel({}); // no token, no env
  const { args, sends, flush } = mockArgs();
  // A signature header IS present, but no token is configured to verify against.
  const res = await channel.routes[0].handler(await smsRequest(INBOUND_SMS, { signature: "anything" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

// ---- inbound message -------------------------------------------------------

Deno.test("SMS webhook → send() with the Body + From:To continuation token + twilio auth", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await smsRequest(INBOUND_SMS), args);
  await flush();

  assertEquals(sends.length, 1);
  const call = sends[0];
  assertStringIncludes(call.message, "what is the weather");
  assertStringIncludes(call.message, "<twilio_context>"); // SMS response guidance prepended
  assertEquals(call.opts.continuationToken, `${USER}:${TWILIO_NUMBER}`);
  assertEquals(call.opts.auth?.authenticator, "twilio-webhook");
  assertEquals(call.opts.auth?.principalId, `twilio:${USER}`);
  const state = call.opts.state as { from?: string; to?: string };
  assertEquals(state.from, USER);
  assertEquals(state.to, TWILIO_NUMBER);
});

Deno.test("a delivery-status callback (no Body) is not a message → no send()", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, flush } = mockArgs();
  const status = { From: USER, To: TWILIO_NUMBER, MessageStatus: "delivered", MessageSid: "SM9" };
  const res = await channel.routes[0].handler(await smsRequest(status), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN }, onCommand: () => ({ auth: null }) });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await smsRequest(INBOUND_SMS), args);
  await flush();
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.auth, null);
});

// ---- delivery: message.completed → REST -----------------------------------

Deno.test("message.completed → Twilio REST Messages.json call with the reply", async () => {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: new URLSearchParams(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ sid: "SMout" }), { status: 201 }));
  };
  const channel = twilioChannel({
    credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID },
    api: { fetch: fetchMock },
  });
  const channelCtx = { state: { from: USER, to: TWILIO_NUMBER } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "the weather is sunny", finishReason: "stop" }, channelCtx);

  assertEquals(calls.length, 1);
  assertStringIncludes(calls[0].url, `/Accounts/${ACCOUNT_SID}/Messages.json`);
  assertEquals(calls[0].body.get("Body"), "the weather is sunny");
  assertEquals(calls[0].body.get("To"), USER); // reply goes to the human
  assertEquals(calls[0].body.get("From"), TWILIO_NUMBER); // from our Twilio number
});

Deno.test("message.completed splits a >1600-char reply into multiple Messages.json calls", async () => {
  const bodies: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    bodies.push(new URLSearchParams(String(init?.body)).get("Body") ?? "");
    return Promise.resolve(new Response(JSON.stringify({ sid: "SMout" }), { status: 201 }));
  };
  const channel = twilioChannel({
    credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID },
    api: { fetch: fetchMock },
  });
  const channelCtx = { state: { from: USER, to: TWILIO_NUMBER } };
  const long = "A".repeat(1500) + "\n" + "B".repeat(500); // > 1600 → 2 chunks
  await channel.events!["message.completed"]({ turnId: "t1", message: long, finishReason: "stop" }, channelCtx);

  assertEquals(bodies.length, 2);
  assertEquals(bodies[0].startsWith("A"), true);
  assertEquals(bodies[1].startsWith("B"), true);
  assertEquals(bodies[0].length <= 1600, true);
  assertEquals(bodies[1].length <= 1600, true);
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID }, api: { fetch: fetchMock } });
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, { state: { from: USER, to: TWILIO_NUMBER } });
  assertEquals(called, 0);
});

// ---- delivery: input.requested → numbered-text options SMS ----------------

Deno.test("input.requested renders a numbered-text options SMS via REST", async () => {
  const bodies: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    bodies.push(new URLSearchParams(String(init?.body)).get("Body") ?? "");
    return Promise.resolve(new Response(JSON.stringify({ sid: "SMout" }), { status: 201 }));
  };
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID }, api: { fetch: fetchMock } });
  const requestId = crypto.randomUUID();
  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId, action: { kind: "tool-call", toolName: "delete_file", input: {} } }] },
    { state: { from: USER, to: TWILIO_NUMBER } },
  );

  assertEquals(bodies.length, 1);
  const sms = bodies[0];
  assertStringIncludes(sms, "delete_file");
  assertStringIncludes(sms, "1. Approve");
  assertStringIncludes(sms, "2. Deny");
  assertStringIncludes(sms, "Reply with a number");
});

// ---- HITL text mapping (helpers) ------------------------------------------

Deno.test("deriveTwilioInputResponse maps a numbered reply back to its option", () => {
  const requestId = crypto.randomUUID();
  const request = {
    requestId,
    prompt: "Approve delete_file?",
    display: "confirmation" as const,
    options: [{ id: "approve", label: "Approve" }, { id: "deny", label: "Deny" }],
  };
  // renderer + decoder agree.
  assertStringIncludes(renderTwilioInputRequest(request), "1. Approve");
  assertEquals(deriveTwilioInputResponse("1", request), { requestId, optionId: "approve" });
  assertEquals(deriveTwilioInputResponse("2.", request), { requestId, optionId: "deny" });
  // keyword + first-word matches.
  assertEquals(deriveTwilioInputResponse("deny", request), { requestId, optionId: "deny" });
  assertEquals(deriveTwilioInputResponse("Approve please", request), { requestId, optionId: "approve" });
  // out-of-range / unknown with no freeform → null.
  assertEquals(deriveTwilioInputResponse("9", request), null);
  assertEquals(deriveTwilioInputResponse("maybe", request), null);
});

// ---- HITL resume ----------------------------------------------------------

Deno.test("reply-shaped SMS + opts.resume → override called, args.resume NOT used, no send()", async () => {
  const resumeCalls: Array<{ continuationToken: string; body: string }> = [];
  const channel = twilioChannel({
    credentials: { authToken: AUTH_TOKEN },
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, body: ctx.body });
    },
  });
  const { args, sends, resumes, flush } = mockArgs();
  await channel.routes[0].handler(await smsRequest({ From: USER, To: TWILIO_NUMBER, Body: "1", MessageSid: "SM2" }), args);
  await flush();

  assertEquals(sends.length, 0); // routed to the override, not a fresh turn
  assertEquals(resumeCalls.length, 1);
  assertEquals(resumeCalls[0].continuationToken, `${USER}:${TWILIO_NUMBER}`);
  assertEquals(resumeCalls[0].body, "1");
  assertEquals(resumes.length, 0); // override wins → layer primitive untouched
});

// MODE B: exactly one pending approval → the reply is consumed as the decision.
Deno.test("reply-shaped SMS, single pending approval → resolved via args.resume, no send()", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, resumes, flush } = mockArgs({ ok: true });
  await channel.routes[0].handler(await smsRequest({ From: USER, To: TWILIO_NUMBER, Body: "1", MessageSid: "SM3" }), args);
  await flush();

  assertEquals(sends.length, 0); // consumed as an approval, not a fresh turn
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, `${USER}:${TWILIO_NUMBER}`);
  // "1" decodes to the approve verb (trex renders approve as option 1).
  assertEquals(resumes[0].input.decision, "approve");
});

// MODE B: no single pending approval → the reply falls through to a normal
// message (nothing dropped) — preserving the pre-wiring behavior.
Deno.test("reply-shaped SMS, no pending approval → falls through to a normal message", async () => {
  const channel = twilioChannel({ credentials: { authToken: AUTH_TOKEN } });
  const { args, sends, resumes, flush } = mockArgs({ ok: false });
  await channel.routes[0].handler(await smsRequest({ From: USER, To: TWILIO_NUMBER, Body: "1", MessageSid: "SM4" }), args);
  await flush();

  assertEquals(resumes.length, 1); // attempted resume first
  assertEquals(sends.length, 1); // then fell through to a normal message
  assertStringIncludes(sends[0].message, "1");
});

Deno.test("defaultTwilioResume forwards the decoded decision to args.resume; returns its ok", async () => {
  const { args, resumes } = mockArgs({ ok: true });
  const applied = await defaultTwilioResume({
    req: new Request(WEBHOOK_URL),
    args,
    continuationToken: `${USER}:${TWILIO_NUMBER}`,
    from: USER,
    to: TWILIO_NUMBER,
    body: "2",
  });
  assertEquals(applied, true);
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, `${USER}:${TWILIO_NUMBER}`);
  assertEquals(resumes[0].input.decision, "deny"); // "2" → deny
});

// ---- delivery: message.queued ---------------------------------------------

// A message that arrives while a turn is running is queued, not started; the
// ack is what stops it looking like the message vanished. Twilio's primitive is
// an unsolicited REST SMS — the inbound webhook that queued the message has
// already been answered, so TwiML is no longer available.
Deno.test("message.queued sends a one-line acknowledgement SMS via REST", async () => {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: new URLSearchParams(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ sid: "SMout" }), { status: 201 }));
  };
  const channel = twilioChannel({
    credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID },
    api: { fetch: fetchMock },
  });

  await channel.events!["message.queued"]({ text: "also rename the tests" }, { state: { from: USER, to: TWILIO_NUMBER } });

  assertEquals(calls.length, 1);
  assertStringIncludes(calls[0].url, `/Accounts/${ACCOUNT_SID}/Messages.json`);
  assertEquals(calls[0].body.get("To"), USER); // the ack goes to the human
  assertEquals(calls[0].body.get("From"), TWILIO_NUMBER);
  assertStringIncludes(calls[0].body.get("Body") ?? "", "queued");
});

Deno.test("message.queued names the closed gate when deniedPendingGate is set", async () => {
  const bodies: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    bodies.push(new URLSearchParams(String(init?.body)).get("Body") ?? "");
    return Promise.resolve(new Response(JSON.stringify({ sid: "SMout" }), { status: 201 }));
  };
  const channel = twilioChannel({
    credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID },
    api: { fetch: fetchMock },
  });

  await channel.events!["message.queued"](
    { text: "yes but explain the chunk count first", deniedPendingGate: true },
    { state: { from: USER, to: TWILIO_NUMBER } },
  );

  assertEquals(bodies.length, 1);
  assertEquals(/closed the pending approval|feedback/i.test(bodies[0]), true, `expected the deny-ack wording, got: ${bodies[0]}`);
  // SMS bills per encoding unit: a single non-GSM-7 character would force the
  // whole body into UCS-2 and bill this 152-character ack as 3 segments instead
  // of 1. This is the adapter-level half of the guard — it pins that twilio
  // actually reaches for the GSM-7 rendering, not just that one exists.
  const isAscii = (t: string) => [...t].every((c) => (c.codePointAt(0) ?? 0) <= 0x7f);
  assertEquals(isAscii(bodies[0]), true, `outbound SMS must be ASCII-only, got: ${bodies[0]}`);
  assertEquals(bodies[0].length <= 160, true, `outbound SMS is ${bodies[0].length} septets — over a single segment`);
});

Deno.test("message.queued is a no-op without a sender, and swallows a delivery failure", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("boom", { status: 500 }));
  };
  const channel = twilioChannel({
    credentials: { authToken: AUTH_TOKEN, accountSid: ACCOUNT_SID },
    api: { fetch: fetchMock },
  });

  await channel.events!["message.queued"]({ text: "hi" }, { state: {} });
  assertEquals(called, 0);

  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await channel.events!["message.queued"]({ text: "hi" }, { state: { from: USER, to: TWILIO_NUMBER } });
  } finally {
    console.warn = origWarn;
  }
  assertEquals(called, 1);
  assertEquals(logged.some((l) => l.includes("message.queued")), true);
});
