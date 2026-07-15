// Discord GATEWAY mode (host-side): an outbound WebSocket client that replaces
// the inbound interactions webhook, so a deployment without a public URL can
// still drive a Discord-channel agent. Discord routes interactions to the
// gateway whenever no Interactions Endpoint URL is configured in the developer
// portal — same bot, same token, same interaction payloads; only the transport
// direction changes.
//
// This module runs in the MAIN server process (it is deliberately NOT in the
// worker staging list in plugin/agents.ts — a worker isolate can be reclaimed
// and cannot hold a persistent socket). It is a pure transport shim in front
// of the UNCHANGED discord channel adapter:
//
//   gateway INTERACTION_CREATE
//     → sign(timestamp + body) with a boot-time ephemeral Ed25519 keypair
//     → POST to the agent's local channel route ({base}/eve/v1/<channel>)
//     → forward the route's response body (an interaction-callback payload:
//       deferred ACK / message / modal) to POST /interactions/{id}/{token}/callback
//
// TRUST BOUNDARY: the channel route still runs signature-before-send — the
// worker's DISCORD_PUBLIC_KEY is overridden to the ephemeral PUBLIC key at
// registration (plugin/agents.ts), so the only principal that can reach
// send() is the holder of the ephemeral PRIVATE key: this process. In gateway
// mode Discord never POSTs webhooks (no endpoint URL is registered), so the
// real application public key is unused and the override loses nothing.

import { hexToBytes } from "../channels/vendor/discord/shared.ts";

const te = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Signs loopback requests the same way Discord signs webhooks (Ed25519 over timestamp+body). */
export interface DiscordGatewaySigner {
  publicKeyHex: string;
  sign(timestamp: string, body: string): Promise<string>;
}

