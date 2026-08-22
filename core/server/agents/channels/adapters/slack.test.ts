// Slack adapter tests. NO live Slack — the platform HTTP is mocked via
// opts.api.fetch, and signing-secret HMAC signatures are produced locally so the
// vendored WebCrypto verify path runs for real.

import { assertEquals, assertExists } from "jsr:@std/assert";
import { slackChannel } from "./slack.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";
import { hmacSha256Hex } from "../vendor/slack/shared.ts";
import {
  HITL_FREEFORM_MODAL_ACTION_ID,
  HITL_FREEFORM_MODAL_BLOCK_ID,
  HITL_FREEFORM_MODAL_CALLBACK_ID,
  renderInputRequestBlocks,
} from "../vendor/slack/hitl.ts";

const SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";

// ---- helpers ---------------------------------------------------------------

async function signedRequest(
  body: string,
  opts: { contentType?: string; timestamp?: string; badSig?: boolean } = {},
): Promise<Request> {
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const mac = await hmacSha256Hex(SIGNING_SECRET, `v0:${timestamp}:${body}`);
  let sig = `v0=${mac}`;
  if (opts.badSig) sig = `v0=${"0".repeat(mac.length)}`;
  return new Request("https://worker.example/base/eve/v1/slack", {
    method: "POST",
    headers: {
      "content-type": opts.contentType ?? "application/json",
      "x-slack-signature": sig,
      "x-slack-request-timestamp": timestamp,
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
  knownTokens: string[] = [],
): { args: ChannelRouteArgs; sends: SendCall[]; resumes: ResumeCall[] } {
  const sends: SendCall[] = [];
  const resumes: ResumeCall[] = [];
  const args: ChannelRouteArgs = {
    hasSession: (token) => Promise.resolve(knownTokens.includes(token)),
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

const MESSAGE_EVENT = {
  type: "event_callback",
  team_id: "T123",
  event: {
    type: "app_mention",
    user: "U777",
    username: "alice",
    text: "what is the weather",
    ts: "1700000000.000100",
    thread_ts: "1700000000.000001",
    channel: "C555",
  },
};

// ---- signature gate --------------------------------------------------------

Deno.test("valid signing-secret HMAC passes the gate → reaches send()", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
});

Deno.test("bad signature → 401 and no send()", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT), { badSig: true }), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0); // gate ran BEFORE send()
});

Deno.test("stale timestamp (>5min) → 401 and no send()", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs();
  const stale = String(Math.floor(Date.now() / 1000) - 600); // 10 min old
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT), { timestamp: stale }), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0);
});

Deno.test("missing signing secret (fail closed) → 401", async () => {
  const channel = slackChannel({}); // no secret, no env
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);
  assertEquals(res.status, 401);
  assertEquals(sends.length, 0);
});

// ---- url_verification ------------------------------------------------------

Deno.test("url_verification echoes the challenge (only after verify)", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args } = mockArgs();
  const body = JSON.stringify({ type: "url_verification", challenge: "abc123challenge" });
  const res = await channel.routes[0].handler(await signedRequest(body), args);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "abc123challenge");
});

Deno.test("url_verification with a BAD signature → 401 (challenge NOT echoed)", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args } = mockArgs();
  const body = JSON.stringify({ type: "url_verification", challenge: "secret" });
  const res = await channel.routes[0].handler(await signedRequest(body, { badSig: true }), args);
  assertEquals(res.status, 401);
});

// ---- inbound message -------------------------------------------------------

Deno.test("message event → send() with the text + channel:thread_ts token + slack auth", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);

  assertEquals(sends.length, 1);
  const call = sends[0];
  assertEquals(call.message.includes("what is the weather"), true);
  // Continuation token = <channelId>:<threadTs> (raw; layer namespaces it).
  assertEquals(call.opts.continuationToken, "C555:1700000000.000001");
  assertEquals(call.opts.auth?.authenticator, "slack-webhook");
  assertEquals(call.opts.auth?.principalId, "slack:T123:U777");
  // State carries channel + thread for later delivery.
  const state = call.opts.state as { channelId?: string; threadTs?: string };
  assertEquals(state.channelId, "C555");
  assertEquals(state.threadTs, "1700000000.000001");
});

Deno.test("DMs are off by default: a human DM is acked but never reaches send(); opt-in accepts it", async () => {
  const humanDm = {
    type: "event_callback",
    team_id: "T1",
    event: { type: "message", channel_type: "im", user: "U9", text: "help me", ts: "2.2", channel: "D1" },
  };
  // Default (directMessages unset) → dropped silently.
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(humanDm)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0, "a DM must not create a session by default");

  // Explicit opt-in → handled.
  const dmChannel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET }, directMessages: true });
  const { args: args2, sends: sends2 } = mockArgs();
  await dmChannel.routes[0].handler(await signedRequest(JSON.stringify(humanDm)), args2);
  assertEquals(sends2.length, 1, "directMessages: true must accept the DM");
});

