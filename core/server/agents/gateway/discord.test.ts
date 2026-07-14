// Discord gateway-mode client tests. NO live Discord and NO live worker — the
// WebSocket is a scripted fake and both HTTP legs (loopback channel route +
// interaction callback) are captured through an injected fetch. The signature
// leg is verified with the SAME vendored WebCrypto verify the channel adapter
// runs, so a signer/verify drift would fail here, not in production.

import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { createGatewaySigner, DiscordGatewayClient, gatewayModeEnabled, type GatewaySocket } from "./discord.ts";
import { verifyDiscordSignature } from "../channels/vendor/discord/verify.ts";

// ---- fakes -----------------------------------------------------------------

class FakeSocket implements GatewaySocket {
  sent: Array<Record<string, unknown>> = [];
  closedWith: { code?: number; reason?: string } | null = null;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string): void {
    if (this.closedWith) return;
    this.closedWith = { code, reason };
    this.onclose?.({ code: code ?? 1000, reason });
  }
  // test drivers
  emit(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  serverClose(code: number, reason = ""): void {
    if (this.closedWith) return;
    this.closedWith = { code, reason };
    this.onclose?.({ code, reason });
  }
  lastSent(): Record<string, unknown> | undefined {
    return this.sent[this.sent.length - 1];
  }
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function fakeFetch(respond: (req: CapturedRequest) => Response) {
  const calls: CapturedRequest[] = [];
  const fn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const req: CapturedRequest = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : "",
    };
    calls.push(req);
    return respond(req);
  }) as typeof fetch;
  return { fn, calls };
}

// Waits until `cond` holds (async forwarding legs land on later microtasks/timers).
async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function makeClient(opts: {
  respond?: (req: CapturedRequest) => Response;
  signer: Awaited<ReturnType<typeof createGatewaySigner>>;
  gatewayUrl?: string;
}) {
  const sockets: FakeSocket[] = [];
  const { fn, calls } = fakeFetch(opts.respond ?? (() => Response.json({ type: 5 })));
  const client = new DiscordGatewayClient({
    botToken: "bot-token-1",
    forwardUrl: "http://127.0.0.1:8001/plugins/trex/claw/eve/v1/discord",
    signer: opts.signer,
    apiBaseUrl: "https://discord.test/api/v10",
    gatewayUrl: opts.gatewayUrl ?? "wss://gateway.test",
    fetch: fn,
    reconnectBaseMs: 1,
    createSocket: (url) => {
      const s = new FakeSocket();
      (s as FakeSocket & { url?: string }).url = url;
      sockets.push(s);
      return s;
    },
  });
  return { client, sockets, calls };
}

// ---- protocol --------------------------------------------------------------

Deno.test("gateway: HELLO → IDENTIFY with token and 0 intents, then heartbeats with last seq", async () => {
  const signer = await createGatewaySigner();
  const { client, sockets } = makeClient({ signer });
  client.start();
  await until(() => sockets.length === 1);
  const s = sockets[0];

  s.emit({ op: 10, d: { heartbeat_interval: 15 } });
  assertEquals(s.sent[0].op, 2);
  const d = s.sent[0].d as { token: string; intents: number; properties: Record<string, string> };
  assertEquals(d.token, "bot-token-1");
  assertEquals(d.intents, 0);
  assertExists(d.properties);

  // seq updates ride any frame; the next heartbeat must echo it. ACK each
  // beat so the zombie detector stays quiet.
  s.emit({ op: 0, t: "READY", s: 7, d: { session_id: "sess-1", resume_gateway_url: "wss://resume.test" } });
  await until(() => s.sent.some((m) => m.op === 1));
  const beat = s.sent.find((m) => m.op === 1)!;
  assertEquals(beat.d, 7);
  s.emit({ op: 11 });

  client.stop();
});

