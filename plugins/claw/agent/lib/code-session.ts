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

// Event kinds the server can REPLAY, i.e. the ones `startIndex` counts. Derived
// from handler.ts's stepToEvent, which is the only mapping from a persisted
// `agents.steps` row back onto the wire vocabulary: tool-call/client-tool-call →
// actions.requested, tool-result → action.result, text → message.completed,
// finish → turn.completed, error → turn.failed, custom → tool.event. Each is
// emitted live 1:1 with the step it persists (runner.ts emits one action per
// actions.requested and persists exactly one row), so counting these — and only
// these — keeps our cursor equal to the server's index.
// Everything else on the wire is live-only and MUST NOT be counted:
// turn.started, message.appended, input.requested, session.waiting,
// session.failed, message.queued.
const REPLAYABLE = new Set([
  "actions.requested",
  "action.result",
  "message.completed",
  "turn.completed",
  "turn.failed",
  "tool.event",
]);

// One tool call the coder has parked on, waiting for a human. Mirrors
// core/server/agents/service/events.ts's InputRequestItem, flattened: the wire
// shape is { requestId, action: { kind, callId, toolName, input } } and only
// requestId/toolName/input are actionable here.
export interface PendingApproval {
  requestId: string;
  toolName: string;
  input: unknown;
}

// Why the event stream stopped. ONLY "input-requested" means the turn is still
// running — parked on a human decision, resumable via resolveCodeApproval +
// reattachCodeTurn. Every other reason means the turn is over.
export type TurnEnd = "completed" | "waiting" | "input-requested" | "stream-ended";

export interface TurnResult {
  codeSessionId: string;
  replyText: string;
  nextCursor: number;
  reason: TurnEnd;
  /** Non-empty only when reason is "input-requested". */
  pending: PendingApproval[];
}

interface StreamArgs {
  codeSessionId: string;
  startCursor: number;
  userId?: string;
  onHeartbeat?: () => void;
  timeoutMs?: number;
}

function parseRequests(value: unknown): PendingApproval[] {
  if (!Array.isArray(value)) return [];
  const out: PendingApproval[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as { requestId?: unknown; action?: { toolName?: unknown; input?: unknown } };
    if (typeof item.requestId !== "string" || !item.requestId) continue;
    out.push({
      requestId: item.requestId,
      toolName: typeof item.action?.toolName === "string" ? item.action.toolName : "unknown",
      input: item.action?.input,
    });
  }
  return out;
}

function headers(userId?: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (userId) h["x-user-id"] = userId;
  return h;
}

