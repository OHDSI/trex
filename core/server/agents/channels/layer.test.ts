// Channel layer (Task 4): route dispatch + ChannelRouteArgs + send().
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { createChannelHandler } from "./layer.ts";
import { loadAgent } from "../loader.ts";
import type { LoadedAgent } from "../loader.ts";
import type { ChannelStore } from "./store.ts";
import type { AgentStore } from "../service/store.ts";

const TOY = new URL("../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "/plugins/trex/toy";
const ORIGIN = "http://local";

// Records every resolveOrCreateSession the layer issues so tests can assert on
// the channel-namespaced token + principal without a Postgres.
function fakeChannelStore() {
  const calls: Array<
    { channel: string; token: string; plugin: string; agent: string; principal: unknown; createdBy: string | null }
  > = [];
  let n = 0;
  const store = {
    calls,
    resolveOrCreateSession(
      channel: string,
      token: string,
      plugin: string,
      agent: string,
      principal: unknown,
      createdBy: string | null,
    ) {
      calls.push({ channel, token, plugin, agent, principal, createdBy });
      return Promise.resolve({ sessionId: `sess-${++n}`, created: true });
    },
    setContinuationToken: () => Promise.resolve(),
  };
  return store as unknown as ChannelStore & { calls: typeof calls };
}

const noopStore = { listEvents: () => Promise.resolve([]) } as unknown as AgentStore;

function makeLayer(agent: LoadedAgent) {
  const channelStore = fakeChannelStore();
  const startTurns: Array<{ sessionId: string; message: unknown; metadata: unknown }> = [];
  const started: Array<{ channelId: string; sessionId: string; created: boolean }> = [];
  const handler = createChannelHandler({
    agent,
    store: noopStore,
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    startTurn: (sessionId, message, metadata) => startTurns.push({ sessionId, message, metadata }),
    subscribe: () => () => {},
    onSessionStarted: (info) => started.push({ channelId: info.channelId, sessionId: info.sessionId, created: info.created }),
  });
  return { handler, channelStore, startTurns, started };
}

Deno.test("channel layer: POST to a channel route runs the handler, send() creates a session, returns its Response", async () => {
  const agent = await loadAgent(TOY);
  const { handler, channelStore, startTurns, started } = makeLayer(agent);

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/webhook/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi there", token: "u-42" }),
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { sessionId: "sess-1" });

  // send() namespaced the raw token with the channelId before hitting the store.
  assertEquals(channelStore.calls.length, 1);
  assertEquals(channelStore.calls[0].channel, "webhook");
  assertEquals(channelStore.calls[0].token, "webhook:u-42");
  assertEquals(channelStore.calls[0].plugin, "toy-agent");
  assertEquals(channelStore.calls[0].agent, "toy");
  assertEquals(channelStore.calls[0].principal, null);
  // Webhook channel (no trex auth) => created_by stays null (FIX 1).
  assertEquals(channelStore.calls[0].createdBy, null);

  // The turn was started against the resolved session, and the Task 6 hook fired.
  // The toy webhook passes no delivery state, so metadata.channelId falls back to
  // the registration id "webhook".
  assertEquals(startTurns, [{ sessionId: "sess-1", message: "hi there", metadata: { channelId: "webhook" } }]);
  assertEquals(started, [{ channelId: "webhook", sessionId: "sess-1", created: true }]);
});

Deno.test("channel layer: turn metadata.channelId is the adapter's real delivery channel (state.channelId), not the registration id", async () => {
  // Regression (Discord plan-posting): postPlan/postUpdate/postChoice/postScreenshots
  // read ctx.metadata.channelId as the authoritative Discord post target. The layer
  // must surface the adapter's real thread/channel snowflake (opts.state.channelId),
  // NOT the channel *registration* id (e.g. "discord"/"deliv"), which 404s as a channel.
  const agent = await loadAgent(TOY);
  agent.channels.deliv = {
    __trexChannel: true,
    routes: [{
      method: "POST",
      path: "/in",
      handler: async (req: Request, args: any) => {
        const b = await req.json();
        const s = await args.send(b.message, {
          auth: null,
          continuationToken: b.token,
          state: { channelId: "1529388414531665942" },
        });
        return Response.json({ sessionId: s.id });
      },
    }],
  } as any;
  const { handler, startTurns } = makeLayer(agent);

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/deliv/in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "go", token: "t-1" }),
  }));
  assertEquals(res.status, 200);

  // The turn (→ ctx.metadata for tools + the system-prompt <context> block) carries
  // the real snowflake, not the registration id "deliv".
  assertEquals(startTurns.length, 1);
  assertEquals((startTurns[0].metadata as any).channelId, "1529388414531665942");
});