Deno.test("gateway: op 1 heartbeat request is answered immediately", async () => {
  const signer = await createGatewaySigner();
  const { client, sockets } = makeClient({ signer });
  client.start();
  await until(() => sockets.length === 1);
  const s = sockets[0];
  s.emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  s.emit({ op: 0, t: "READY", s: 3, d: { session_id: "x", resume_gateway_url: "wss://r.test" } });
  s.emit({ op: 1 });
  assertEquals(s.lastSent(), { op: 1, d: 3 });
  client.stop();
});

// ---- interaction forwarding -------------------------------------------------

Deno.test("gateway: INTERACTION_CREATE → signed loopback POST → callback with the route's body", async () => {
  const signer = await createGatewaySigner();
  const { fn, calls } = fakeFetch((req) => {
    if (req.url.endsWith("/eve/v1/discord")) return Response.json({ type: 5, data: { flags: 64 } });
    return new Response(null, { status: 204 });
  });
  const sockets: FakeSocket[] = [];
  const client = new DiscordGatewayClient({
    botToken: "t",
    forwardUrl: "http://127.0.0.1:8001/plugins/trex/claw/eve/v1/discord",
    signer,
    apiBaseUrl: "https://discord.test/api/v10",
    gatewayUrl: "wss://gateway.test",
    fetch: fn,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });
  client.start();
  await until(() => sockets.length === 1);
  const s = sockets[0];
  s.emit({ op: 10, d: { heartbeat_interval: 60_000 } });

  const interaction = {
    id: "inter-1",
    token: "inter-token",
    type: 2,
    channel_id: "chan-1",
    data: { name: "claw" },
    member: { user: { id: "user-1", username: "peter" } },
  };
  s.emit({ op: 0, t: "INTERACTION_CREATE", s: 1, d: interaction });
  await until(() => calls.length === 2);

  // Leg 1: the loopback POST, signed exactly like a Discord webhook — verified
  // with the vendored WebCrypto verify the adapter itself runs.
  const loop = calls[0];
  assertEquals(loop.method, "POST");
  assertEquals(loop.url, "http://127.0.0.1:8001/plugins/trex/claw/eve/v1/discord");
  assertEquals(JSON.parse(loop.body), interaction);
  const ok = await verifyDiscordSignature({
    body: loop.body,
    publicKey: signer.publicKeyHex,
    signature: loop.headers["x-signature-ed25519"],
    timestamp: loop.headers["x-signature-timestamp"],
  });
  assert(ok, "loopback signature must verify against the signer public key");

  // Leg 2: the route's response body forwarded verbatim to the REST callback.
  const cb = calls[1];
  assertEquals(cb.method, "POST");
  assertEquals(cb.url, "https://discord.test/api/v10/interactions/inter-1/inter-token/callback");
  assertEquals(JSON.parse(cb.body), { type: 5, data: { flags: 64 } });

  client.stop();
});

Deno.test("gateway: a rejected loopback POST (401) sends NO callback", async () => {
  const signer = await createGatewaySigner();
  const { fn, calls } = fakeFetch((req) => {
    if (req.url.endsWith("/eve/v1/discord")) return new Response("unauthorized", { status: 401 });
    return new Response(null, { status: 204 });
  });
  const sockets: FakeSocket[] = [];
  const client = new DiscordGatewayClient({
    botToken: "t",
    forwardUrl: "http://local/eve/v1/discord",
    signer,
    apiBaseUrl: "https://discord.test/api/v10",
    gatewayUrl: "wss://gateway.test",
    fetch: fn,
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });
  client.start();
  await until(() => sockets.length === 1);
  sockets[0].emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  sockets[0].emit({ op: 0, t: "INTERACTION_CREATE", s: 1, d: { id: "i", token: "tok" } });
  await until(() => calls.length === 1);
  // Give a would-be second leg a chance to (wrongly) fire.
  await new Promise((r) => setTimeout(r, 30));
  assertEquals(calls.length, 1);
  client.stop();
});

// ---- reconnect / resume ------------------------------------------------------

