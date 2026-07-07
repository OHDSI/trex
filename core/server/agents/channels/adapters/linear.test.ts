// Linear adapter tests. NO live Linear — the GraphQL HTTP is mocked via
// opts.api.fetch, and the Linear-Signature gate runs for REAL (a genuine
// HMAC-SHA256 hex over the raw body, keyed by the webhook secret) alongside the
// webhookTimestamp replay window.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { defaultLinearResume, linearChannel } from "./linear.ts";
import { signLinearWebhookBody } from "../vendor/linear/verify.ts";
import { deriveLinearInputResponse, renderLinearInputRequest } from "../vendor/linear/hitl.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";

const SECRET = "test-webhook-secret";
const ROUTE_URL = "https://worker.example/base/eve/v1/linear";
const BOT_USER = "user-bot-000";

// ---- request helpers -------------------------------------------------------

async function linearRequest(
  payload: Record<string, unknown>,
  opts: { secret?: string; signature?: string; omitSignature?: boolean; delivery?: string; event?: string } = {},
): Promise<Request> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "linear-event": opts.event ?? String(payload.type ?? "Comment"),
    "linear-delivery": opts.delivery ?? "delivery-1",
  };
  if (!opts.omitSignature) {
    headers["linear-signature"] = opts.signature ?? await signLinearWebhookBody(body, opts.secret ?? SECRET);
  }
  return new Request(ROUTE_URL, { method: "POST", headers, body });
}

function commentPayload(over: {
  body?: string;
  issueId?: string;
  authorId?: string;
  commentId?: string;
  action?: string;
  timestamp?: number;
} = {}): Record<string, unknown> {
  return {
    action: over.action ?? "create",
    type: "Comment",
    createdAt: "2026-07-06T00:00:00.000Z",
    data: {
      id: over.commentId ?? "comment-1",
      body: over.body ?? "hey what is the weather",
      issueId: over.issueId ?? "issue-abc",
      userId: over.authorId ?? "user-alice",
      user: { id: over.authorId ?? "user-alice", name: "Alice", displayName: "Alice A" },
      issue: { id: over.issueId ?? "issue-abc", identifier: "ENG-42", title: "an issue", url: "https://linear.app/x/ENG-42" },
    },
    url: "https://linear.app/x/ENG-42#comment-1",
    webhookTimestamp: over.timestamp ?? Date.now(),
    organizationId: "org-1",
  };
}

interface SendCall {
  message: string;
  opts: { auth: ChannelAuth | null; continuationToken: string; state?: unknown; title?: string };
}

function mockArgs(): { args: ChannelRouteArgs; sends: SendCall[]; flush: () => Promise<void> } {
  const sends: SendCall[] = [];
  const pending: Promise<unknown>[] = [];
  const args: ChannelRouteArgs = {
    send(message, opts) {
      sends.push({ message, opts });
      return Promise.resolve({ id: "session-1" });
    },
    getSession: () => null,
    receive: () => Promise.resolve({ id: "session-1" }),
    params: {},
    waitUntil: (p) => {
      pending.push(p);
    },
    requestIp: null,
  };
  return { args, sends, flush: async () => void (await Promise.allSettled(pending)) };
}

// ---- signature + timestamp gate --------------------------------------------

Deno.test("valid Linear-Signature passes the gate → reaches send() + 200 ack", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload()), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 1);
});

