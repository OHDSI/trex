// Talks to claw's eve session surface over a loopback fetch with a minted user
// token (the pattern proven by claw's own code-session/code-stream pair; plain
// fetch because a claw support turn runs for minutes — investigation included —
// which the inter-service channel's 30s buffer cannot carry).
import { loopbackRoot, mintToken } from "./devx-api.ts";

export function clawBase(): string {
  return `${loopbackRoot()}/plugins/trex/claw`;
}

export interface ClawTurnArgs {
  clawSessionId: string | null;
  message: string;
  userId: string;
  // Position in the claw session's event stream to resume from (mirrors
  // claw's own code-session.ts). /stream replays ALL persisted steps, and a
  // past turn's finish/error step replays as turn.completed/turn.failed —
  // starting at 0 on a follow-up turn would return the PREVIOUS turn's ack
  // instantly (or throw on an old failure) instead of observing this one.
  startCursor: number;
  fetchImpl?: typeof fetch;
  mint?: (userId: string) => Promise<string>;
}

interface Event { type: string; data?: Record<string, unknown> }

// Thrown on turn.failed/session.failed so the caller can persist the cursor
// PAST the failed turn (and the session id, if freshly created) instead of
// the stale cursor from before this turn started — otherwise a retry replays
// this same failure forever instead of ever reaching the next turn.
export class ClawTurnError extends Error {
  nextCursor: number;
  clawSessionId: string;
  constructor(message: string, nextCursor: number, clawSessionId: string) {
    super(message);
    this.name = "ClawTurnError";
    this.nextCursor = nextCursor;
    this.clawSessionId = clawSessionId;
  }
}

export async function runClawTurn(
  args: ClawTurnArgs,
): Promise<{ clawSessionId: string; replyText: string; nextCursor: number }> {
  const f = args.fetchImpl ?? fetch;
  const token = await (args.mint ?? mintToken)(args.userId);
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-user-id": args.userId,
  };
  const body = JSON.stringify({ message: args.message });

  let clawSessionId = args.clawSessionId;
  if (!clawSessionId) {
    const res = await f(`${clawBase()}/eve/v1/session`, { method: "POST", headers, body });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`claw session create failed: ${res.status}`);
    }
    const j = await res.json();
    clawSessionId = j.sessionId as string;
  } else {
    const res = await f(`${clawBase()}/eve/v1/session/${clawSessionId}`, { method: "POST", headers, body });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`claw session continue failed: ${res.status}`);
    }
    await res.body?.cancel();
  }

  const res = await f(`${clawBase()}/eve/v1/session/${clawSessionId}/stream?startIndex=${args.startCursor}`, { headers });
  if (!res.ok || !res.body) throw new Error(`claw stream failed: ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let read = 0;
  let replyText = "";
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
        read++;
        const ev = JSON.parse(line) as Event;
        const d = (ev.data ?? {}) as Record<string, unknown>;
        if (ev.type === "message.completed") {
          replyText = String(d.message ?? d.text ?? d.content ?? replyText);
        } else if (ev.type === "turn.failed" || ev.type === "session.failed") {
          throw new ClawTurnError(
            `claw turn failed: ${String(d.message ?? "unknown")}`,
            args.startCursor + read,
            clawSessionId,
          );
        } else if (ev.type === "session.waiting" || ev.type === "turn.completed") {
          await reader.cancel();
          return { clawSessionId, replyText, nextCursor: args.startCursor + read };
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return { clawSessionId, replyText, nextCursor: args.startCursor + read };
}
