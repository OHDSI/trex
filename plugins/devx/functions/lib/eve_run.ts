// Runs ONE devx turn on eve's agent runtime and returns what
// streamAgentChat used to return, so security reviews (routes/
// security_routes.ts) and autonomous runs (index.ts) share one seam instead
// of hand-rolling HTTP each. Modelled on plugins/claw/agent/lib/
// code-session.ts, the only other client of this API.
//
// Plain fetch, not Trex.req: the inter-service channel buffers a whole
// response (ext/trex/js/trex_lib.js's req) and these turns run for minutes —
// the same reason plugins/d2esupport/agent/lib/claw-session.ts uses fetch.
//
// No import from core/: functions/ cannot (it breaks the staged worker, which
// has no node_modules — deno tests do not catch it). The event shapes come
// from eve_sse.ts's local declarations.

import { type DevxSseFrame, type EveEvent, toDevxSse } from "./eve_sse.ts";

// Same bound as claw's code-session.ts: generous, but finite, so a stream that
// stops producing cannot wedge the caller until an external reaper intervenes.
const DEFAULT_TIMEOUT_MS = 90 * 60_000;

// core/server/agents/service/approval-gate.ts's refusal text for the
// `no-approver` verdict. Both loops surface it identically — the native one as
// the tool's result, the sidecar as a permission_denied that engine/events.ts
// translates into the same `{ error }` output.
export const NO_APPROVER_ERROR = "requires approval but this session has no approver";

// Kinds the native runner emits that eve_sse.ts's union does not carry (it
// mirrors the external-engine translation). Terminal handling reads these, so
// they are declared, not cast away.
type ControlEvent =
  | { type: "message.completed"; data: { turnId: string; message?: string; finishReason?: string } }
  | { type: "input.requested"; data: { turnId: string; requests?: Array<{ action?: { toolName?: string } }> } }
  | { type: "session.failed"; data: { message?: string } };

/** A tool call eve refused because this session has nobody to ask. */
export interface EveDenial {
  toolName: string;
  reason: string;
}

export interface RunOnEveOpts {
  userId: string;
  appId?: string | null;
  prompt: string;
  /** Recorded on the turn, NOT enforced — see buildMetadata. */
  allowedTools?: string[] | null;
  /** Prepended to the message; eve's devx loop refuses a client-supplied system prompt. */
  skillContext?: string;
  /** Recorded on the turn, NOT enforced — see buildMetadata. */
  workspacePathOverride?: string;
  /** The one tool-scoping knob eve honours: agent.ts's filterTools reads it. */
  mode?: "ask" | "plan" | "build";
  send: (frame: DevxSseFrame) => void;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  bearerToken?: string;
  timeoutMs?: number;
}

export interface RunOnEveResult {
  content: string;
  finishReason: string;
  sessionId: string;
  /** Non-empty when eve denied a hard-tier tool for want of an approver. */
  denials: EveDenial[];
}

export function eveSessionBase(): string {
  const root = (Deno.env.get("DEVX_EVE_LOOPBACK_URL")?.trim() || "http://127.0.0.1:33001").replace(/\/+$/, "");
  return `${root}/plugins/trex/devx-agent/eve/v1/session`;
}

// mode is the only key here the eve devx loop acts on (agent/lib/context.ts
// reads mode/chatId/appId/attachments). allowedTools and workspacePathOverride
// are carried so the caller's intent reaches ctx.metadata unaltered, but
// NOTHING enforces them server-side today — a legacy allowed_tools restriction
// does not survive this migration, and neither does a run's worktree cwd.
function buildMetadata(opts: RunOnEveOpts): Record<string, unknown> {
  return {
    ...(opts.appId ? { appId: opts.appId } : {}),
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.allowedTools?.length ? { allowedTools: opts.allowedTools } : {}),
    ...(opts.workspacePathOverride ? { workspacePathOverride: opts.workspacePathOverride } : {}),
  };
}

// Legacy passed skillContext into the system prompt; eve's devx loop
// deliberately rejects a client-supplied one (agent.ts's buildInstructions),
// so it rides the user message — the only channel that still reaches the model.
function buildMessage(opts: RunOnEveOpts): string {
  const context = opts.skillContext?.trim();
  return context ? `<instruction-context>\n${context}\n</instruction-context>\n\n${opts.prompt}` : opts.prompt;
}

function denialReason(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const error = (output as { error?: unknown }).error;
  return typeof error === "string" && error.includes(NO_APPROVER_ERROR) ? error : null;
}

