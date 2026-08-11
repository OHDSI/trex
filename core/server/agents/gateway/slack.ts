// Slack SOCKET MODE (host-side): an outbound WebSocket client that replaces the
// inbound Events/interactivity webhooks, so a deployment without a public URL
// can still drive a Slack-channel agent. Mirrors gateway/discord.ts: runs in the
// MAIN server process and is a pure transport shim in front of the UNCHANGED
// slack channel adapter —
//
//   socket envelope (events_api | interactive)
//     → re-serialize to the exact HTTP shape Slack would POST
//     → sign v0:{ts}:{body} with a boot-time ephemeral signing secret
//     → POST to the agent's local channel route ({base}/eve/v1/<channel>)
//
// TRUST BOUNDARY: the worker's SLACK_SIGNING_SECRET is overridden to the
// ephemeral secret at registration (plugin/agents.ts), so the only principal
// that can pass the adapter's signature-before-send gate is this process. In
// socket mode Slack never POSTs webhooks (no Request URL is configured), so the
// real signing secret is unused and the override loses nothing.
//
// ACK DISCIPLINE: envelopes are acked IMMEDIATELY, before the loopback forward
// — Slack tears down sockets that ack slowly, and a cold worker boot can take
// seconds (the same failure the Discord gateway pre-ACKs around). Slack
// redeliveries (same envelope_id) are deduped via a bounded seen-set.

import { hmacSha256Hex } from "../channels/vendor/slack/shared.ts";
import type { GatewaySocket } from "./discord.ts";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Signs loopback requests the same way Slack signs webhooks (HMAC v0 scheme). */
export interface SlackGatewaySigner {
  /** Ephemeral signing secret — becomes the worker's SLACK_SIGNING_SECRET. */
  secret: string;
  sign(timestamp: string, body: string): Promise<string>;
}

/** Generates the boot-time ephemeral signing secret. Never leaves this process except into the worker env. */
export function createSlackGatewaySigner(): SlackGatewaySigner {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = bytesToHex(bytes);
  return {
    secret,
    async sign(timestamp, body) {
      return `v0=${await hmacSha256Hex(secret, `v0:${timestamp}:${body}`)}`;
    },
  };
}

export interface SlackGatewayClientOptions {
  /** App-level token (xapp-…, scope connections:write) for apps.connections.open. */
  appToken: string;
  /** Local channel route the signed envelope payload is POSTed to. */
  forwardUrl: string;
  signer: SlackGatewaySigner;
  /** Slack Web API base. Default https://slack.com/api. */
  apiBaseUrl?: string;
  /** Skip apps.connections.open discovery (tests / fixed URL). */
  gatewayUrl?: string;
  /** Log prefix, e.g. "@trex/d2esupport/d2esupport". */
  label?: string;
  fetch?: typeof fetch;
  createSocket?: (url: string) => GatewaySocket;
  /** Reconnect backoff base in ms (default 1000; doubled per attempt, capped at 60s). */
  reconnectBaseMs?: number;
  /** Loopback-forward attempts on network error/5xx (default 3). Parity with the Discord gateway. */
  forwardAttempts?: number;
  /** Base backoff between forward attempts in ms (default 500; doubled per attempt). */
  forwardRetryBaseMs?: number;
}

const SEEN_MAX = 512;

export class SlackGatewayClient {
  #opts: SlackGatewayClientOptions;
  #fetch: typeof fetch;
  #createSocket: (url: string) => GatewaySocket;
  #label: string;

  #running = false;
  #socket: GatewaySocket | null = null;
  #reconnectTimer: number | undefined;
  #attempts = 0;
  #seen = new Set<string>();
  #seenOrder: string[] = [];

  constructor(opts: SlackGatewayClientOptions) {
    this.#opts = opts;
    this.#fetch = opts.fetch ?? fetch;
    this.#createSocket = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as GatewaySocket);
    this.#label = opts.label ? `agents/slack-gateway[${opts.label}]` : "agents/slack-gateway";
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    void this.#connect();
  }

