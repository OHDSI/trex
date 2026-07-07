// Task 7: the eve (web) channel adapter + an authored `custom` channel, both
// driven end-to-end through the channel layer (createChannelHandler). The eve
// adapter is a THIN wrapper — it owns no session/streaming logic, it only
// delegates to the layer's send()/getSession(). These tests prove the wrapper's
// two routes work and that an authored custom channel (needing no adapter) also
// drives a turn through the same layer.
// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { createChannelHandler } from "../layer.ts";
import { eveChannel } from "./eve.ts";
import { loadAgent } from "../../loader.ts";
import type { LoadedAgent } from "../../loader.ts";
import type { ChannelStore } from "../store.ts";
import type { AgentStore } from "../../service/store.ts";

const TOY = new URL("../../testdata/toy-agent/agent", import.meta.url).pathname;
const BASE = "/plugins/trex/toy";
const ORIGIN = "http://local";

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

// A store whose listEvents replays a persisted step and whose getSession backs
// the eve stream route's existence-404. `known` is the set of session ids that
// getSession resolves to a row (anything else => null, i.e. unknown session).
function fakeStore(rows: unknown[] = [], known: string[] = ["sess-1"]) {
  return {
    listEvents: () => Promise.resolve(rows),
    getSession: (id: string) => Promise.resolve(known.includes(id) ? { id, status: "active", created_by: null } : null),
  } as unknown as AgentStore;
}

type Harness = ReturnType<typeof makeLayer>;
function makeLayer(agent: LoadedAgent, opts?: { store?: AgentStore; subscribe?: (id: string, fn: (e: any) => void) => () => void }) {
  const channelStore = fakeChannelStore();
  const startTurns: Array<{ sessionId: string; message: unknown }> = [];
  const handler = createChannelHandler({
    agent,
    store: opts?.store ?? fakeStore(),
    channelStore,
    plugin: "toy-agent",
    agentName: "toy",
    basePath: BASE,
    startTurn: (sessionId, message) => startTurns.push({ sessionId, message }),
    subscribe: opts?.subscribe ?? (() => () => {}),
  });
  return { handler, channelStore, startTurns };
}

Deno.test("eve channel: POST /session creates a session, starts a turn, returns sessionId + continuationToken", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.eve = eveChannel();
  const { handler, channelStore, startTurns }: Harness = makeLayer(agent);

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/eve/session`, {
    method: "POST",
    // x-user-id is injected by the proxy from the verified trex JWT — the eve
    // adapter must attribute the session to that principal, not null.
    headers: { "content-type": "application/json", "x-user-id": "user-abc" },
    body: JSON.stringify({ message: "hello web", continuationToken: "web-123" }),
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sessionId, "sess-1");
  assertEquals(body.continuationToken, "web-123");
  assertEquals(res.headers.get("x-eve-session-id"), "sess-1");

  // Delegated straight to the layer's send(): one namespaced session, one turn.
  assertEquals(channelStore.calls.length, 1);
  assertEquals(channelStore.calls[0].channel, "eve");
  assertEquals(channelStore.calls[0].token, "eve:web-123");
  // The authenticated trex principal (from x-user-id) is threaded into send().
  assertEquals(channelStore.calls[0].principal, {
    authenticator: "trex",
    principalType: "user",
    principalId: "user-abc",
  });
  // …and the trex user id also lands in created_by so the native
  // approval-ownership check protects this eve-web session (FIX 1).
  assertEquals(channelStore.calls[0].createdBy, "user-abc");
  assertEquals(startTurns, [{ sessionId: "sess-1", message: "hello web" }]);
});

Deno.test("eve channel: POST /session with no x-user-id attributes the session to null (anonymous)", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.eve = eveChannel();
  const { handler, channelStore } = makeLayer(agent);
  await handler(new Request(`${ORIGIN}${BASE}/eve/v1/eve/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "anon", continuationToken: "t" }),
  }));
  assertEquals(channelStore.calls[0].principal, null);
  // No trex user => created_by null too (anonymous eve-web session).
  assertEquals(channelStore.calls[0].createdBy, null);
});

