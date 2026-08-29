// Teams adapter tests. NO live Azure — the JWKS is INJECTED (opts.jwks) with an
// ephemeral RSA public JWK, and the RS256 JWT is minted for REAL against the
// matching private key, so the full inbound validator (signature + alg + iss +
// aud + exp/nbf + kid selection) runs end-to-end with no network. The
// client-credentials token endpoint + the reply-Activity POST are mocked via
// opts.api.fetch. The security assertions are the point: every malformed /
// mismatched / unsigned token must 401 with ZERO send().

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { defaultTeamsResume, teamsChannel } from "./teams.ts";
import { clearTeamsAccessTokenCache } from "../vendor/teams/api.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";

const APP_ID = "app-1234";
const ISSUER = "https://api.botframework.com";
const SERVICE_URL = "https://smba.trafficmanager.net/teams";
const ROUTE_URL = "https://worker.example/base/eve/v1/teams";
const KID = "test-key-1";

// ---- crypto helpers --------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

interface KeyMaterial {
  privateKey: CryptoKey;
  jwk: JsonWebKey & { kid: string };
}

async function makeKey(kid: string): Promise<KeyMaterial> {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  return { privateKey: kp.privateKey, jwk: { ...jwk, kid } };
}

async function mintJwt(
  privateKey: CryptoKey,
  parts: { header?: Record<string, unknown>; payload?: Record<string, unknown> } = {},
): Promise<string> {
  const header = parts.header ?? { alg: "RS256", typ: "JWT", kid: KID };
  const payload = { ...defaultClaims(), ...parts.payload };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

function defaultClaims(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return { iss: ISSUER, aud: APP_ID, iat: now - 30, nbf: now - 30, exp: now + 300, serviceUrl: SERVICE_URL };
}

// ---- request + args helpers ------------------------------------------------

function messageActivity(over: { text?: string; conversationType?: string; isBotMentioned?: boolean } = {}): unknown {
  const recipient = { id: "bot-1", name: "Agent" };
  const from = { id: "user-1", name: "Alice", aadObjectId: "aad-1" };
  const entities = over.isBotMentioned
    ? [{ type: "mention", text: "<at>Agent</at>", mentioned: recipient }]
    : [];
  return {
    type: "message",
    id: "activity-1",
    serviceUrl: SERVICE_URL,
    conversation: { id: "conv-1", conversationType: over.conversationType ?? "personal" },
    from,
    recipient,
    text: over.text ?? "hello agent",
    entities,
    channelData: { tenant: { id: "tenant-1" } },
  };
}

function teamsRequest(payload: unknown, opts: { token?: string; omitAuth?: boolean } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!opts.omitAuth) headers["authorization"] = `Bearer ${opts.token ?? ""}`;
  return new Request(ROUTE_URL, { method: "POST", headers, body: JSON.stringify(payload) });
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
    // Never called by this adapter — see the note in github.test.ts.
    hasSession: () => Promise.resolve(false),
    requestIp: null,
  };
  return { args, sends, resumes, flush: async () => void (await Promise.allSettled(pending)) };
}

// ---- JWT gate: valid passes ------------------------------------------------

Deno.test("valid Bot Framework JWT passes the gate → reaches send() + 200 ack", async () => {
  const key = await makeKey(KID);
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, sends, flush } = mockArgs();
  const token = await mintJwt(key.privateKey);
  const res = await channel.routes[0].handler(teamsRequest(messageActivity(), { token }), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 1);
});

// ---- JWT gate: every failure → 401 + zero send() ---------------------------

async function assert401(over: {
  channel?: ReturnType<typeof teamsChannel>;
  token?: string;
  omitAuth?: boolean;
}, key: KeyMaterial): Promise<void> {
  const channel = over.channel ?? teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(
    teamsRequest(messageActivity(), { token: over.token, omitAuth: over.omitAuth }),
    args,
  );
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
}

Deno.test("wrong aud → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  await assert401({ token: await mintJwt(key.privateKey, { payload: { aud: "some-other-app" } }) }, key);
});

Deno.test("wrong iss → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  await assert401({ token: await mintJwt(key.privateKey, { payload: { iss: "https://evil.example" } }) }, key);
});