Deno.test("channel layer: unknown channelId -> 404, no session", async () => {
  const agent = await loadAgent(TOY);
  const { handler, channelStore } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/nope/message`, {
    method: "POST",
    body: JSON.stringify({ message: "x", token: "t" }),
  }));
  assertEquals(res.status, 404);
  assertEquals(channelStore.calls.length, 0);
});

Deno.test("channel layer: unknown route on a known channel -> 404, no session", async () => {
  const agent = await loadAgent(TOY);
  const { handler, channelStore } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/webhook/does-not-exist`, {
    method: "POST",
    body: JSON.stringify({ message: "x", token: "t" }),
  }));
  assertEquals(res.status, 404);
  assertEquals(channelStore.calls.length, 0);
});

Deno.test("channel layer: inherited prototype keys (constructor/__proto__) -> 404, not a 500", async () => {
  const agent = await loadAgent(TOY);
  const { handler, channelStore } = makeLayer(agent);
  // `agent.channels.constructor` is truthy (inherited from Object.prototype) but
  // has no `routes` — a plain index lookup would reach matchRoute and throw an
  // UNAUTHENTICATED TypeError 500. The own-property guard must 404 instead.
  for (const id of ["constructor", "__proto__", "toString"]) {
    const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/${id}/x`, {
      method: "POST",
      body: JSON.stringify({ message: "x", token: "t" }),
    }));
    assertEquals(res.status, 404, `expected 404 for inherited key ${id}`);
  }
  assertEquals(channelStore.calls.length, 0);
});

Deno.test("channel layer: a key whose value is not a branded channel -> 404", async () => {
  const agent = await loadAgent(TOY);
  // An own key that isn't a real channel def (no brand / no routes) must 404,
  // not crash — defense in depth alongside the Object.hasOwn guard.
  (agent.channels as any).bogus = { routes: "nope" };
  const { handler } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/bogus/x`, {
    method: "POST",
    body: JSON.stringify({ message: "x", token: "t" }),
  }));
  assertEquals(res.status, 404);
});

Deno.test("channel layer: wrong method on a known route -> 404", async () => {
  const agent = await loadAgent(TOY);
  const { handler } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/webhook/message`, { method: "GET" }));
  assertEquals(res.status, 404);
});

Deno.test("channel layer: a route that throws before send() surfaces the error and creates no session", async () => {
  const agent = await loadAgent(TOY);
  // Add a channel whose route throws before ever calling send().
  agent.channels.boom = {
    __trexChannel: true,
    routes: [{ method: "POST", path: "/go", handler: () => { throw new Error("boom"); } }],
  } as any;
  const { handler, channelStore, startTurns } = makeLayer(agent);

  await assertRejects(
    () => handler(new Request(`${ORIGIN}${BASE}/eve/v1/boom/go`, { method: "POST" })),
    Error,
    "boom",
  );
  assertEquals(channelStore.calls.length, 0);
  assertEquals(startTurns.length, 0);
});

Deno.test("channel layer: :param segments are matched and exposed on args.params", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.params = {
    __trexChannel: true,
    routes: [{
      method: "GET",
      path: "/thread/:threadId/msg/:msgId",
      handler: (_req: Request, args: any) => Response.json(args.params),
    }],
  } as any;
  const { handler } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/params/thread/abc/msg/99`, { method: "GET" }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { threadId: "abc", msgId: "99" });
});

Deno.test("channel layer: requestIp is derived from x-forwarded-for (else null)", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.ip = {
    __trexChannel: true,
    routes: [{
      method: "GET",
      path: "/whoami",
      handler: (_req: Request, args: any) => Response.json({ ip: args.requestIp }),
    }],
  } as any;
  const { handler } = makeLayer(agent);

  const withXff = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/ip/whoami`, {
    method: "GET",
    headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
  }));
  assertEquals(await withXff.json(), { ip: "203.0.113.7" });

  const noXff = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/ip/whoami`, { method: "GET" }));
  assertEquals(await noXff.json(), { ip: null });
});