Deno.test("a DM message from the bot itself is ignored (no send)", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs();
  const botDm = {
    type: "event_callback",
    team_id: "T1",
    event: { type: "message", channel_type: "im", bot_id: "B1", text: "echo", ts: "1.1", channel: "D1" },
  };
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(botDm)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0);
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET }, onCommand: () => ({ auth: null }) });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.auth, null);
});

// ---- delivery: message.completed ------------------------------------------

Deno.test("message.completed posts the reply into the thread", async () => {
  const calls: Array<{ url: string; body: Record<string, string> }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: Object.fromEntries(new URLSearchParams(String(init?.body))) });
    return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: "1700000000.000200", channel: "C555" }), { status: 200 }));
  };
  const channel = slackChannel({ credentials: { botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { channelId: "C555", threadTs: "1700000000.000001" } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "the weather is sunny", finishReason: "stop" }, channelCtx);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url.endsWith("/chat.postMessage"), true);
  assertEquals(calls[0].body.channel, "C555");
  assertEquals(calls[0].body.thread_ts, "1700000000.000001");
  assertEquals(calls[0].body.text, "the weather is sunny");
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  const channel = slackChannel({ credentials: { botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { channelId: "C555", threadTs: "1.1" } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, channelCtx);
  assertEquals(called, 0);
});

// ---- delivery: input.requested → Block Kit --------------------------------

Deno.test("input.requested renders approve/deny Block Kit buttons", async () => {
  const calls: Array<{ body: Record<string, string> }> = [];
  const fetchMock: typeof fetch = (_input, init) => {
    calls.push({ body: Object.fromEntries(new URLSearchParams(String(init?.body))) });
    return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: "1.2" }), { status: 200 }));
  };
  const channel = slackChannel({ credentials: { botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { channelId: "C555", threadTs: "1.1" } };

  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId: "req-1", action: { kind: "tool-call", callId: "c1", toolName: "delete_file", input: {} } }] },
    channelCtx,
  );

  assertEquals(calls.length, 1);
  const blocks = JSON.parse(calls[0].body.blocks) as Array<{ type: string; elements?: Array<{ type: string; text?: { text: string }; value?: string; action_id: string }> }>;
  assertExists(blocks);
  // prompt section + actions block with two buttons.
  const actions = blocks.find((b) => b.type === "actions");
  assertExists(actions);
  assertEquals(actions.elements!.length, 2);
  assertEquals(actions.elements![0].text!.text, "Approve");
  assertEquals(actions.elements![1].text!.text, "Deny");
  assertEquals(actions.elements![0].action_id.startsWith("eve_input:"), true);
  assertEquals(actions.elements![0].value, "approve");
});

// ---- HITL callback → resume -----------------------------------------------

function approveBlockActionsPayload(): Record<string, unknown> {
  // Reproduce a real approve-button action_id/value using the vendored renderer.
  const blocks = renderInputRequestBlocks({
    requestId: "req-42",
    prompt: "Approve `delete_file`?",
    display: "confirmation",
    action: { toolName: "delete_file", input: {} },
    options: [
      { id: "approve", label: "Approve", style: "primary" },
      { id: "deny", label: "Deny", style: "danger" },
    ],
  }) as Array<{ type: string; elements?: Array<{ action_id: string; value: string }> }>;
  const approveBtn = blocks.find((b) => b.type === "actions")!.elements![0];
  return {
    type: "block_actions",
    trigger_id: "trigger-1",
    team: { id: "T123" },
    user: { id: "U777", username: "alice" },
    channel: { id: "C555" },
    message: { ts: "1700000000.000200", thread_ts: "1700000000.000001", blocks },
    actions: [{ action_id: approveBtn.action_id, value: approveBtn.value, block_id: "b1" }],
  };
}

function interactionRequest(payload: Record<string, unknown>): Promise<Request> {
  const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  return signedRequest(body, { contentType: "application/x-www-form-urlencoded" });
}

Deno.test("interaction callback derives input responses + calls opts.resume", async () => {
  const resumeCalls: Array<{ continuationToken: string; inputResponses: readonly unknown[] }> = [];
  // chat.update (answered-card) is best-effort; mock it away.
  const fetchMock: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const channel = slackChannel({
    credentials: { signingSecret: SIGNING_SECRET, botToken: "xoxb-1" },
    api: { fetch: fetchMock },
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, inputResponses: ctx.inputResponses });
    },
  });
  const { args, resumes } = mockArgs();
  const res = await channel.routes[0].handler(await interactionRequest(approveBlockActionsPayload()), args);
  assertEquals(res.status, 200);

  assertEquals(resumeCalls.length, 1);
  assertEquals(resumeCalls[0].continuationToken, "C555:1700000000.000001");
  const responses = resumeCalls[0].inputResponses as Array<{ requestId: string; optionId: string }>;
  assertEquals(responses.length, 1);
  assertEquals(responses[0].requestId, "req-42");
  assertEquals(responses[0].optionId, "approve");
  // opts.resume wins → the layer primitive is NOT invoked.
  assertEquals(resumes.length, 0);
});