Deno.test("expired (exp in the past) → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  const now = Math.floor(Date.now() / 1000);
  await assert401({ token: await mintJwt(key.privateKey, { payload: { exp: now - 3600, nbf: now - 7200 } }) }, key);
});

Deno.test("not-yet-valid (nbf in the future) → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  const now = Math.floor(Date.now() / 1000);
  await assert401({ token: await mintJwt(key.privateKey, { payload: { nbf: now + 3600, exp: now + 7200 } }) }, key);
});

Deno.test("tampered signature → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  const token = await mintJwt(key.privateKey);
  const [h, p] = token.split(".");
  const tampered = `${h}.${p}.AAAAdeadbeef`; // wrong signature bytes
  await assert401({ token: tampered }, key);
});

Deno.test("tampered payload (signature no longer matches) → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  const token = await mintJwt(key.privateKey);
  const [h, , s] = token.split(".");
  const forgedPayload = b64urlJson({ ...defaultClaims(), aud: APP_ID, sub: "attacker" });
  await assert401({ token: `${h}.${forgedPayload}.${s}` }, key);
});

Deno.test("unknown kid (no matching key in a multi-key JWKS) → 401 and zero send()", async () => {
  const key1 = await makeKey("k1");
  const key2 = await makeKey("k2");
  // Two-key JWKS so the single-key fallback does not apply; token kid matches neither.
  const channel = teamsChannel({ appId: APP_ID, jwks: [key1.jwk, key2.jwk] });
  const token = await mintJwt(key1.privateKey, { header: { alg: "RS256", typ: "JWT", kid: "nope" } });
  await assert401({ channel, token }, key1);
});

Deno.test("alg:none → 401 and zero send() (no signature accepted)", async () => {
  const key = await makeKey(KID);
  const header = b64urlJson({ alg: "none", typ: "JWT", kid: KID });
  const payload = b64urlJson(defaultClaims());
  await assert401({ token: `${header}.${payload}.` }, key);
});

Deno.test("non-RS256 alg (HS256) → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  const header = b64urlJson({ alg: "HS256", typ: "JWT", kid: KID });
  const payload = b64urlJson(defaultClaims());
  await assert401({ token: `${header}.${payload}.c2ln` }, key);
});

Deno.test("missing Authorization header → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  await assert401({ omitAuth: true }, key);
});

Deno.test("missing MICROSOFT_APP_ID (fail closed) → 401 and zero send()", async () => {
  const key = await makeKey(KID);
  for (const k of ["MICROSOFT_APP_ID", "TEAMS_APP_ID"]) {
    try {
      Deno.env.delete(k);
    } catch { /* ignore */ }
  }
  const channel = teamsChannel({ jwks: [key.jwk] }); // no appId configured
  await assert401({ channel, token: await mintJwt(key.privateKey) }, key);
});

Deno.test("JWKS refresh recovers an unknown kid (empty first load, key on refresh) → passes", async () => {
  const key = await makeKey(KID);
  let calls = 0;
  const channel = teamsChannel({
    appId: APP_ID,
    jwks: ({ forceRefresh }) => {
      calls++;
      return forceRefresh ? [key.jwk] : [];
    },
  });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(teamsRequest(messageActivity(), { token: await mintJwt(key.privateKey) }), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 1);
  assertEquals(calls, 2); // initial load (empty) + forced refresh
});

// ---- inbound message → send() ----------------------------------------------

Deno.test("message Activity → send() with text + conversation-id token + teams auth", async () => {
  const key = await makeKey(KID);
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(
    teamsRequest(messageActivity({ text: "what is the weather" }), { token: await mintJwt(key.privateKey) }),
    args,
  );
  await flush();

  assertEquals(sends.length, 1);
  const call = sends[0];
  assertStringIncludes(call.message, "what is the weather");
  assertStringIncludes(call.message, "<teams_context>");
  assertEquals(call.opts.continuationToken, "conv-1");
  assertEquals(call.opts.auth?.authenticator, "teams-activity");
  assertEquals(call.opts.auth?.principalId, "teams:tenant-1:user-1");
  const state = call.opts.state as { serviceUrl?: string; conversationId?: string; activityId?: string };
  assertEquals(state.serviceUrl, SERVICE_URL);
  assertEquals(state.conversationId, "conv-1");
  assertEquals(state.activityId, "activity-1");
});

