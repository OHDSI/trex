// core/server/agents/gateway/slack.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { createSlackGatewaySigner, SlackGatewayClient } from "./slack.ts";
import type { GatewaySocket } from "./discord.ts";
import { verifySlackSignature } from "../channels/vendor/slack/verify.ts";

class FakeSocket implements GatewaySocket {
  sent: string[] = [];
  closed = false;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close(code = 1000, reason = "") { this.closed = true; this.onclose?.({ code, reason }); }
  emit(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

function makeClient(overrides: Partial<ConstructorParameters<typeof SlackGatewayClient>[0]> = {}) {
  const sockets: FakeSocket[] = [];
  const forwards: { url: string; headers: Headers; body: string }[] = [];
  const signer = createSlackGatewaySigner();
  const client = new SlackGatewayClient({
    appToken: "xapp-test",
    forwardUrl: "http://127.0.0.1:9/base/eve/v1/slack",
    signer,
    gatewayUrl: "wss://fake",
    reconnectBaseMs: 1,
    createSocket: (url) => { const s = new FakeSocket(); sockets.push(s); return s; },
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      forwards.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body ?? "") });
      return new Response("ok", { status: 200 });
    }) as typeof fetch,
    ...overrides,
  });
  return { client, sockets, forwards, signer };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

Deno.test("events_api envelope: acked and forwarded as signed JSON", async () => {
  const { client, sockets, forwards, signer } = makeClient();
  client.start();
  await flush();
  const payload = { type: "event_callback", event: { type: "app_mention", text: "hi" } };
  sockets[0].emit({ envelope_id: "env-1", type: "events_api", payload });
  await flush();
  // ack goes out immediately
  assertEquals(JSON.parse(sockets[0].sent[0]).envelope_id, "env-1");
  // forward carries a valid v0 signature over the exact body
  assertEquals(forwards.length, 1);
  const f = forwards[0];
  assertEquals(f.headers.get("content-type"), "application/json");
  assertEquals(JSON.parse(f.body), payload);
  const okSig = await verifySlackSignature({
    body: f.body,
    signingSecret: signer.secret,
    signature: f.headers.get("x-slack-signature")!,
    timestamp: f.headers.get("x-slack-request-timestamp")!,
  });
  assert(okSig, "forwarded request must verify against the ephemeral secret");
  client.stop();
});

Deno.test("interactive envelope: forwarded form-encoded as payload=<json>", async () => {
  const { client, sockets, forwards } = makeClient();
  client.start();
  await flush();
  const payload = { type: "block_actions", user: { id: "U1" }, actions: [] };
  sockets[0].emit({ envelope_id: "env-2", type: "interactive", payload });
  await flush();
  const f = forwards[0];
  assertEquals(f.headers.get("content-type"), "application/x-www-form-urlencoded");
  const params = new URLSearchParams(f.body);
  assertEquals(JSON.parse(params.get("payload")!), payload);
  client.stop();
});

Deno.test("duplicate envelope_id is acked but not re-forwarded", async () => {
  const { client, sockets, forwards } = makeClient();
  client.start();
  await flush();
  const env = { envelope_id: "dup", type: "events_api", payload: { type: "event_callback" } };
  sockets[0].emit(env);
  sockets[0].emit(env);
  await flush();
  assertEquals(forwards.length, 1);
  assertEquals(sockets[0].sent.length, 2, "both deliveries are acked");
  client.stop();
});

Deno.test("disconnect frame triggers a fresh connection", async () => {
  const { client, sockets } = makeClient();
  client.start();
  await flush();
  sockets[0].emit({ type: "disconnect", reason: "refresh_requested" });
  await flush();
  assert(sockets.length >= 2, "a replacement socket must be opened");
  client.stop();
});

Deno.test("slash_commands envelope is acked and dropped", async () => {
  const { client, sockets, forwards } = makeClient();
  client.start();
  await flush();
  sockets[0].emit({ envelope_id: "env-3", type: "slash_commands", payload: { command: "/x" } });
  await flush();
  assertEquals(forwards.length, 0);
  assertEquals(JSON.parse(sockets[0].sent[0]).envelope_id, "env-3");
  client.stop();
});

Deno.test("forward retries on network error, then gives up after forwardAttempts (parity with the Discord gateway)", async () => {
  let hits = 0;
  const { client, sockets } = makeClient({
    forwardAttempts: 2,
    forwardRetryBaseMs: 1,
    fetch: (async () => {
      hits++;
      throw new Error("connection refused");
    }) as typeof fetch,
  });
  client.start();
  await flush();
  sockets[0].emit({
    envelope_id: "env-r1",
    type: "events_api",
    payload: { type: "event_callback", event: { type: "app_mention", text: "hi" } },
  });
  // Two attempts with 1ms backoff — settle, then assert no further retries.
  await new Promise((r) => setTimeout(r, 30));
  assertEquals(hits, 2, "exactly forwardAttempts attempts, then give up");
  client.stop();
});

Deno.test("forward retries a 5xx and succeeds on the second attempt", async () => {
  let hits = 0;
  const { client, sockets } = makeClient({
    forwardAttempts: 3,
    forwardRetryBaseMs: 1,
    fetch: (async () => {
      hits++;
      return hits === 1 ? new Response("boom", { status: 503 }) : new Response("ok", { status: 200 });
    }) as typeof fetch,
  });
  client.start();
  await flush();
  sockets[0].emit({
    envelope_id: "env-r2",
    type: "events_api",
    payload: { type: "event_callback", event: { type: "app_mention", text: "hi" } },
  });
  await new Promise((r) => setTimeout(r, 30));
  assertEquals(hits, 2, "5xx retried once, success stops the loop");
  client.stop();
});