Deno.test("channel layer: a channel with events registers background delivery on send() (Task 5, injectable)", async () => {
  const agent = await loadAgent(TOY);
  // A channel whose route calls send() and which declares an events handler —
  // send() must register delivery for it (the toy webhook has no events, so it
  // must NOT register).
  agent.channels.evt = {
    __trexChannel: true,
    events: { "message.completed": () => {} },
    routes: [{
      method: "POST",
      path: "/in",
      handler: async (req: Request, args: any) => {
        const b = await req.json();
        const s = await args.send(b.message, { auth: null, continuationToken: b.token });
        return Response.json({ sessionId: s.id });
      },
    }],
  } as any;

  const channelStore = fakeChannelStore();
  const registered: Array<{ sessionId: string; turnId: string; hasEvents: boolean; sawWaitUntil: boolean }> = [];
  const handler = createChannelHandler({
    agent,
    store: noopStore,
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    // Task 19: startTurn surfaces the created turn id via onTurnCreated; send()
    // uses it to scope this turn's delivery.
    startTurn: (_s, _m, _md, onTurnCreated) => onTurnCreated?.("turn-1"),
    subscribe: () => () => {},
    // Injected: assert send() wired us with the channel + turnId + a waitUntil.
    registerDelivery: (opts) => {
      registered.push({
        sessionId: opts.sessionId,
        turnId: opts.turnId,
        hasEvents: !!opts.channel.events,
        sawWaitUntil: typeof opts.waitUntil === "function",
      });
      // buildChannelCtx must be callable without throwing.
      opts.buildChannelCtx();
    },
    waitUntil: () => {},
  });

  // events channel -> delivery registered, scoped to the created turn.
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/evt/in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi", token: "u-1" }),
  }));
  assertEquals(res.status, 200);
  assertEquals(registered, [{ sessionId: "sess-1", turnId: "turn-1", hasEvents: true, sawWaitUntil: true }]);

  // toy webhook (no events) -> no registration.
  await handler(new Request(`${ORIGIN}${BASE}/eve/v1/webhook/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi", token: "u-2" }),
  }));
  assertEquals(registered.length, 1, "channel without events must not register delivery");
});

Deno.test("channel layer: receive() starts a session on the TARGET channel (default token), not the current one", async () => {
  const agent = await loadAgent(TOY);
  // Target channel B: declares events (so delivery must register) but NO receive
  // hook -> default continuation token = target.channelId, namespaced to B.
  agent.channels.B = {
    __trexChannel: true,
    events: { "message.completed": () => {} },
    routes: [],
  } as any;
  // Current channel A: its route hands off to B via receive() and returns its
  // OWN response (no session on A).
  agent.channels.A = {
    __trexChannel: true,
    routes: [{
      method: "POST",
      path: "/handoff",
      handler: async (_req: Request, args: any) => {
        const s = await args.receive(agent.channels.B, {
          message: "go",
          target: { channelId: "C1" },
          auth: { authenticator: "x", principalType: "user", principalId: "p-1" },
        });
        return Response.json({ handoffTo: s.id, ok: true });
      },
    }],
  } as any;

  const channelStore = fakeChannelStore();
  const startTurns: Array<{ sessionId: string; message: unknown }> = [];
  const started: Array<{ channelId: string; sessionId: string; created: boolean }> = [];
  const registered: Array<{ channelId: string; sessionId: string; hasEvents: boolean; sawWaitUntil: boolean }> = [];
  const handler = createChannelHandler({
    agent,
    store: noopStore,
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    startTurn: (sessionId, message, _md, onTurnCreated) => {
      startTurns.push({ sessionId, message });
      onTurnCreated?.("turn-1");
    },
    subscribe: () => () => {},
    onSessionStarted: (info) => started.push({ channelId: info.channelId, sessionId: info.sessionId, created: info.created }),
    registerDelivery: (opts) => {
      registered.push({
        channelId: (opts.buildChannelCtx() as any).channelCtx.channelId,
        sessionId: opts.sessionId,
        hasEvents: !!opts.channel.events,
        sawWaitUntil: typeof opts.waitUntil === "function",
      });
    },
    waitUntil: () => {},
  });

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/A/handoff`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));

  // A's route response is exactly what A returned.
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { handoffTo: "sess-1", ok: true });

  // Exactly one session, keyed to B (target), with B-namespaced default token.
  assertEquals(channelStore.calls.length, 1);
  assertEquals(channelStore.calls[0].channel, "B");
  assertEquals(channelStore.calls[0].token, "B:C1");
  assertEquals(channelStore.calls[0].principal, {
    authenticator: "x",
    principalType: "user",
    principalId: "p-1",
  });

  // The turn ran against B's session with the hand-off message.
  assertEquals(startTurns, [{ sessionId: "sess-1", message: "go" }]);
  // onSessionStarted reports channel B (target), never A.
  assertEquals(started, [{ channelId: "B", sessionId: "sess-1", created: true }]);
  // Delivery registered for B (it has events), with B's ctx + a waitUntil.
  assertEquals(registered, [{ channelId: "B", sessionId: "sess-1", hasEvents: true, sawWaitUntil: true }]);
});