Deno.test("default resume (no opts.resume) routes the decoded decision through args.resume", async () => {
  // chat.update (answered-card) is best-effort; mock it away.
  const fetchMock: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET, botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const { args, resumes } = mockArgs();
  const res = await channel.routes[0].handler(await interactionRequest(approveBlockActionsPayload()), args);
  assertEquals(res.status, 200); // interactivity ACK preserved

  assertEquals(resumes.length, 1);
  // Resume addresses the parked session by the SAME channel:thread_ts token.
  assertEquals(resumes[0].continuationToken, "C555:1700000000.000001");
  // The vendored decode is forwarded verbatim as inputResponses.
  assertEquals(resumes[0].input.inputResponses, [{ requestId: "req-42", optionId: "approve" }]);
});

// THE KEY correctness property: the resume token equals the token send() used
// for the SAME Slack thread, so the layer's getSessionByToken finds the session.
Deno.test("resume token equals the send token for the same thread", async () => {
  const fetchMock: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET, botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const { args, sends, resumes } = mockArgs();
  // 1) inbound message opens/keys the session for this thread.
  await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);
  // 2) a HITL button click in that SAME thread resumes it.
  await channel.routes[0].handler(await interactionRequest(approveBlockActionsPayload()), args);
  assertEquals(sends.length, 1);
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, sends[0].opts.continuationToken);
});

Deno.test("interactivity ACK still 200 when args.resume reports {ok:false}", async () => {
  const fetchMock: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET, botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const { args, resumes } = mockArgs({ ok: false, error: "no session for token" });
  const res = await channel.routes[0].handler(await interactionRequest(approveBlockActionsPayload()), args);
  assertEquals(res.status, 200);
  assertEquals(resumes.length, 1); // attempted, soft-failed, never threw
});

// ---- allow-list -------------------------------------------------------------

Deno.test("allow callback: denied user's message is acked but never reaches send()", async () => {
  const channel = slackChannel({
    credentials: { signingSecret: SIGNING_SECRET },
    allow: (id) => id.userId === "U-ALLOWED",
  });
  const { args, sends } = mockArgs();
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0);
});

Deno.test("allow callback: allowed user's message reaches send()", async () => {
  const channel = slackChannel({
    credentials: { signingSecret: SIGNING_SECRET },
    allow: (id) => id.userId === "U777", // MESSAGE_EVENT's user
  });
  const { args, sends } = mockArgs();
  await channel.routes[0].handler(await signedRequest(JSON.stringify(MESSAGE_EVENT)), args);
  assertEquals(sends.length, 1);
});

Deno.test("allow list object: denied interactivity is acked but never resumes", async () => {
  const fetchMock: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const channel = slackChannel({
    credentials: { signingSecret: SIGNING_SECRET, botToken: "xoxb-1" },
    api: { fetch: fetchMock },
    allow: { users: ["U-ALLOWED"] }, // approveBlockActionsPayload's actor is U777
  });
  const { args, resumes } = mockArgs();
  const res = await channel.routes[0].handler(await interactionRequest(approveBlockActionsPayload()), args);
  assertEquals(res.status, 200);
  assertEquals(resumes.length, 0);
});

// view_submission carries no channel of its own — the freeform-modal submit
// gate must read it from the modal's server-written privateMetadata (set by
// openFreeformModal), not fail closed against a conversations-only allow-list.
function freeformViewSubmissionPayload(): Record<string, unknown> {
  return {
    type: "view_submission",
    user: { id: "U777" },
    team: { id: "T123" },
    view: {
      callback_id: HITL_FREEFORM_MODAL_CALLBACK_ID,
      private_metadata: JSON.stringify({
        continuationToken: "C555:1700000000.000001",
        channelId: "C555",
        threadTs: "1700000000.000001",
        requestId: "req-42",
      }),
      state: {
        values: {
          [HITL_FREEFORM_MODAL_BLOCK_ID]: { [HITL_FREEFORM_MODAL_ACTION_ID]: { value: "the freeform answer" } },
        },
      },
    },
  };
}

