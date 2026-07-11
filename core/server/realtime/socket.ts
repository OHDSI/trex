import { WebSocketServer, type WebSocket } from "ws";
import { verifyAccessToken, type AccessTokenClaims } from "../auth/jwt.ts";
import { decodeFrame, encodeFrame, reply, type PhoenixMessage } from "./protocol.ts";
import type { Channel } from "./channel.ts";

const HEARTBEAT_TIMEOUT_MS = 90_000;

export class RealtimeSocket {
  id = crypto.randomUUID();
  channels = new Map<string, Channel>(); // key: topic
  lastSeen = Date.now();
  constructor(private ws: WebSocket, public claims: AccessTokenClaims) {}
  send(msg: PhoenixMessage): void {
    if (this.ws.readyState !== 1) return;
    // Slow-client guard: kill rather than buffer unboundedly (spec: no backpressure into WAL pipeline)
    if (this.ws.bufferedAmount > 4 * 1024 * 1024) { this.close(1008, "too slow"); return; }
    this.ws.send(encodeFrame(msg));
  }
  close(code = 1000, reason = ""): void { try { this.ws.close(code, reason); } catch { /* already closed */ } }
}

export const sockets = new Set<RealtimeSocket>();

type ChannelEventHandler = (sock: RealtimeSocket, msg: PhoenixMessage) => Promise<void>;
const handlers = new Map<string, ChannelEventHandler>();
export function registerChannelEventHandler(event: string, fn: ChannelEventHandler): void {
  handlers.set(event, fn);
}

const wss = new WebSocketServer({ noServer: true });

/** Returns true if the upgrade was consumed. Wire into server.on("upgrade") in Task 11. */
export function handleUpgrade(req: any, socket: any, head: any, wsPath: string): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== wsPath) return false;
  const token = url.searchParams.get("apikey") ?? url.searchParams.get("token") ?? "";
  const reject = () => {
    try {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
    } catch { /* socket already gone */ }
  };
  verifyAccessToken(token)
    .then((claims) => {
      // Fail closed: no claims (invalid/expired token) rejects the upgrade.
      if (!claims) {
        reject();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => onConnection(ws, claims));
    })
    // Fail closed: any throw (e.g. key-derivation failure) also rejects, never crashes.
    .catch(reject);
  return true;
}

function onConnection(ws: WebSocket, claims: AccessTokenClaims): void {
  const sock = new RealtimeSocket(ws, claims);
  sockets.add(sock);
  const idleTimer = setInterval(() => {
    if (Date.now() - sock.lastSeen > HEARTBEAT_TIMEOUT_MS) sock.close(1001, "heartbeat timeout");
  }, 30_000);
  ws.on("message", (data: unknown) => void onMessage(sock, String(data)));
  ws.on("close", () => {
    clearInterval(idleTimer);
    sockets.delete(sock);
    for (const ch of sock.channels.values()) ch.teardown(); // Channel.teardown defined in Task 4
  });
  ws.on("error", () => sock.close());
}

async function onMessage(sock: RealtimeSocket, raw: string): Promise<void> {
  sock.lastSeen = Date.now();
  const msg = decodeFrame(raw);
  if (!msg) return;
  if (msg.topic === "phoenix" && msg.event === "heartbeat") {
    sock.send(reply(msg, "ok", {}));
    return;
  }
  if (msg.event === "access_token") {
    // Fail closed: verifyAccessToken can throw (e.g. key-derivation failure);
    // treat a throw exactly like an invalid token so it never escapes the
    // uncaught `void onMessage(...)` call and crashes the process.
    let claims: AccessTokenClaims | null = null;
    try {
      claims = await verifyAccessToken(msg.payload?.access_token ?? "");
    } catch {
      claims = null;
    }
    if (!claims) {
      sock.send({ topic: msg.topic, event: "system", ref: null,
        payload: { status: "error", extension: "system", message: "invalid or expired access token" } });
      sock.channels.get(msg.topic)?.teardown();
      return;
    }
    sock.claims = claims;
    return;
  }
  const h = handlers.get(msg.event);
  if (h) await h(sock, msg);
}
