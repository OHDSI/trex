// Channel layer (Task 4): route dispatch + ChannelRouteArgs + send().
// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertRejects } from "jsr:@std/assert";
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
  const calls: Array<{ channel: string; token: string; plugin: string; agent: string; principal: unknown }> = [];
  let n = 0;
  const store = {
    calls,
    resolveOrCreateSession(channel: string, token: string, plugin: string, agent: string, principal: unknown) {
      calls.push({ channel, token, plugin, agent, principal });
      return Promise.resolve({ sessionId: `sess-${++n}`, created: true });
    },
    getSessionByToken: () => Promise.resolve(null),
    setContinuationToken: () => Promise.resolve(),
  };
  return store as unknown as ChannelStore & { calls: typeof calls };
}

const noopStore = { listEvents: () => Promise.resolve([]) } as unknown as AgentStore;

function makeLayer(agent: LoadedAgent) {
  const channelStore = fakeChannelStore();
  const startTurns: Array<{ sessionId: string; message: unknown }> = [];
  const started: Array<{ channelId: string; sessionId: string; created: boolean }> = [];
  const handler = createChannelHandler({
    agent,
    store: noopStore,
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    startTurn: (sessionId, message) => startTurns.push({ sessionId, message }),
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

  // The turn was started against the resolved session, and the Task 6 hook fired.
  assertEquals(startTurns, [{ sessionId: "sess-1", message: "hi there" }]);
  assertEquals(started, [{ channelId: "webhook", sessionId: "sess-1", created: true }]);
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

Deno.test("channel layer: a path outside {basePath}/eve/v1 -> 404", async () => {
  const agent = await loadAgent(TOY);
  const { handler } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}/somewhere/else`, { method: "POST" }));
  assertEquals(res.status, 404);
});