/** Generates the boot-time ephemeral keypair. The private key never leaves this process. */
export async function createGatewaySigner(): Promise<DiscordGatewaySigner> {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicKeyHex = bytesToHex(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  return {
    publicKeyHex,
    async sign(timestamp, body) {
      const sig = await crypto.subtle.sign("Ed25519", kp.privateKey, te.encode(`${timestamp}${body}`));
      return bytesToHex(new Uint8Array(sig));
    },
  };
}

// Minimal socket surface (native WebSocket satisfies it; tests inject a fake).
export interface GatewaySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

// Close codes after which reconnecting can never succeed (bad token, bad
// intents, …) — the client stops and logs instead of hammering Discord.
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export interface DiscordGatewayClientOptions {
  botToken: string;
  /** Local channel route the signed interaction is POSTed to. */
  forwardUrl: string;
  signer: DiscordGatewaySigner;
  /** Discord REST base. Default https://discord.com/api/v10. */
  apiBaseUrl?: string;
  /** Skip GET /gateway/bot discovery (tests / fixed URL). */
  gatewayUrl?: string;
  /** Gateway intents. Interactions need none — default 0. */
  intents?: number;
  /** Log prefix, e.g. "@trex/claw/claw". */
  label?: string;
  fetch?: typeof fetch;
  createSocket?: (url: string) => GatewaySocket;
  /** Reconnect backoff base in ms (default 1000; doubled per attempt, capped at 60s). */
  reconnectBaseMs?: number;
}

export class DiscordGatewayClient {
  #opts: DiscordGatewayClientOptions;
  #fetch: typeof fetch;
  #createSocket: (url: string) => GatewaySocket;
  #label: string;

  #running = false;
  #socket: GatewaySocket | null = null;
  #heartbeatTimer: number | undefined;
  #reconnectTimer: number | undefined;
  #heartbeatAcked = true;
  #seq: number | null = null;
  #sessionId: string | null = null;
  #resumeUrl: string | null = null;
  #attempts = 0;

  constructor(opts: DiscordGatewayClientOptions) {
    this.#opts = opts;
    this.#fetch = opts.fetch ?? fetch;
    this.#createSocket = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as GatewaySocket);
    this.#label = opts.label ? `agents/discord-gateway[${opts.label}]` : "agents/discord-gateway";
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    void this.#connect();
  }

  stop(): void {
    this.#running = false;
    clearTimeout(this.#reconnectTimer);
    clearInterval(this.#heartbeatTimer);
    try {
      this.#socket?.close(1000, "client stop");
    } catch { /* already closed */ }
    this.#socket = null;
  }

  get running(): boolean {
    return this.#running;
  }

  async #gatewayUrl(): Promise<string> {
    if (this.#opts.gatewayUrl) return this.#opts.gatewayUrl;
    const api = this.#opts.apiBaseUrl ?? "https://discord.com/api/v10";
    const res = await this.#fetch(`${api}/gateway/bot`, {
      headers: { authorization: `Bot ${this.#opts.botToken}` },
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`GET /gateway/bot failed: ${res.status}`);
    }
    const { url } = await res.json() as { url: string };
    return url;
  }

  async #connect(): Promise<void> {
    if (!this.#running) return;
    let url: string;
    const resuming = !!(this.#sessionId && this.#resumeUrl);
    try {
      url = resuming ? this.#resumeUrl! : await this.#gatewayUrl();
    } catch (e) {
      console.warn(`${this.#label}: gateway URL discovery failed, retrying:`, e);
      this.#scheduleReconnect();
      return;
    }
    const full = url.includes("?") ? url : `${url}/?v=10&encoding=json`;
    let socket: GatewaySocket;
    try {
      socket = this.#createSocket(full);
    } catch (e) {
      console.warn(`${this.#label}: socket creation failed, retrying:`, e);
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    this.#heartbeatAcked = true;

    socket.onmessage = (ev) => {
      try {
        this.#handleMessage(JSON.parse(String(ev.data)));
      } catch (e) {
        console.warn(`${this.#label}: malformed gateway frame dropped:`, e);
      }
    };
    socket.onerror = () => {
      // onclose always follows onerror; reconnect is handled there.
    };
    socket.onclose = (ev) => {
      clearInterval(this.#heartbeatTimer);
      if (this.#socket !== socket) return; // superseded by a newer connection
      this.#socket = null;
      if (!this.#running) return;
      if (FATAL_CLOSE_CODES.has(ev.code)) {
        console.error(`${this.#label}: gateway closed with fatal code ${ev.code} (${ev.reason ?? ""}) — giving up. Check the bot token / intents.`);
        this.#running = false;
        return;
      }
      console.warn(`${this.#label}: gateway closed (code ${ev.code}) — reconnecting`);
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
      console.warn(`${this.#label}: gateway send failed:`, e);
    }
  }

  #handleMessage(msg: { op: number; d?: unknown; s?: number | null; t?: string | null }): void {
    if (typeof msg.s === "number") this.#seq = msg.s;
    switch (msg.op) {
      case OP.HELLO: {
        const interval = (msg.d as { heartbeat_interval?: number })?.heartbeat_interval ?? 41_250;
        this.#startHeartbeat(interval);
        if (this.#sessionId && this.#resumeUrl) {
          this.#send({ op: OP.RESUME, d: { token: this.#opts.botToken, session_id: this.#sessionId, seq: this.#seq } });
        } else {
          this.#send({
            op: OP.IDENTIFY,
            d: {
              token: this.#opts.botToken,
              intents: this.#opts.intents ?? 0,
              properties: { os: "linux", browser: "trex", device: "trex" },
            },
          });
        }
        break;
      }
      case OP.HEARTBEAT:
        this.#send({ op: OP.HEARTBEAT, d: this.#seq });
        break;
      case OP.HEARTBEAT_ACK:
        this.#heartbeatAcked = true;
        break;
      case OP.RECONNECT:
        // Discord asks us to resume on a fresh connection.
        this.#socket?.close(4900, "reconnect requested");
        break;
      case OP.INVALID_SESSION:
        // d=true → session is resumable; d=false → identify from scratch.
        if (msg.d !== true) {
          this.#sessionId = null;
          this.#resumeUrl = null;
        }
        this.#socket?.close(4901, "invalid session");
        break;
      case OP.DISPATCH:
        this.#handleDispatch(msg.t ?? "", msg.d);
        break;
      default:
        break;
    }
  }

  #startHeartbeat(intervalMs: number): void {
    clearInterval(this.#heartbeatTimer);
    this.#heartbeatAcked = true;
    this.#heartbeatTimer = setInterval(() => {
      if (!this.#heartbeatAcked) {
        // Zombie connection: the last heartbeat was never ACKed. Close and
        // resume — per the gateway docs, close with a non-1000 code.
        console.warn(`${this.#label}: heartbeat not ACKed — closing zombie connection`);
        this.#socket?.close(4902, "heartbeat timeout");
        return;
      }
      this.#heartbeatAcked = false;
      this.#send({ op: OP.HEARTBEAT, d: this.#seq });
    }, intervalMs);
  }

  #handleDispatch(t: string, d: unknown): void {
    switch (t) {
      case "READY": {
        const ready = d as { session_id?: string; resume_gateway_url?: string };
        this.#sessionId = ready?.session_id ?? null;
        this.#resumeUrl = ready?.resume_gateway_url ?? null;
        this.#attempts = 0;
        console.log(`${this.#label}: gateway READY (session ${this.#sessionId})`);
        break;
      }
      case "RESUMED":
        this.#attempts = 0;
        console.log(`${this.#label}: gateway session resumed`);
        break;
      case "INTERACTION_CREATE":
        void this.#forwardInteraction(d).catch((e) => {
          console.error(`${this.#label}: interaction forwarding failed:`, e);
        });
        break;
      default:
        break;
    }
  }

  // The gateway INTERACTION_CREATE `d` payload is byte-for-byte the same
  // interaction object Discord would POST to a webhook endpoint, so the
  // channel route parses it unchanged; only the ACK travels differently
  // (REST callback instead of the HTTP response).
  async #forwardInteraction(d: unknown): Promise<void> {
    const interaction = d as { id?: string; token?: string };
    if (!interaction?.id || !interaction?.token) {
      console.warn(`${this.#label}: interaction without id/token dropped`);
      return;
    }
    const body = JSON.stringify(d);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await this.#opts.signer.sign(timestamp, body);
    const res = await this.#fetch(this.#opts.forwardUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`${this.#label}: channel route rejected interaction (${res.status}): ${text.slice(0, 300)}`);
      return;
    }
    let callback: unknown;
    try {
      callback = await res.json();
    } catch {
      console.error(`${this.#label}: channel route returned a non-JSON body — no callback sent`);
      return;
    }
    const api = this.#opts.apiBaseUrl ?? "https://discord.com/api/v10";
    const cb = await this.#fetch(`${api}/interactions/${interaction.id}/${interaction.token}/callback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(callback),
    });
    if (!cb.ok) {
      const text = await cb.text().catch(() => "");
      console.error(`${this.#label}: interaction callback failed (${cb.status}): ${text.slice(0, 300)}`);
    } else {
      await cb.body?.cancel();
    }
  }
}

/** Truthiness of the DISCORD_GATEWAY switch ("1"/"true"/"gateway", case-insensitive). */
export function gatewayModeEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "gateway", "yes", "on"].includes(value.trim().toLowerCase());
}

// hexToBytes is re-exported so the wiring/tests don't reach into vendor paths.
export { hexToBytes };