export async function runOnEve(opts: RunOnEveOpts): Promise<RunOnEveResult> {
  const f = opts.fetchImpl ?? fetch;
  const base = (opts.baseUrl ?? eveSessionBase()).replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json", "x-user-id": opts.userId };
  if (opts.bearerToken) headers.authorization = `Bearer ${opts.bearerToken}`;

  // unattended: true, and NO approverReachable. Neither consumer has a human
  // watching a gate, so hard-tier tools (git push, psql, ExecuteSQL, …) are
  // denied outright rather than parked for 30 minutes and then denied; the
  // unattended flag is what keeps every OTHER needsApproval tool from gating.
  // Deliberately no `message`: the create route starts the turn as soon as one
  // is present, and that turn's events would be gone before we subscribe.
  const created = await f(base, { method: "POST", headers, body: JSON.stringify({ unattended: true }) });
  if (!created.ok) {
    await created.body?.cancel();
    throw new Error(`eve session create failed: ${created.status}`);
  }
  const sessionId = (await created.json() as { sessionId?: unknown }).sessionId;
  if (typeof sessionId !== "string" || !sessionId) throw new Error("eve session create returned no sessionId");

  // Subscribe FIRST. Posting the turn before this attach loses every event it
  // emits in the gap — the 90-minute silent hang Phase 1 shipped.
  const stream = await f(`${base}/${sessionId}/stream?startIndex=0`, { method: "GET", headers });
  if (!stream.ok || !stream.body) {
    await stream.body?.cancel();
    throw new Error(`eve stream failed: ${stream.status}`);
  }
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();

  try {
    const turn = await f(`${base}/${sessionId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: buildMessage(opts), metadata: buildMetadata(opts) }),
    });
    if (!turn.ok) {
      await turn.body?.cancel();
      throw new Error(`eve turn failed: ${turn.status}`);
    }
    await turn.body?.cancel();
    return await consumeTurn(reader, sessionId, opts);
  } finally {
    try {
      await reader.cancel();
    } catch { /* already closed */ }
  }
}

async function consumeTurn(
  reader: ReadableStreamDefaultReader<string>,
  sessionId: string,
  opts: RunOnEveOpts,
): Promise<RunOnEveResult> {
  const emit = (event: EveEvent) => {
    const frame = toDevxSse(event);
    if (frame) opts.send(frame);
  };
  const denials: EveDenial[] = [];
  let assembled = "";
  let finalText: string | undefined;
  let buf = "";
  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => { /* already closed */ });
  }, timeoutMs);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (timedOut) throw new Error(`eve turn timed out after ${timeoutMs}ms`);
        break;
      }
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        // The one wire-boundary cast: these NDJSON lines ARE the union
        // eve_sse.ts declares, plus the control kinds above.
        const event = JSON.parse(line) as EveEvent | ControlEvent;
        switch (event.type) {
          case "message.appended":
            assembled += event.data.messageDelta;
            emit(event);
            break;
          case "actions.requested":
            emit(event);
            break;
          case "action.result": {
            emit(event);
            const reason = denialReason(event.data.result.output);
            if (reason) denials.push({ toolName: event.data.result.toolName, reason });
            break;
          }
          // The authoritative final reply, including the runner's own
          // "that step finished without a reply" fallback text.
          case "message.completed":
            finalText = event.data.message;
            break;
          case "turn.completed":
            return {
              content: finalText ?? assembled,
              finishReason: event.data.finishReason ?? "stop",
              sessionId,
              denials,
            };
          case "turn.failed":
            throw new Error(`eve turn failed: ${event.data.message}`);
          case "session.failed":
            throw new Error(`eve session failed: ${event.data.message ?? "unknown"}`);
          // Unreachable while the session stays unattended with no approver
          // (resolveApproval denies instead of gating), but a gate that DID
          // park would otherwise hold this stream for 30 minutes with nobody
          // able to answer it.
          case "input.requested": {
            const tools = (event.data.requests ?? []).map((r) => r.action?.toolName ?? "unknown").join(", ");
            throw new Error(`eve turn parked on an approval this session cannot answer: ${tools}`);
          }
          default:
            break;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  // The connection closed with no terminal event: the turn's outcome is
  // unknown, so report that instead of passing partial text off as a result.
  throw new Error(`eve stream ended before the turn finished (session ${sessionId})`);
}