Deno.test("bad signature → 401 and zero send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload(), { signature: "deadbeef" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("wrong-secret signature → 401 (mismatch) and zero send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload(), { secret: "other-secret" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("missing signature header → 401 and zero send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload(), { omitSignature: true }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("missing configured webhook secret (fail closed) → 401", async () => {
  const channel = linearChannel({}); // no secret, no env
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload(), { signature: "x" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("stale webhookTimestamp (outside replay window) → 401 and zero send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  // A correctly-SIGNED body but with a timestamp ~5 min in the past.
  const stale = commentPayload({ timestamp: Date.now() - 5 * 60_000 });
  const res = await channel.routes[0].handler(await linearRequest(stale), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

// ---- inbound message -------------------------------------------------------

Deno.test("Comment.create → send() with body + issue-id token + linear auth", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await linearRequest(commentPayload()), args);
  await flush();

  assertEquals(sends.length, 1);
  const call = sends[0];
  assertStringIncludes(call.message, "hey what is the weather");
  assertStringIncludes(call.message, "<linear_context>");
  assertStringIncludes(call.message, "response_medium: linear_comment");
  assertEquals(call.opts.continuationToken, "issue-abc");
  assertEquals(call.opts.auth?.authenticator, "linear-webhook");
  assertEquals(call.opts.auth?.principalId, "linear:user-alice");
  const state = call.opts.state as { issueId?: string };
  assertEquals(state.issueId, "issue-abc");
});

Deno.test("LOOP GUARD: a comment authored by the bot itself → no send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET }, botUserId: BOT_USER });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload({ authorId: BOT_USER })), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("CONFIG-FREE LOOP GUARD: our marker-stamped echo → no send() with NO botUserId", async () => {
  // Linear echoes the bot's own commentCreate back as a Comment.create webhook.
  // With NO LINEAR_BOT_USER_ID set, the hidden marker we stamp on outgoing
  // comments must still drop it.
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const echoed = commentPayload({ body: "my earlier reply\n\n<!-- trex:linear:agent -->" });
  const res = await channel.routes[0].handler(await linearRequest(echoed), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("CONFIG-FREE LOOP GUARD: an app/agent-token-authored comment (botActor, no human) → no send()", async () => {
  // A comment posted with an OAuth agent/app token is attributed via
  // `data.botActor` with `data.user` null. Dropped with NO botUserId configured.
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const payload = {
    action: "create",
    type: "Comment",
    data: {
      id: "comment-app",
      body: "posted by our app token",
      issueId: "issue-abc",
      user: null,
      userId: null,
      botActor: { id: "app-agent-1", name: "trex", type: "app" },
    },
    webhookTimestamp: Date.now(),
    organizationId: "org-1",
  };
  const res = await channel.routes[0].handler(await linearRequest(payload), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("a non-create comment action (update) is ignored → no send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await linearRequest(commentPayload({ action: "update" })), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("Issue.create → send() with title+description body and issue-id token", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const payload = {
    action: "create",
    type: "Issue",
    data: { id: "issue-xyz", identifier: "ENG-9", title: "Fix the bug", description: "it crashes on save", creatorId: "user-bob" },
    webhookTimestamp: Date.now(),
    organizationId: "org-1",
  };
  await channel.routes[0].handler(await linearRequest(payload, { event: "Issue" }), args);
  await flush();

  assertEquals(sends.length, 1);
  assertStringIncludes(sends[0].message, "Fix the bug");
  assertStringIncludes(sends[0].message, "it crashes on save");
  assertEquals(sends[0].opts.continuationToken, "issue-xyz");
});

Deno.test("an unsupported resource type (Reaction) is acked without a send()", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const payload = { action: "create", type: "Reaction", data: { id: "r1" }, webhookTimestamp: Date.now() };
  const res = await channel.routes[0].handler(await linearRequest(payload, { event: "Reaction" }), args);
  assertEquals(res.status, 200);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET }, onCommand: () => ({ auth: null }) });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await linearRequest(commentPayload()), args);
  await flush();
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.auth, null);
});

// ---- delivery: message.completed → commentCreate (API-key auth) ------------

function graphqlFetchMock(calls: Array<{ url: string; auth?: string; body?: unknown }>): typeof fetch {
  return (input, init) => {
    calls.push({
      url: String(input),
      auth: new Headers(init?.headers).get("authorization") ?? undefined,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ data: { commentCreate: { success: true, comment: { id: "c-new" } } } }), { status: 200 }),
    );
  };
}

Deno.test("message.completed → GraphQL commentCreate with the reply + RAW personal API key auth", async () => {
  const calls: Array<{ url: string; auth?: string; body?: unknown }> = [];
  const channel = linearChannel({
    // A personal API key (`lin_api_…`) must be sent RAW — `Bearer lin_api_…` 401s.
    credentials: { webhookSecret: SECRET, accessToken: "lin_api_secret" },
    api: { fetch: graphqlFetchMock(calls) },
  });
  await channel.events!["message.completed"](
    { turnId: "t1", message: "the weather is sunny", finishReason: "stop" },
    { state: { issueId: "issue-abc" } },
  );

  assertEquals(calls.length, 1);
  assertStringIncludes(calls[0].url, "api.linear.app/graphql");
  assertEquals(calls[0].auth, "lin_api_secret"); // RAW — no Bearer scheme.
  const gql = calls[0].body as { query: string; variables: { input: { issueId: string; body: string } } };
  assertStringIncludes(gql.query, "commentCreate");
  assertEquals(gql.variables.input.issueId, "issue-abc");
  assertStringIncludes(gql.variables.input.body, "the weather is sunny");
  // The outgoing comment carries the hidden loop-guard marker.
  assertStringIncludes(gql.variables.input.body, "<!-- trex:linear:agent -->");
});

Deno.test("message.completed → an OAuth agent access token keeps the Bearer scheme", async () => {
  const calls: Array<{ url: string; auth?: string; body?: unknown }> = [];
  const channel = linearChannel({
    // A non-`lin_api_` token is an OAuth agent access token → `Bearer <token>`.
    credentials: { webhookSecret: SECRET, accessToken: "oauth_agent_token_xyz" },
    api: { fetch: graphqlFetchMock(calls) },
  });
  await channel.events!["message.completed"](
    { turnId: "t1", message: "hi", finishReason: "stop" },
    { state: { issueId: "issue-abc" } },
  );
  assertEquals(calls.length, 1);
  assertEquals(calls[0].auth, "Bearer oauth_agent_token_xyz");
});