Deno.test("channel layer: receive() invokes the target channel's receive hook to derive the token + state", async () => {
  const agent = await loadAgent(TOY);
  const seen: unknown[] = [];
  agent.channels.dest = {
    __trexChannel: true,
    // Hook mints a RAW token (runtime namespaces it) + initial state.
    receive: (input: any) => {
      seen.push(input);
      return { continuationToken: `thread-${input.target.channelId}`, state: { opened: true }, title: "Incident" };
    },
    routes: [],
  } as any;
  agent.channels.src = {
    __trexChannel: true,
    routes: [{
      method: "POST",
      path: "/go",
      handler: async (_req: Request, args: any) => {
        const s = await args.receive(agent.channels.dest, {
          message: "page on-call",
          target: { channelId: "ops" },
          auth: null,
        });
        return Response.json({ id: s.id });
      },
    }],
  } as any;

  const channelStore = fakeChannelStore();
  const started: Array<{ channelId: string; state: unknown; title?: string }> = [];
  const handler = createChannelHandler({
    agent,
    store: noopStore,
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    startTurn: () => {},
    subscribe: () => () => {},
    onSessionStarted: (info) => started.push({ channelId: info.channelId, state: info.state, title: info.title }),
  });

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/src/go`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { id: "sess-1" });

  // Hook received the full {message, target, auth} input.
  assertEquals(seen, [{ message: "page on-call", target: { channelId: "ops" }, auth: null }]);
  // Session keyed to dest with the hook's raw token, namespaced.
  assertEquals(channelStore.calls[0].channel, "dest");
  assertEquals(channelStore.calls[0].token, "dest:thread-ops");
  // Hook's state + title propagate through onSessionStarted.
  assertEquals(started, [{ channelId: "dest", state: { opened: true }, title: "Incident" }]);
});

Deno.test("channel layer: receive() with a target that is not a registered channel rejects, no session", async () => {
  const agent = await loadAgent(TOY);
  const stranger = { __trexChannel: true, routes: [] } as any; // never added to agent.channels
  agent.channels.caller = {
    __trexChannel: true,
    routes: [{
      method: "POST",
      path: "/go",
      handler: (_req: Request, args: any) => args.receive(stranger, { message: "x", target: {}, auth: null }),
    }],
  } as any;
  const { handler, channelStore } = makeLayer(agent);

  await assertRejects(
    () => handler(new Request(`${ORIGIN}${BASE}/eve/v1/caller/go`, { method: "POST" })),
    Error,
    "not a registered channel",
  );
  assertEquals(channelStore.calls.length, 0);
});

Deno.test("channel layer: a path outside {basePath}/eve/v1 -> 404", async () => {
  const agent = await loadAgent(TOY);
  const { handler } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}/somewhere/else`, { method: "POST" }));
  assertEquals(res.status, 404);
});

