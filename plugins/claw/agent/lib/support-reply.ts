// plugins/claw/agent/lib/support-reply.ts
// Sends the approved reply back into the d2esupport session (loopback + minted
// token, mirroring d2esupport's claw-session client in the other direction).
import { mintToken } from "./code-stream.ts";

export function supportBase(): string {
  const root = (Deno.env.get("DISCORD_GATEWAY_LOOPBACK_URL")?.trim() || "http://127.0.0.1:33001").replace(/\/+$/, "");
  return `${root}/plugins/trex/d2esupport`;
}

export async function sendApprovedReply(args: {
  supportSessionId: string;
  finalReply: string;
  userId: string;
  fetchImpl?: typeof fetch;
  mint?: (userId: string) => Promise<string>;
}): Promise<void> {
  const f = args.fetchImpl ?? fetch;
  const token = await (args.mint ?? mintToken)(args.userId);
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-user-id": args.userId,
  };
  const res = await f(`${supportBase()}/eve/v1/session/${args.supportSessionId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `APPROVED_REPLY\n${args.finalReply}` }),
  });
  if (!res.ok) throw new Error(`support reply post failed: ${res.status}`);
  await res.body?.cancel();
  // Drain the turn so failures surface here rather than silently in the log.
  const stream = await f(`${supportBase()}/eve/v1/session/${args.supportSessionId}/stream?startIndex=0`, { headers });
  if (!stream.ok || !stream.body) throw new Error(`support reply stream failed: ${stream.status}`);
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as { type: string; data?: Record<string, unknown> };
        if (ev.type === "turn.failed" || ev.type === "session.failed") {
          throw new Error(`support reply turn failed: ${String(ev.data?.message ?? "unknown")}`);
        }
        if (ev.type === "session.waiting" || ev.type === "turn.completed") {
          await reader.cancel();
          return;
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
}