// Ask directly whether a gate is pending (handler.ts's additive, read-only
// GET /pending-approval) instead of relying on `input.requested` arriving on
// a live stream — that event has no stepToEvent mapping (never persisted or
// replayed), so a stream that attaches after it was published sees nothing
// and would otherwise block until the turn's timeout. A plain DB read, so it
// is exact regardless of subscribe timing. Best-effort: a failed query must
// not fail the turn — it just means we fall back to reading the stream.
async function getPendingApproval(
  client: TokioClient,
  args: { codeSessionId: string; userId?: string },
): Promise<PendingApproval | null> {
  try {
    const res = await client.req(
      `${CODE_BASE}/eve/v1/session/${args.codeSessionId}/pending-approval`,
      { method: "GET", headers: headers(args.userId) },
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { pending?: { requestId: string; tool: string } | null } | null;
    const p = body?.pending;
    // The route mirrors getSinglePendingApproval's shape (requestId/tool), not
    // toolset.ts's input.requested wire shape — no raw tool-call `input` to
    // preview here; coder-approval.ts's renderer already handles that (falls
    // back to "No arguments.").
    return p ? { requestId: p.requestId, toolName: p.tool, input: undefined } : null;
  } catch (e) {
    console.error(`claw: pending-approval query failed for session ${args.codeSessionId} (falling back to the stream):`, e);
    return null;
  }
}

export async function runCodeTurn(
  client: TokioClient,
  args: RunArgs,
): Promise<TurnResult> {
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
  const turnBody = {
    message: args.message,
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
  const body = JSON.stringify(turnBody);
  // Session-create only (handler.ts reads it once, at createSession, and never
  // from per-turn metadata): claw WATCHES this coder session and relays its
  // gates to the channel — postApprovalGates posts them, resolveCoderApproval
  // carries the answer back — so an approver really is reachable even though
  // the session is neither channel-bound nor unattended. Without this the hard
  // escalate tier reads it as unapprovable and the ship step's `git push` is
  // denied outright instead of asked. See approval-policy.ts.
  const createBody = JSON.stringify({ ...turnBody, approverReachable: true });

  // 1) Start (create) or continue the turn.
  let codeSessionId = args.codeSessionId;
  if (!codeSessionId) {
    const res = await client.req(`${CODE_BASE}/eve/v1/session`, { method: "POST", headers: headers(args.userId), body: createBody });
    if (!res.ok) throw new Error(`code create failed: ${res.status}`);
    const j = await res.json();
    codeSessionId = j.sessionId as string;
  } else {
    const res = await client.req(`${CODE_BASE}/eve/v1/session/${codeSessionId}`, { method: "POST", headers: headers(args.userId), body });
    if (!res.ok) throw new Error(`code continue failed: ${res.status}`);
  }

  // 2) Stream the turn's events from startCursor until the turn ends. Safe to
  // attach AFTER the message here: everything a turn does before we attach is
  // persisted, so the replay carries it (an approval gate is the one thing that
  // is not — see resolveCoderApproval.ts, which attaches first).
  return await streamTurn(client, {
    codeSessionId,
    startCursor: args.startCursor,
    userId: args.userId,
    onHeartbeat: args.onHeartbeat,
    timeoutMs: args.timeoutMs,
  });
}

// Re-attach to a turn already in flight — used after a parked approval is
// resolved, to collect the REST of that turn. Sending a fresh message instead
// would start a SECOND turn on top of the parked one.
export function reattachCodeTurn(client: TokioClient, args: StreamArgs): Promise<TurnResult> {
  return streamTurn(client, args);
}

// Resolve one parked approval (handler.ts's additive
// POST /eve/v1/session/:id/approval). A refusal is a normal outcome — an
// expired or already-decided request 4xxs — so this reports it instead of
// throwing; only the caller knows whether to re-ask the channel.
export async function resolveCodeApproval(
  client: TokioClient,
  args: { codeSessionId: string; requestId: string; decision: "approve" | "deny"; userId?: string },
): Promise<{ resolved: boolean; error?: string }> {
  const res = await client.req(`${CODE_BASE}/eve/v1/session/${args.codeSessionId}/approval`, {
    method: "POST",
    headers: headers(args.userId),
    body: JSON.stringify({ requestId: args.requestId, decision: args.decision }),
  });
  if (res.ok) return { resolved: true };
  const detail = await res.json().catch(() => ({}));
  const message = (detail as { error?: unknown }).error;
  return { resolved: false, error: `${res.status}: ${typeof message === "string" ? message : "approval not resolved"}` };
}

// A stream that is already SUBSCRIBED but not yet consumed. The split exists so
// a caller can subscribe BEFORE doing the thing that produces the events it
// needs — handler.ts's stream route subscribes to the live tail before it
// replays (handler.ts:1678-1723), so an attach that has returned cannot miss
// what happens next.
export interface AttachedStream {
  /** Read until the turn ends or parks on a human. */
  collect(): Promise<TurnResult>;
  cancel(): Promise<void>;
}

export async function attachCodeStream(client: TokioClient, args: StreamArgs): Promise<AttachedStream> {
  // startIndex counts the session's persisted events and so does nextCursor
  // (see REPLAYABLE) — a re-attach resumes exactly where the last one stopped,
  // replaying nothing it has already seen and skipping nothing it has not.
  const res = await client.req(
    `${CODE_BASE}/eve/v1/session/${args.codeSessionId}/stream?startIndex=${args.startCursor}`,
    { method: "GET", headers: headers(args.userId) },
  );
  if (!res.ok || !res.body) throw new Error(`code stream failed: ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  return {
    collect: () => consumeStream(client, reader, args),
    cancel: async () => {
      try { await reader.cancel(); } catch { /* already closed */ }
    },
  };
}

async function streamTurn(client: TokioClient, args: StreamArgs): Promise<TurnResult> {
  const attached = await attachCodeStream(client, args);
  return await attached.collect();
}

// Wraps a would-be terminal return in a pending-approval query first: if a
// gate is pending, that's the real outcome regardless of what the stream did
// or didn't show (a query is exact; the stream is not, for a live-only event
// — see getPendingApproval). Used both before this attach's first read (a gate
// published before we subscribed is otherwise invisible and would block until
// timeoutMs) and at the stream-ended fallback (a connection that closed with
// no terminal event is ambiguous the same way).
async function resultOrPendingGate(
  client: TokioClient,
  args: StreamArgs,
  cursor: number,
  replyText: string,
  fallback: TurnResult,
): Promise<TurnResult> {
  const pending = await getPendingApproval(client, { codeSessionId: args.codeSessionId, userId: args.userId });
  return pending
    ? { codeSessionId: args.codeSessionId, replyText, nextCursor: cursor, reason: "input-requested", pending: [pending] }
    : fallback;
}

async function consumeStream(
  client: TokioClient,
  reader: ReadableStreamDefaultReader<string>,
  args: StreamArgs,
): Promise<TurnResult> {
  const codeSessionId = args.codeSessionId;
  // A gate published before this attach subscribed is live-only (no
  // stepToEvent mapping) and so is invisible to both replay and the live tail
  // — ask the approvals table directly before ever blocking on a read that
  // may never come (see getPendingApproval).
  const early = await resultOrPendingGate(client, args, args.startCursor, "", {
    codeSessionId, replyText: "", nextCursor: args.startCursor, reason: "stream-ended", pending: [],
  });
  if (early.reason === "input-requested") {
    try { await reader.cancel(); } catch { /* already closed */ }
    return early;
  }
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
        const ev = JSON.parse(line) as Event;
        const d = (ev.data ?? {}) as Record<string, unknown>;
        // Counted BEFORE the terminal branches so the cursor includes the event
        // that ended the read, and only for kinds the server can replay.
        if (REPLAYABLE.has(ev.type)) read++;
        if (ev.type === "message.completed") {
          // Step-1 pre-read (runner.ts:182-184): the assistant text field on
          // message.completed is `message` (data: { turnId, message: text,
          // finishReason }). Kept `text`/`content` as defensive fallbacks
          // for other emitters.
          replyText = String(d.text ?? d.content ?? d.message ?? replyText);
        } else if (ev.type === "turn.failed" || ev.type === "session.failed") {
          throw new Error(`code turn failed: ${String(d.message ?? "unknown")}`);
        } else if (ev.type === "input.requested") {
          // The coder is gated on a human: nothing further reaches this stream
          // until the request is decided (toolset.ts parks the turn for 30
          // minutes), so stop reading and hand the request up for the channel
          // to render.
          await reader.cancel();
          return {
            codeSessionId,
            replyText,
            nextCursor: args.startCursor + read,
            reason: "input-requested",
            pending: parseRequests(d.requests),
          };
        } else if (ev.type === "session.waiting" || ev.type === "turn.completed") {
          await reader.cancel();
          return {
            codeSessionId,
            replyText,
            nextCursor: args.startCursor + read,
            reason: ev.type === "turn.completed" ? "completed" : "waiting",
            pending: [],
          };
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
  // The connection closed with no terminal event ever seen — ambiguous
  // whether the turn is genuinely over or a gate published right as it
  // dropped was missed. One more direct check before calling it "ended".
  return await resultOrPendingGate(client, args, args.startCursor + read, replyText, {
    codeSessionId, replyText, nextCursor: args.startCursor + read, reason: "stream-ended", pending: [],
  });
}