// Task 17/18: channel HITL resume primitive with two addressing modes.
//   MODE A — by request id: getApprovalSession(requestId) → sessionInChannel
//            guard → resolve. (widgets: the callback carries the requestId.)
//   MODE B — by token, single pending: getSessionByToken → getSinglePendingApproval
//            → resolve. (text: the reply carries only a decision.)
// Built with store fakes and driven through the webhook channel's POST /resume seam.
function makeResumeLayer(
  agent: LoadedAgent,
  opts: {
    tokenToSession?: Record<string, string>;
    approvalToSession?: Record<string, string>; // requestId -> sessionId (MODE A)
    sessionsInChannel?: Record<string, string[]>; // channel -> sessionIds (MODE A guard)
    singlePending?: Record<string, string | null>; // sessionId -> requestId | null (MODE B)
    // Task 3: options carried on the pending approval's input, for MODE B's
    // text-matching (matchGateText) — sessionId -> {id,label}[].
    singlePendingOptions?: Record<string, Array<{ id: string; label: string }>>;
  },
) {
  const lookups: Array<{ channel: string; token: string }> = [];
  const resolves: Array<{ requestId: string; decision: string; sessionId: string }> = [];
  const approvalLookups: string[] = [];
  const channelChecks: Array<{ channel: string; sessionId: string }> = [];
  const pendingLookups: string[] = [];
  const channelStore = {
    getSessionByToken(channel: string, token: string) {
      lookups.push({ channel, token });
      return Promise.resolve(opts.tokenToSession?.[token] ?? null);
    },
    sessionInChannel(channel: string, sessionId: string) {
      channelChecks.push({ channel, sessionId });
      return Promise.resolve((opts.sessionsInChannel?.[channel] ?? []).includes(sessionId));
    },
    resolveOrCreateSession: () => Promise.reject(new Error("unused")),
    setContinuationToken: () => Promise.resolve(),
  } as unknown as ChannelStore;
  const store = {
    resolveApproval(requestId: string, decision: "approve" | "deny", sessionId: string) {
      resolves.push({ requestId, decision, sessionId });
      return Promise.resolve(true);
    },
    getApprovalSession(requestId: string) {
      approvalLookups.push(requestId);
      return Promise.resolve(opts.approvalToSession?.[requestId] ?? null);
    },
    getSinglePendingApproval(sessionId: string) {
      pendingLookups.push(sessionId);
      const requestId = opts.singlePending?.[sessionId] ?? null;
      // Task 4: the store's real return shape is {requestId, tool, options?} —
      // the fixture only cares about requestId, so `tool` is a fixed stand-in.
      const options = opts.singlePendingOptions?.[sessionId];
      return Promise.resolve(requestId ? { requestId, tool: "tool", ...(options ? { options } : {}) } : null);
    },
    getApprovalTool: () => Promise.resolve(null),
    setToolConsent: () => Promise.resolve(),
    listEvents: () => Promise.resolve([]),
  } as unknown as AgentStore;
  const handler = createChannelHandler({
    agent,
    store,
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    startTurn: () => {},
    subscribe: () => () => {},
  });
  return { handler, lookups, resolves, approvalLookups, channelChecks, pendingLookups };
}

