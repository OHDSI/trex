// plugins/claw/agent/lib/support-reply.ts
// Sends the approved reply back into the d2esupport session (loopback + minted
// token, mirroring d2esupport's claw-session client in the other direction).
import { mintToken } from "./code-stream.ts";

export function supportBase(): string {
  const root = (Deno.env.get("SLACK_GATEWAY_LOOPBACK_URL")?.trim() ||
    Deno.env.get("DISCORD_GATEWAY_LOOPBACK_URL")?.trim() ||
    "http://127.0.0.1:33001").replace(/\/+$/, "");
  return `${root}/plugins/trex/d2esupport`;
}

// Counts the events /stream would replay right now. `replayOnly=1` makes the
// service return exactly the persisted history and then close — no live
// tail — so reading it to completion gives a deterministic count (unlike
// "read the live stream until it stalls", which never reliably signals
// "no more history").
async function countReplayedEvents(f: typeof fetch, url: string, headers: Record<string, string>): Promise<number> {
  const res = await f(url, { headers });
  if (!res.ok || !res.body) throw new Error(`support reply replay count failed: ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) count++;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return count;
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

  // claw never saw this d2esupport session's history (unlike our own claw
  // session, where forwardToClaw.ts persists a cursor across calls), so we
  // can't carry a saved cursor in. /stream replays ALL persisted steps, and
  // a past turn's finish/error step replays as turn.completed/turn.failed
  // — draining from startIndex=0 below would return a stale ack (or throw
  // on an old failure) instead of observing THIS reply's turn. Take a
  // first-pass count of what's already there so the live drain can start
  // exactly at our own turn. Note: a turn racing in on this session between
  // this count and the POST below would still be missed — acceptable here
  // since only claw drives this session's follow-ups.
  const pastCount = await countReplayedEvents(
    f,
    `${supportBase()}/eve/v1/session/${args.supportSessionId}/stream?startIndex=0&replayOnly=1`,
    headers,
  );

  const res = await f(`${supportBase()}/eve/v1/session/${args.supportSessionId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `APPROVED_REPLY\n${args.finalReply}` }),
  });
  if (!res.ok) throw new Error(`support reply post failed: ${res.status}`);
  await res.body?.cancel();
  // Drain the turn so failures surface here rather than silently in the log.
  const stream = await f(`${supportBase()}/eve/v1/session/${args.supportSessionId}/stream?startIndex=${pastCount}`, { headers });
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