Deno.test("non-personal message without @-mention → no send() (mention-gated)", async () => {
  const key = await makeKey(KID);
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(
    teamsRequest(messageActivity({ conversationType: "channel", isBotMentioned: false }), {
      token: await mintJwt(key.privateKey),
    }),
    args,
  );
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const key = await makeKey(KID);
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk], onCommand: () => ({ auth: null }) });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(teamsRequest(messageActivity(), { token: await mintJwt(key.privateKey) }), args);
  await flush();
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.auth, null);
});

// ---- delivery: message.completed → reply Activity (client-cred token) ------

Deno.test("message.completed → mints a client-credentials token, POSTs a reply Activity with Bearer", async () => {
  clearTeamsAccessTokenCache();
  const calls: Array<{ url: string; method?: string; auth?: string; body?: unknown; form?: string }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization") ?? undefined;
    if (url.includes("/oauth2/v2.0/token")) {
      calls.push({ url, method: init?.method, form: String(init?.body) });
      return Promise.resolve(new Response(JSON.stringify({ access_token: "cc-token", expires_in: 3600 }), { status: 200 }));
    }
    calls.push({ url, method: init?.method, auth, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
  };
  const channel = teamsChannel({
    appId: APP_ID,
    credentials: { appId: APP_ID, appPassword: "secret" },
    api: { fetch: fetchMock },
    jwks: [],
  });
  const channelCtx = { state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "the weather is sunny", finishReason: "stop" }, channelCtx);

  const tokenCall = calls.find((c) => c.url.includes("/oauth2/v2.0/token"));
  const replyCall = calls.find((c) => c.url.includes("/v3/conversations/conv-1/activities/activity-1"));
  assertEquals(tokenCall !== undefined, true);
  assertStringIncludes(tokenCall!.form ?? "", "grant_type=client_credentials");
  assertStringIncludes(tokenCall!.form ?? "", "scope=https");
  assertEquals(replyCall !== undefined, true);
  assertEquals(replyCall!.method, "POST");
  assertEquals(replyCall!.auth, "Bearer cc-token");
  assertEquals((replyCall!.body as { text: string }).text, "the weather is sunny");
});

Deno.test("message.completed splits a very long reply into multiple reply POSTs", async () => {
  clearTeamsAccessTokenCache();
  const replies: string[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.includes("/oauth2/v2.0/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "cc", expires_in: 3600 }), { status: 200 }));
    }
    replies.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return Promise.resolve(new Response(JSON.stringify({ id: "r" }), { status: 200 }));
  };
  const channel = teamsChannel({
    appId: APP_ID,
    credentials: { appId: APP_ID, appPassword: "secret" },
    api: { fetch: fetchMock },
    jwks: [],
  });
  const long = "A".repeat(81_000) + "\n\n" + "B".repeat(4000); // > 80 KB → 2 chunks
  await channel.events!["message.completed"]({ turnId: "t1", message: long, finishReason: "stop" }, {
    state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" },
  });
  assertEquals(replies.length, 2);
  assertEquals(replies[0].startsWith("A"), true);
  assertEquals(replies[1].startsWith("B"), true);
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const channel = teamsChannel({ appId: APP_ID, credentials: { appId: APP_ID, appPassword: "s" }, api: { fetch: fetchMock }, jwks: [] });
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, {
    state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" },
  });
  assertEquals(called, 0);
});

// ---- delivery: input.requested → Adaptive Card -----------------------------

Deno.test("input.requested renders an Adaptive Card reply with approve/deny actions", async () => {
  clearTeamsAccessTokenCache();
  const posted: unknown[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.includes("/oauth2/v2.0/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "cc", expires_in: 3600 }), { status: 200 }));
    }
    posted.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ id: "r" }), { status: 200 }));
  };
  const channel = teamsChannel({
    appId: APP_ID,
    credentials: { appId: APP_ID, appPassword: "secret" },
    api: { fetch: fetchMock },
    jwks: [],
  });
  const requestId = crypto.randomUUID();
  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId, action: { kind: "tool-call", toolName: "delete_file", input: {} } }] },
    { state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" } },
  );

  assertEquals(posted.length, 1);
  const activity = posted[0] as { text: string; attachments: Array<{ contentType: string; content: Record<string, unknown> }> };
  assertStringIncludes(activity.text, "delete_file");
  assertEquals(activity.attachments[0].contentType, "application/vnd.microsoft.card.adaptive");
  const card = activity.attachments[0].content;
  assertEquals(card.type, "AdaptiveCard");
  const actions = card.actions as Array<{ title: string; type: string; data: Record<string, unknown> }>;
  assertEquals(actions.length, 2);
  assertEquals(actions[0].type, "Action.Submit");
  assertEquals(actions.map((a) => a.title).sort(), ["Approve", "Deny"]);
  assertEquals((actions[0].data.eve_input as { requestId: string }).requestId, requestId);
});

