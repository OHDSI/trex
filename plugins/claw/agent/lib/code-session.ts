// plugins/claw/agent/lib/code-session.ts
export const CODE_SERVICE = "devx/agents/devx-agent";
export const CODE_BASE = "/plugins/trex/devx-agent";

export interface TokioClient {
  req(url: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<Response>;
}

export interface RunArgs {
  codeSessionId: string | null;
  message: string;
  mode: "plan" | "build";
  userId?: string;
  startCursor: number;
}

interface Event { type: string; data?: Record<string, unknown> }

function headers(userId?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (userId) h["x-user-id"] = userId;
  return h;
}

export async function runCodeTurn(
  client: TokioClient,
  args: RunArgs,
): Promise<{ codeSessionId: string; replyText: string; nextCursor: number }> {
  const body = JSON.stringify({ message: args.message, metadata: { mode: args.mode } });

  // 1) Start (create) or continue the turn.
  let codeSessionId = args.codeSessionId;
  if (!codeSessionId) {
    const res = await client.req(`${CODE_BASE}/eve/v1/session`, { method: "POST", headers: headers(args.userId), body });
    if (!res.ok) throw new Error(`code create failed: ${res.status}`);
    const j = await res.json();
    codeSessionId = j.sessionId as string;
  } else {
    const res = await client.req(`${CODE_BASE}/eve/v1/session/${codeSessionId}`, { method: "POST", headers: headers(args.userId), body });
    if (!res.ok) throw new Error(`code continue failed: ${res.status}`);
  }

  // 2) Stream the turn's events from startCursor until the turn ends.
  const res = await client.req(
    `${CODE_BASE}/eve/v1/session/${codeSessionId}/stream?startIndex=${args.startCursor}`,
    { method: "GET", headers: headers(args.userId) },
  );
  if (!res.ok || !res.body) throw new Error(`code stream failed: ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let read = 0;
  let replyText = "";
  try {
    // deno-lint-ignore no-constant-condition
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
          // Step-1 pre-read (runner.ts:182-184): the assistant text field on
          // message.completed is `message` (data: { turnId, message: text,
          // finishReason }). Kept `text`/`content` as defensive fallbacks
          // for other emitters.
          replyText = String(d.text ?? d.content ?? d.message ?? replyText);
        } else if (ev.type === "turn.failed" || ev.type === "session.failed") {
          throw new Error(`code turn failed: ${String(d.message ?? "unknown")}`);
        } else if (ev.type === "session.waiting" || ev.type === "turn.completed") {
          await reader.cancel();
          return { codeSessionId, replyText, nextCursor: args.startCursor + read };
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return { codeSessionId, replyText, nextCursor: args.startCursor + read };
}