function resumeRequest(body: unknown): Request {
  return new Request(`${ORIGIN}${BASE}/eve/v1/webhook/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---- MODE A (by request id) -----------------------------------------------

Deno.test("channel resume MODE A: requestId resolves its session (channel-verified) and applies", async () => {
  const agent = await loadAgent(TOY);
  const { handler, lookups, resolves, approvalLookups, channelChecks } = makeResumeLayer(agent, {
    approvalToSession: { "req-1": "sess-9" },
    sessionsInChannel: { webhook: ["sess-9"] },
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { requestId: "req-1", decision: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(approvalLookups, ["req-1"]); // resolved BY REQUEST ID
  assertEquals(channelChecks, [{ channel: "webhook", sessionId: "sess-9" }]); // cross-channel guard ran
  assertEquals(lookups, []); // the token was NOT consulted in MODE A
  assertEquals(resolves, [{ requestId: "req-1", decision: "approve", sessionId: "sess-9" }]);
});

// THE cross-channel guard: an approval whose session belongs to ANOTHER channel
// must NOT be resolvable from this channel's callback.
Deno.test("channel resume MODE A: rejects a request whose session is not in the calling channel", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves, channelChecks } = makeResumeLayer(agent, {
    approvalToSession: { "req-1": "sess-other" },
    sessionsInChannel: { webhook: [] }, // sess-other belongs to a DIFFERENT channel
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { requestId: "req-1", decision: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false });
  assertEquals(channelChecks, [{ channel: "webhook", sessionId: "sess-other" }]);
  assertEquals(resolves, []); // never written (no cross-channel resolve)
});

Deno.test("channel resume MODE A: unknown requestId -> {ok:false}, no resolve", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves, channelChecks } = makeResumeLayer(agent, { approvalToSession: {} });

  const res = await handler(resumeRequest({ token: "u-42", input: { inputResponses: [{ requestId: "ghost", optionId: "approve" }] } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false });
  assertEquals(channelChecks, []); // never reached the guard
  assertEquals(resolves, []);
});

// ---- MODE B (by token, single pending) ------------------------------------

Deno.test("channel resume MODE B: decision-only resolves the session's single pending approval", async () => {
  const agent = await loadAgent(TOY);
  const { handler, lookups, resolves, pendingLookups } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": "req-7" },
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { decision: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(lookups, [{ channel: "webhook", token: "webhook:u-42" }]); // resolved BY TOKEN
  assertEquals(pendingLookups, ["sess-9"]);
  assertEquals(resolves, [{ requestId: "req-7", decision: "approve", sessionId: "sess-9" }]);
});

Deno.test("channel resume MODE B: unknown token -> {ok:false} 'no session for token', no resolve", async () => {
  const agent = await loadAgent(TOY);
  const { handler, lookups, resolves, pendingLookups } = makeResumeLayer(agent, { tokenToSession: {} });

  const res = await handler(resumeRequest({ token: "ghost", input: { decision: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false, error: "no session for token" });
  assertEquals(lookups, [{ channel: "webhook", token: "webhook:ghost" }]);
  assertEquals(pendingLookups, []);
  assertEquals(resolves, []);
});

// Task 3 made discord.ts's tryResolveGate call resume() on EVERY thread
// message, not just ones known to answer a gate — so "no session for token"
// became the ROUTINE case for an ordinary message in a thread with no
// registered session, not an error worth paging on. Must log at a level
// below console.error.
Deno.test("channel resume MODE B: an unknown token logs at warn, not error (routine on every thread message since Task 3)", async () => {
  const agent = await loadAgent(TOY);
  const { handler } = makeResumeLayer(agent, { tokenToSession: {} });

  const errors: unknown[] = [];
  const warns: unknown[] = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => errors.push(args);
  console.warn = (...args: unknown[]) => warns.push(args);
  try {
    await handler(resumeRequest({ token: "ghost", input: { decision: "approve" } }));
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }
  assertEquals(errors.length, 0, `expected no console.error, got: ${JSON.stringify(errors)}`);
  assert(warns.some((w) => String(w).includes("no session for token")));
});

Deno.test("channel resume MODE B: zero/ambiguous pending -> {ok:false} 'no single pending approval'", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves, pendingLookups } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": null }, // zero or >1 pending → null (never guess)
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { decision: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false, error: "no single pending approval" });
  assertEquals(pendingLookups, ["sess-9"]);
  assertEquals(resolves, []);
});

// ---- MODE B, text (Task 3, claw-devx-reliability) --------------------------
// A text-platform reply carries no explicit decision — resume() matches the
// raw text against the pending gate's vocabulary (gate-text.ts's matchGateText)
// itself, using the SAME getSinglePendingApproval it already fetched.

Deno.test("channel resume MODE B text: a bare 'approve' resolves the single pending approval", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves, pendingLookups } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": "req-7" },
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { text: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(pendingLookups, ["sess-9"]);
  assertEquals(resolves, [{ requestId: "req-7", decision: "approve", sessionId: "sess-9" }]);
});

Deno.test("channel resume MODE B text: 'no' resolves as a deny", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": "req-7" },
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { text: "no" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(resolves, [{ requestId: "req-7", decision: "deny", sessionId: "sess-9" }]);
});

Deno.test("channel resume MODE B text: a long qualified sentence does not resolve the gate", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": "req-7" },
  });

  const res = await handler(
    resumeRequest({ token: "u-42", input: { text: "yes but first explain why the chunk count is wrong" } }),
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false, error: "text is not a decision for the pending gate" });
  assertEquals(resolves, [], "an unmatched reply must never write a decision");
});

Deno.test("channel resume MODE B text: no pending approval -> {ok:false}, matcher never consulted", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": null },
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { text: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false, error: "no single pending approval" });
  assertEquals(resolves, []);
});

Deno.test("channel resume MODE B text: an explicit decision wins over text when both are given", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": "req-7" },
  });

  // decision:"deny" is explicit; text ("approve") must NOT override it.
  const res = await handler(resumeRequest({ token: "u-42", input: { decision: "deny", text: "approve" } }));

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(resolves, [{ requestId: "req-7", decision: "deny", sessionId: "sess-9" }]);
});

// Known limitation (see layer.ts's resume() comment): agents.approvals.decision
// is CHECK-constrained to approve/deny, so an "option" match (a postChoice-style
// gate) can never actually be persisted through this path — no authored tool
// populates `options` today, so this is unreachable in practice, but the
// wiring must degrade to a clean {ok:false}, never throw / never miswrite.
Deno.test("channel resume MODE B text: an option match (non-approve/deny id) fails cleanly, never writes", async () => {
  const agent = await loadAgent(TOY);
  const { handler, resolves } = makeResumeLayer(agent, {
    tokenToSession: { "webhook:u-42": "sess-9" },
    singlePending: { "sess-9": "req-7" },
    singlePendingOptions: { "sess-9": [{ id: "none", label: "None — ship it" }] },
  });

  const res = await handler(resumeRequest({ token: "u-42", input: { text: "no checks open pr" } }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, false);
  assertEquals(resolves, []);
});