Deno.test("gateway: op 7 RECONNECT → new connection RESUMEs with session id and seq", async () => {
  const signer = await createGatewaySigner();
  const { client, sockets } = makeClient({ signer });
  client.start();
  await until(() => sockets.length === 1);
  const s1 = sockets[0];
  s1.emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  s1.emit({ op: 0, t: "READY", s: 11, d: { session_id: "sess-9", resume_gateway_url: "wss://resume.test" } });

  s1.emit({ op: 7 });
  await until(() => sockets.length === 2);
  const s2 = sockets[1];
  assert(String((s2 as FakeSocket & { url?: string }).url).startsWith("wss://resume.test"));
  s2.emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  assertEquals(s2.sent[0], { op: 6, d: { token: "bot-token-1", session_id: "sess-9", seq: 11 } });
  client.stop();
});

Deno.test("gateway: INVALID_SESSION (d=false) drops the session and re-IDENTIFYs", async () => {
  const signer = await createGatewaySigner();
  const { client, sockets } = makeClient({ signer });
  client.start();
  await until(() => sockets.length === 1);
  const s1 = sockets[0];
  s1.emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  s1.emit({ op: 0, t: "READY", s: 2, d: { session_id: "sess", resume_gateway_url: "wss://resume.test" } });
  s1.emit({ op: 9, d: false });
  await until(() => sockets.length === 2);
  const s2 = sockets[1];
  s2.emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  assertEquals(s2.sent[0].op, 2, "must IDENTIFY, not RESUME, after an unresumable session");
  client.stop();
});

Deno.test("gateway: fatal close code 4004 stops the client (no reconnect)", async () => {
  const signer = await createGatewaySigner();
  const { client, sockets } = makeClient({ signer });
  client.start();
  await until(() => sockets.length === 1);
  sockets[0].emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  sockets[0].serverClose(4004, "Authentication failed.");
  await new Promise((r) => setTimeout(r, 30));
  assertEquals(sockets.length, 1, "no reconnect after a fatal close");
  assertEquals(client.running, false);
});

Deno.test("gateway: non-fatal close reconnects with backoff", async () => {
  const signer = await createGatewaySigner();
  const { client, sockets } = makeClient({ signer });
  client.start();
  await until(() => sockets.length === 1);
  sockets[0].emit({ op: 10, d: { heartbeat_interval: 60_000 } });
  sockets[0].serverClose(1006, "abnormal");
  await until(() => sockets.length === 2);
  client.stop();
});

Deno.test("gateway: discovers the URL via GET /gateway/bot when none is configured", async () => {
  const signer = await createGatewaySigner();
  const { fn, calls } = fakeFetch((req) => {
    if (req.url.endsWith("/gateway/bot")) return Response.json({ url: "wss://discovered.test" });
    return new Response(null, { status: 204 });
  });
  const sockets: Array<FakeSocket & { url?: string }> = [];
  const client = new DiscordGatewayClient({
    botToken: "bot-token-2",
    forwardUrl: "http://local/eve/v1/discord",
    signer,
    apiBaseUrl: "https://discord.test/api/v10",
    fetch: fn,
    createSocket: (url) => {
      const s = new FakeSocket() as FakeSocket & { url?: string };
      s.url = url;
      sockets.push(s);
      return s;
    },
  });
  client.start();
  await until(() => sockets.length === 1);
  assertEquals(calls[0].url, "https://discord.test/api/v10/gateway/bot");
  assertEquals(calls[0].headers["authorization"], "Bot bot-token-2");
  assert(sockets[0].url!.startsWith("wss://discovered.test"));
  client.stop();
});

// ---- switch parsing ----------------------------------------------------------

Deno.test("gatewayModeEnabled accepts 1/true/gateway/yes/on and rejects the rest", () => {
  for (const v of ["1", "true", "TRUE", "gateway", "yes", "on"]) assert(gatewayModeEnabled(v), v);
  for (const v of [undefined, "", "0", "false", "webhook", "off"]) assert(!gatewayModeEnabled(v), String(v));
});