Deno.test("message.completed splits a >64000-char reply into multiple commentCreate calls", async () => {
  const comments: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    const gql = JSON.parse(String(init?.body)) as { variables: { input: { body: string } } };
    comments.push(gql.variables.input.body);
    return Promise.resolve(
      new Response(JSON.stringify({ data: { commentCreate: { success: true, comment: { id: "c" } } } }), { status: 200 }),
    );
  };
  const channel = linearChannel({
    credentials: { webhookSecret: SECRET, accessToken: "lin_api_x" },
    api: { fetch: fetchMock },
  });
  const long = "A".repeat(63500) + "\n" + "B".repeat(2000); // > 64000 → 2 chunks
  await channel.events!["message.completed"]({ turnId: "t1", message: long, finishReason: "stop" }, { state: { issueId: "issue-1" } });

  assertEquals(comments.length, 2);
  assertEquals(comments[0].startsWith("A"), true);
  assertEquals(comments[1].startsWith("B"), true);
  assertEquals(comments[0].length <= 64_000, true);
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const channel = linearChannel({ credentials: { webhookSecret: SECRET, accessToken: "x" }, api: { fetch: fetchMock } });
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, { state: { issueId: "i1" } });
  assertEquals(called, 0);
});

// ---- delivery: input.requested → reply-instructions comment ----------------

Deno.test("input.requested renders a reply-instructions comment via commentCreate", async () => {
  const comments: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    const gql = JSON.parse(String(init?.body)) as { variables: { input: { body: string } } };
    comments.push(gql.variables.input.body);
    return Promise.resolve(
      new Response(JSON.stringify({ data: { commentCreate: { success: true, comment: { id: "c" } } } }), { status: 200 }),
    );
  };
  const channel = linearChannel({
    credentials: { webhookSecret: SECRET, accessToken: "x" },
    api: { fetch: fetchMock },
  });
  const requestId = crypto.randomUUID();
  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId, action: { kind: "tool-call", toolName: "delete_file", input: {} } }] },
    { state: { issueId: "issue-abc" } },
  );

  assertEquals(comments.length, 1);
  assertStringIncludes(comments[0], "delete_file");
  assertStringIncludes(comments[0], "/approve");
  assertStringIncludes(comments[0], "/deny");
});

// ---- HITL text mapping (helpers) ------------------------------------------

Deno.test("deriveLinearInputResponse maps a slash / number / keyword reply back to its option", () => {
  const requestId = crypto.randomUUID();
  const request = {
    requestId,
    prompt: "Approve delete_file?",
    display: "confirmation" as const,
    options: [{ id: "approve", label: "Approve" }, { id: "deny", label: "Deny" }],
  };
  assertStringIncludes(renderLinearInputRequest(request), "/approve");
  assertEquals(deriveLinearInputResponse("/approve", request), { requestId, optionId: "approve" });
  assertEquals(deriveLinearInputResponse("2", request), { requestId, optionId: "deny" });
  assertEquals(deriveLinearInputResponse("deny", request), { requestId, optionId: "deny" });
  assertEquals(deriveLinearInputResponse("9", request), null);
});

// ---- HITL resume ----------------------------------------------------------

Deno.test("reply-shaped comment + opts.resume → resume called with issue-id token, no send()", async () => {
  const resumeCalls: Array<{ continuationToken: string; body: string }> = [];
  const channel = linearChannel({
    credentials: { webhookSecret: SECRET },
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, body: ctx.body });
    },
  });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await linearRequest(commentPayload({ body: "/approve" })), args);
  await flush();

  assertEquals(sends.length, 0); // routed to resume, not a fresh turn
  assertEquals(resumeCalls.length, 1);
  assertEquals(resumeCalls[0].continuationToken, "issue-abc");
  assertEquals(resumeCalls[0].body, "/approve");
});

Deno.test("reply-shaped comment with NO opts.resume → treated as a normal message (not dropped)", async () => {
  const channel = linearChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await linearRequest(commentPayload({ body: "/approve" })), args);
  await flush();
  assertEquals(sends.length, 1);
  assertStringIncludes(sends[0].message, "/approve");
});

Deno.test("default resume is a loud no-op: warns, does NOT POST a resume route", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
  const origFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = () => {
    fetched++;
    return Promise.resolve(new Response("{}"));
  };
  try {
    defaultLinearResume({
      req: new Request(ROUTE_URL),
      args: mockArgs().args,
      continuationToken: "issue-abc",
      issueId: "issue-abc",
      body: "/approve",
    });
  } finally {
    console.warn = origWarn;
    globalThis.fetch = origFetch;
  }
  assertEquals(warnings.some((w) => w.includes("no opts.resume provided")), true);
  assertEquals(fetched, 0);
});