Deno.test("eve channel: POST /session without a continuationToken mints one (fresh session per call)", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.eve = eveChannel();
  const { handler, channelStore } = makeLayer(agent);

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/eve/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "no token" }),
  }));
  assertEquals(res.status, 200);
  const body = await res.json();
  // A token was minted and echoed back, then namespaced into the session key.
  assertEquals(typeof body.continuationToken, "string");
  assertEquals(body.continuationToken.length > 0, true);
  assertEquals(channelStore.calls[0].token, `eve:${body.continuationToken}`);
});

Deno.test("eve channel: GET /session/:id/stream returns NDJSON (replay + live) via getSession", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.eve = eveChannel();

  // One persisted step to replay, plus a live event pushed on subscribe.
  const replayRow = { turn_id: "t1", kind: "text", name: null, payload: { text: "replayed" } };
  const subs: Array<(e: any) => void> = [];
  const { handler } = makeLayer(agent, {
    store: fakeStore([replayRow]),
    subscribe: (_id, fn) => {
      subs.push(fn);
      return () => {};
    },
  });

  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/eve/session/sess-1/stream`, { method: "GET" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/x-ndjson");

  // Push a live event; the stream buffers-then-flushes it after replay.
  for (const fn of subs) fn({ type: "message.completed", data: { turnId: "t1", message: "live" } });
  // Close the underlying subscription-driven stream by cancelling upstream:
  // read what has been enqueued so far, then cancel.
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  // Read a couple of chunks (replay line, then the live line).
  for (let i = 0; i < 2; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  await reader.cancel();

  assertStringIncludes(out, '"message.completed"');
  assertStringIncludes(out, "replayed");
  assertStringIncludes(out, "live");
});

Deno.test("eve channel: GET /session/:id/stream with a genuinely-unknown session id -> 404 (not empty 200)", async () => {
  const agent = await loadAgent(TOY);
  agent.channels.eve = eveChannel();
  // The store knows only "sess-1"; a request for an unknown id must 404 via the
  // real layer path (getSession(...).exists() store round-trip), matching native
  // /stream — NOT stream an empty 200.
  const { handler } = makeLayer(agent, { store: fakeStore([], ["sess-1"]) });

  const unknown = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/eve/session/does-not-exist/stream`, { method: "GET" }));
  assertEquals(unknown.status, 404);
  assertEquals((await unknown.json()).error, "session not found");

  // A known session still streams (200 NDJSON).
  const known = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/eve/session/sess-1/stream`, { method: "GET" }));
  assertEquals(known.status, 200);
  assertEquals(known.headers.get("content-type"), "application/x-ndjson");
  await known.body?.cancel();
});

Deno.test("custom authored channel: an author's own defineChannel route drives a turn end-to-end through the layer", async () => {
  // The toy agent ships a `custom-hook` channel fixture (channels/custom-hook.ts)
  // that is NOT an adapter — it is authored directly with defineChannel and its
  // own bespoke route contract, proving the layer serves authored custom channels
  // with no adapter code.
  const agent = await loadAgent(TOY);
  assertEquals(agent.channels["custom-hook"]?.__trexChannel, true);

  const { handler, channelStore, startTurns } = makeLayer(agent);
  const res = await handler(new Request(`${ORIGIN}${BASE}/eve/v1/custom-hook/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "custom payload", ref: "ticket-7" }),
  }));

  assertEquals(res.status, 202);
  const body = await res.json();
  assertEquals(body.accepted, true);
  assertEquals(body.session, "sess-1");

  // The authored route's bespoke mapping (text -> message, ref -> token) drove a
  // real turn through the layer's send().
  assertEquals(channelStore.calls.length, 1);
  assertEquals(channelStore.calls[0].channel, "custom-hook");
  assertEquals(channelStore.calls[0].token, "custom-hook:ticket-7");
  assertEquals(startTurns, [{ sessionId: "sess-1", message: "custom payload" }]);
});
