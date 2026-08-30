// plugins/claw/agent/lib/code-session.ts
export const CODE_SERVICE = "devx/agents/devx-agent";
// Absolute base: the request rides the intra-cluster Trex.req channel, where the
// listener rebuilds it via `new Request(url)` — which rejects a bare path. Routing
// is keyed on CODE_SERVICE, and the receiving handler anchors on url.pathname, so
// the placeholder host is inert; only an absolute URL clears the Request ctor.
export const CODE_BASE = "http://localhost/plugins/trex/devx-agent";

export interface TokioClient {
  req(url: string, init: { method: string; headers?: Record<string, string>; body?: string }): Promise<Response>;
}

export interface RunArgs {
  codeSessionId: string | null;
  message: string;
  userId?: string;
  startCursor: number;
  /** devx app (devx.apps.id) the Code session works in; sent as metadata.appId on EVERY turn. */
  appId?: string | null;
  // Channel attachments relayed verbatim (metadata only, name/url/contentType)
  // — same shape as code-stream.ts's CodeTurnArgs.attachments. devx's
  // readMetadata/materializeAttachments on the receiving end expect exactly
  // this shape; the devx side downloads them into the coder's workspace.
  attachments?: Array<{ name: string; url: string; contentType?: string }>;
  // Invoked on a timer while the event stream is open, independent of events
  // arriving — a long silent tool run (build/test) must not read as dead. See
  // code-stream.ts's HEARTBEAT_MS for why this exists (#238).
  onHeartbeat?: () => void;
  // Bounds the event stream so a hung upstream cannot wedge the caller
  // forever — see code-stream.ts's TURN_TIMEOUT_MS. Defaults to the same value.
  timeoutMs?: number;
}

// Same cadence as code-stream.ts's HEARTBEAT_MS: a Discord thread wants a sign
// of life every few minutes, not sooner.
const HEARTBEAT_MS = 300_000;

// Same bound as code-stream.ts's TURN_TIMEOUT_MS: generous, but finite, so a
// hung stream doesn't wedge the caller until an external reaper intervenes.
const DEFAULT_TIMEOUT_MS = 90 * 60_000;

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
  // No `metadata.mode`: an unset mode means the Code agent's readMode() returns
  // undefined, which its filterTools treats as "allow ALL tools" (devx
  // agent.ts:193-194). That is the ONLY mode in which the coder's superpowers
  // skills + subagents are available — its "plan" mode strips the skill/agent
  // tools (PLAN_MODE_TOOLS), and "build" mode strips every tool. So claw always
  // talks to the coder with the full toolset and lets it run its own gated
  // planning/implementation process.
  //
  // metadata.appId scopes the coder to a devx app: its buildInstructions loads
  // that app's project rules and its tools run in the app workspace. Metadata
  // is read per TURN (handler.ts's addTurn), so it rides every request, not
  // just session create.
  //
  // attachments key omitted entirely (not sent as []) when there are none —
  // matches code-stream.ts's `...(attachments?.length ? { attachments } : {})`.
  const metadata = {
    ...(args.appId ? { appId: args.appId } : {}),
    ...(args.attachments?.length ? { attachments: args.attachments } : {}),
  };
  const body = JSON.stringify({
    message: args.message,
    ...(Object.keys(metadata).length ? { metadata } : {}),
  });

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
  // Timer-driven, not event-driven: a long tool run (build/test) produces no
  // events for minutes, which is exactly the stretch worth reporting on.
  const beat = args.onHeartbeat
    ? setInterval(args.onHeartbeat, HEARTBEAT_MS)
    : undefined;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => { /* already closed */ });
  }, timeoutMs);
  try {
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (timedOut) throw new Error(`code stream timed out after ${timeoutMs}ms`);
        break;
      }
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
    // Cleared on every exit path — including the throw paths above — so
    // neither timer outlives the stream it measures/bounds.
    if (beat !== undefined) clearInterval(beat);
    clearTimeout(timeout);
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return { codeSessionId, replyText, nextCursor: args.startCursor + read };
}