// ---- HITL card round-trip → resume -----------------------------------------

Deno.test("a card-submit Activity + opts.resume → resume called with derived responses, no send()", async () => {
  const key = await makeKey(KID);
  const requestId = crypto.randomUUID();
  const resumeCalls: Array<{ continuationToken: string; responses: readonly { requestId: string; optionId?: string }[] }> = [];
  const channel = teamsChannel({
    appId: APP_ID,
    jwks: [key.jwk],
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, responses: ctx.responses });
    },
  });
  const { args, sends, resumes, flush } = mockArgs();
  const submit = {
    type: "message",
    id: "activity-2",
    serviceUrl: SERVICE_URL,
    conversation: { id: "conv-1", conversationType: "personal" },
    from: { id: "user-1", name: "Alice" },
    recipient: { id: "bot-1" },
    text: "",
    value: { eve_input: { requestId, optionId: "approve" } },
  };
  await channel.routes[0].handler(teamsRequest(submit, { token: await mintJwt(key.privateKey) }), args);
  await flush();

  assertEquals(sends.length, 0); // routed to resume, not a fresh turn
  assertEquals(resumeCalls.length, 1);
  assertEquals(resumeCalls[0].continuationToken, "conv-1");
  assertEquals(resumeCalls[0].responses[0], { requestId, optionId: "approve" });
  // opts.resume wins → the layer primitive is NOT invoked.
  assertEquals(resumes.length, 0);
});

function cardSubmit(requestId: string, optionId: string): unknown {
  return {
    type: "message",
    id: "activity-2",
    serviceUrl: SERVICE_URL,
    conversation: { id: "conv-1", conversationType: "personal" },
    from: { id: "user-1", name: "Alice" },
    recipient: { id: "bot-1" },
    text: "",
    value: { eve_input: { requestId, optionId } },
  };
}

Deno.test("default resume (no opts.resume) routes the derived responses through args.resume", async () => {
  const key = await makeKey(KID);
  const requestId = crypto.randomUUID();
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, sends, resumes, flush } = mockArgs();
  const res = await channel.routes[0].handler(
    teamsRequest(cardSubmit(requestId, "approve"), { token: await mintJwt(key.privateKey) }),
    args,
  );
  assertEquals(res.status, 200); // Teams ACK preserved
  await flush();

  assertEquals(sends.length, 0);
  assertEquals(resumes.length, 1);
  // Resume addresses the parked session by the SAME conversation-id token.
  assertEquals(resumes[0].continuationToken, "conv-1");
  assertEquals(resumes[0].input.inputResponses, [{ requestId, optionId: "approve" }]);
});

// THE KEY correctness property: the resume token equals the token send() used
// for the SAME Teams conversation, so the layer's getSessionByToken finds it.
Deno.test("resume token equals the send token for the same conversation", async () => {
  const key = await makeKey(KID);
  const requestId = crypto.randomUUID();
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, sends, resumes, flush } = mockArgs();
  // 1) inbound message opens/keys the session for conv-1.
  await channel.routes[0].handler(
    teamsRequest(messageActivity({ isBotMentioned: true }), { token: await mintJwt(key.privateKey) }),
    args,
  );
  // 2) a card submit in that SAME conversation resumes it.
  await channel.routes[0].handler(
    teamsRequest(cardSubmit(requestId, "approve"), { token: await mintJwt(key.privateKey) }),
    args,
  );
  await flush();
  assertEquals(sends.length, 1);
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, sends[0].opts.continuationToken);
});