  stop(): void {
    this.#running = false;
    clearTimeout(this.#reconnectTimer);
    try {
      this.#socket?.close(1000, "client stop");
    } catch { /* already closed */ }
    this.#socket = null;
  }

  get running(): boolean {
    return this.#running;
  }

  async #wsUrl(): Promise<string> {
    if (this.#opts.gatewayUrl) return this.#opts.gatewayUrl;
    const api = this.#opts.apiBaseUrl ?? "https://slack.com/api";
    const res = await this.#fetch(`${api}/apps.connections.open`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.#opts.appToken}` },
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`apps.connections.open failed: ${res.status}`);
    }
    const j = await res.json() as { ok?: boolean; url?: string; error?: string };
    if (!j.ok || typeof j.url !== "string") {
      throw new Error(`apps.connections.open rejected: ${j.error ?? "no url"}`);
    }
    return j.url;
  }

  async #connect(): Promise<void> {
    if (!this.#running) return;
    let url: string;
    try {
      url = await this.#wsUrl();
    } catch (e) {
      console.warn(`${this.#label}: socket URL discovery failed, retrying:`, e);
      this.#scheduleReconnect();
      return;
    }
    let socket: GatewaySocket;
    try {
      socket = this.#createSocket(url);
    } catch (e) {
      console.warn(`${this.#label}: socket creation failed, retrying:`, e);
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;

    socket.onmessage = (ev) => {
      try {
        this.#handleFrame(JSON.parse(String(ev.data)));
      } catch (e) {
        console.warn(`${this.#label}: malformed socket frame dropped:`, e);
      }
    };
    socket.onerror = () => {
      // onclose always follows onerror; reconnect is handled there.
    };
    socket.onclose = () => {
      if (this.#socket !== socket) return; // superseded by a newer connection
      this.#socket = null;
      if (!this.#running) return;
      console.warn(`${this.#label}: socket closed — reconnecting`);
      this.#scheduleReconnect();
    };
  }

  #scheduleReconnect(): void {
    if (!this.#running) return;
    const base = this.#opts.reconnectBaseMs ?? 1000;
    const delay = Math.min(base * 2 ** this.#attempts, 60_000);
    this.#attempts++;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => void this.#connect(), delay);
  }

  #send(payload: unknown): void {
    try {
      this.#socket?.send(JSON.stringify(payload));
    } catch (e) {
      console.warn(`${this.#label}: socket send failed:`, e);
    }
  }

  #markSeen(id: string): boolean {
    if (this.#seen.has(id)) return false;
    this.#seen.add(id);
    this.#seenOrder.push(id);
    if (this.#seenOrder.length > SEEN_MAX) {
      const oldest = this.#seenOrder.shift()!;
      this.#seen.delete(oldest);
    }
    return true;
  }

  #handleFrame(frame: { type?: string; envelope_id?: string; payload?: unknown; reason?: string }): void {
    if (frame.type === "hello") {
      this.#attempts = 0;
      console.log(`${this.#label}: socket connected`);
      return;
    }
    if (frame.type === "disconnect") {
      // Slack rotates socket URLs; reconnect via a fresh apps.connections.open.
      console.log(`${this.#label}: disconnect requested (${frame.reason ?? "unknown"})`);
      this.#socket?.close(4900, "disconnect requested");
      return;
    }
    if (!frame.envelope_id) return;
    // Ack before forwarding: Slack voids slow acks; a cold worker boot can
    // exceed the window (same rationale as the Discord gateway's pre-ACK).
    this.#send({ envelope_id: frame.envelope_id });
    if (!this.#markSeen(frame.envelope_id)) return;

    if (frame.type === "events_api") {
      void this.#forward(JSON.stringify(frame.payload ?? {}), "application/json")
        .catch((e) => console.error(`${this.#label}: events forward failed:`, e));
    } else if (frame.type === "interactive") {
      const body = `payload=${encodeURIComponent(JSON.stringify(frame.payload ?? {}))}`;
      void this.#forward(body, "application/x-www-form-urlencoded")
        .catch((e) => console.error(`${this.#label}: interactivity forward failed:`, e));
    }
    // slash_commands: acked, intentionally dropped — the adapter has no slash handling.
  }

  // Retries the loopback POST like the Discord gateway's #loopbackPost (#180):
  // the channel route can be down transiently on worker (re)boot (connection
  // refused / 5xx) and previously dropped the envelope outright. Only network
  // errors and 5xx retry — a 4xx (bad signature, malformed) is deterministic.
  // The signature is minted once: retries finish in ~1.5s, well inside the
  // verifier's timestamp window.
  async #forward(body: string, contentType: string): Promise<void> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await this.#opts.signer.sign(timestamp, body);
    const init: RequestInit = {
      method: "POST",
      headers: {
        "content-type": contentType,
        "x-slack-signature": signature,
        "x-slack-request-timestamp": timestamp,
      },
      body,
    };
    const attempts = this.#opts.forwardAttempts ?? 3;
    const base = this.#opts.forwardRetryBaseMs ?? 500;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.#fetch(this.#opts.forwardUrl, init);
        if (res.status < 500) {
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`${this.#label}: channel route rejected envelope (${res.status}): ${text.slice(0, 300)}`);
            return;
          }
          await res.body?.cancel();
          return;
        }
        const text = await res.text().catch(() => "");
        console.warn(`${this.#label}: channel route returned ${res.status} (attempt ${i + 1}/${attempts}): ${text.slice(0, 200)}`);
      } catch (e) {
        console.warn(`${this.#label}: channel route network error (attempt ${i + 1}/${attempts}):`, e);
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, base * 2 ** i));
    }
    console.error(`${this.#label}: channel route unreachable after ${attempts} attempts — envelope dropped`);
  }
}