Deno.test("conversations allow-list: view_submission resumes using the MODAL's channel, not the (absent) payload channel", async () => {
  const channel = slackChannel({
    credentials: { signingSecret: SIGNING_SECRET },
    allow: { conversations: ["C555"] }, // the channel carried in privateMetadata
  });
  const { args, resumes } = mockArgs();
  const res = await channel.routes[0].handler(await interactionRequest(freeformViewSubmissionPayload()), args);
  assertEquals(res.status, 200);
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, "C555:1700000000.000001");
  assertEquals(resumes[0].input.inputResponses, [{ requestId: "req-42", optionId: undefined }]);
});

Deno.test("conversations allow-list: view_submission for a channel NOT on the list is acked but never resumes", async () => {
  const channel = slackChannel({
    credentials: { signingSecret: SIGNING_SECRET },
    allow: { conversations: ["OTHER"] },
  });
  const { args, resumes } = mockArgs();
  const res = await channel.routes[0].handler(await interactionRequest(freeformViewSubmissionPayload()), args);
  assertEquals(res.status, 200);
  assertEquals(resumes.length, 0);
});

// ---- thread-following (opts.threads) ---------------------------------------

const THREAD_REPLY = {
  type: "event_callback",
  team_id: "T123",
  event: {
    type: "message",
    channel_type: "channel",
    user: "U777",
    text: "any update on this?",
    ts: "1700000000.000200",
    thread_ts: "1700000000.000001", // reply inside the mention's thread
    channel: "C555",
  },
};

Deno.test("threads: a reply in a thread WITH an existing session becomes a turn (no re-mention)", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET }, threads: true });
  // Session already exists for this thread's token (created by the earlier mention).
  const { args, sends } = mockArgs({ ok: true }, ["C555:1700000000.000001"]);
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(THREAD_REPLY)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.continuationToken, "C555:1700000000.000001");
  assertEquals(sends[0].message.includes("any update on this?"), true);
});

Deno.test("threads: a reply in a thread WITHOUT a session is ignored (join-only, never creates)", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET }, threads: true });
  const { args, sends } = mockArgs({ ok: true }, [] /* no known sessions */);
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(THREAD_REPLY)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0, "unknown thread must not start a session");
});

Deno.test("threads off (default): thread replies are ignored even with an existing session", async () => {
  const channel = slackChannel({ credentials: { signingSecret: SIGNING_SECRET } });
  const { args, sends } = mockArgs({ ok: true }, ["C555:1700000000.000001"]);
  const res = await channel.routes[0].handler(await signedRequest(JSON.stringify(THREAD_REPLY)), args);
  assertEquals(res.status, 200);
  assertEquals(sends.length, 0);
});

// ---- delivery: message.queued ---------------------------------------------

// A message that arrives while a turn is running is queued, not started; the
// ack is what stops it looking like the message vanished. Slack's primitive is
// an ordinary thread post (chat.postMessage), not the transient typing status.
Deno.test("message.queued posts a one-line acknowledgement into the thread", async () => {
  const calls: Array<{ url: string; body: Record<string, string> }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({ url: String(input), body: Object.fromEntries(new URLSearchParams(String(init?.body))) });
    return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: "1.2" }), { status: 200 }));
  };
  const channel = slackChannel({ credentials: { botToken: "xoxb-1" }, api: { fetch: fetchMock } });
  const channelCtx = { state: { channelId: "C555", threadTs: "1700000000.000001" } };

  await channel.events!["message.queued"]({ text: "also rename the tests" }, channelCtx);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url.endsWith("/chat.postMessage"), true);
  assertEquals(calls[0].body.channel, "C555");
  assertEquals(calls[0].body.thread_ts, "1700000000.000001");
  assertEquals(calls[0].body.text.includes("queued"), true);
});

Deno.test("message.queued names the closed gate when deniedPendingGate is set", async () => {
  const texts: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    texts.push(new URLSearchParams(String(init?.body)).get("text") ?? "");
    return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: "1.2" }), { status: 200 }));
  };
  const channel = slackChannel({ credentials: { botToken: "xoxb-1" }, api: { fetch: fetchMock } });

  await channel.events!["message.queued"](
    { text: "yes but first explain why the chunk count is wrong", deniedPendingGate: true },
    { state: { channelId: "C555", threadTs: "1.1" } },
  );

  assertEquals(texts.length, 1);
  assertEquals(/closed the pending approval|feedback/i.test(texts[0]), true, `expected the deny-ack wording, got: ${texts[0]}`);
});

Deno.test("message.queued is a no-op without a channelId, and swallows a delivery failure", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 500 }));
  };
  const channel = slackChannel({ credentials: { botToken: "xoxb-1" }, api: { fetch: fetchMock } });

  await channel.events!["message.queued"]({ text: "hi" }, { state: {} });
  assertEquals(called, 0);

  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await channel.events!["message.queued"]({ text: "hi" }, { state: { channelId: "C555" } });
  } finally {
    console.warn = origWarn;
  }
  assertEquals(called, 1);
  assertEquals(logged.some((l) => l.includes("message.queued")), true);
});