Deno.test("Teams ACK still 200 when args.resume reports {ok:false}", async () => {
  const key = await makeKey(KID);
  const channel = teamsChannel({ appId: APP_ID, jwks: [key.jwk] });
  const { args, resumes, flush } = mockArgs({ ok: false, error: "no session for token" });
  const res = await channel.routes[0].handler(
    teamsRequest(cardSubmit(crypto.randomUUID(), "approve"), { token: await mintJwt(key.privateKey) }),
    args,
  );
  assertEquals(res.status, 200);
  await flush();
  assertEquals(resumes.length, 1); // attempted, soft-failed, never threw
});

// Direct-call coverage of the exported default: it forwards to args.resume and
// swallows a soft-fail (logs, never throws).
Deno.test("defaultTeamsResume forwards derived responses to args.resume", async () => {
  const { args, resumes } = mockArgs();
  await defaultTeamsResume({
    req: new Request(ROUTE_URL),
    args,
    continuationToken: "conv-1",
    conversationId: "conv-1",
    responses: [{ requestId: "r1", optionId: "approve" }],
  });
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, "conv-1");
  assertEquals(resumes[0].input.inputResponses, [{ requestId: "r1", optionId: "approve" }]);
});

// ---- delivery: message.queued ---------------------------------------------

// A message that arrives while a turn is running is queued, not started; the
// ack is what stops it looking like the message vanished. Teams' primitive is a
// reply Activity on the inbound activity, so the ack threads with the rest.
Deno.test("message.queued posts a one-line acknowledgement as a reply Activity", async () => {
  clearTeamsAccessTokenCache();
  const calls: Array<{ url: string; body?: unknown }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.includes("/oauth2/v2.0/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "cc-token", expires_in: 3600 }), { status: 200 }));
    }
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
  };
  const channel = teamsChannel({
    appId: APP_ID,
    credentials: { appId: APP_ID, appPassword: "secret" },
    api: { fetch: fetchMock },
    jwks: [],
  });

  await channel.events!["message.queued"](
    { text: "also rename the tests" },
    { state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" } },
  );

  assertEquals(calls.length, 1);
  assertStringIncludes(calls[0].url, "/v3/conversations/conv-1/activities/activity-1");
  assertStringIncludes((calls[0].body as { text: string }).text, "queued");
});

Deno.test("message.queued names the closed gate when deniedPendingGate is set", async () => {
  clearTeamsAccessTokenCache();
  const texts: string[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.includes("/oauth2/v2.0/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "cc", expires_in: 3600 }), { status: 200 }));
    }
    texts.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return Promise.resolve(new Response(JSON.stringify({ id: "r" }), { status: 200 }));
  };
  const channel = teamsChannel({
    appId: APP_ID,
    credentials: { appId: APP_ID, appPassword: "secret" },
    api: { fetch: fetchMock },
    jwks: [],
  });

  await channel.events!["message.queued"](
    { text: "yes but explain the chunk count first", deniedPendingGate: true },
    { state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" } },
  );

  assertEquals(texts.length, 1);
  assertEquals(/closed the pending approval|feedback/i.test(texts[0]), true, `expected the deny-ack wording, got: ${texts[0]}`);
});

Deno.test("message.queued is a no-op without a serviceUrl, and swallows a delivery failure", async () => {
  clearTeamsAccessTokenCache();
  let posted = 0;
  const fetchMock: typeof fetch = (input) => {
    const url = String(input);
    if (url.includes("/oauth2/v2.0/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "cc", expires_in: 3600 }), { status: 200 }));
    }
    posted++;
    return Promise.resolve(new Response("boom", { status: 500 }));
  };
  const channel = teamsChannel({
    appId: APP_ID,
    credentials: { appId: APP_ID, appPassword: "secret" },
    api: { fetch: fetchMock },
    jwks: [],
  });

  await channel.events!["message.queued"]({ text: "hi" }, { state: {} });
  assertEquals(posted, 0);

  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await channel.events!["message.queued"](
      { text: "hi" },
      { state: { serviceUrl: SERVICE_URL, conversationId: "conv-1", activityId: "activity-1" } },
    );
  } finally {
    console.warn = origWarn;
  }
  assertEquals(posted, 1);
  assertEquals(logged.some((l) => l.includes("message.queued")), true);
});
