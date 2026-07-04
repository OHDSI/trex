// task-u2: pure event-reducer + NDJSON/session-id plumbing for the eve/agents
// session API (core/server/agents/service/handler.ts's POST /eve/v1/session
// + GET .../stream + POST .../approval), which REPLACES /chat as the agents
// loop's transport specifically to get real needsApproval support — /chat
// runs a needsApproval tool to completion and returns an error tool-result
// (see agentsChat.ts's APPROVAL_REQUIRED_MARKER); the session API instead
// pauses the turn and emits `input.requested`, which this reducer turns into
// `pendingApproval` for AgentConsentBanner. See task-u2-report.md for the
// evidence (both options were prototyped live against a toy agent before
// this was picked) and the "Decision for sign-off" section.
//
// Event vocabulary mirrors core/server/agents/service/events.ts's AgentEvent
// union (duplicated here — devx's frontend has no shared package with core's
// Deno-only agents module, same posture as agentsChat.ts's DevxUIMessage
// duplicating just enough of the AI SDK's UIMessage shape it needs).
//
// Wire semantics that shaped this file's design, confirmed by reading
// runner.ts (not guessed):
//  - `message.appended`'s `messageSoFar` is the FULL turn's cumulative text,
//    accumulated across the whole turn (including across tool-call
//    boundaries — runner.ts's `text` variable is declared once per turn and
//    never reset per step). It is NOT a fresh per-segment string. Naively
//    replacing "the last text part" with `messageSoFar` verbatim would
//    duplicate any text rendered before an intervening tool call. Instead,
//    a per-turn cursor (`textCursors`) tracks how much of the cumulative
//    string has already been rendered, and only the new suffix is
//    appended/merged — this reconstructs correctly interleaved
//    text/tool-call parts from a non-segmented cumulative stream.
//  - There is at most ONE `message.completed` per turn (runner.ts's "finish"
//    case fires once per `streamText` call, even though that call may run
//    several internal tool round-trips via `stopWhen: stepCountIs(...)`).
//  - Replay (reconnect/page-reload) never emits `message.appended` for a
//    completed turn — only the final `message.completed` (persisted "text"
//    steps have no delta history) — the same cursor logic handles this for
//    free (cursor starts at 0, the full text is one big "suffix").
import { type ToolUIPart, type DynamicToolUIPart, isToolUIPart } from "ai";
import type { DevxUIMessage, DevxUIMessagePart } from "./agentsChat";
import type { AgentTodo, BuildAction, ConsentRequest, QuestionnaireRequest } from "./types";

export interface SessionActionRequestItem {
  kind: "tool-call";
  callId: string;
  toolName: string;
  input: unknown;
  clientOnly?: boolean;
}

export interface SessionActionResultData {
  kind: "tool-result";
  callId: string;
  toolName: string;
  output: unknown;
}

export interface SessionInputRequestItem {
  requestId: string;
  action: { kind: "tool-call"; callId: string; toolName: string; input: unknown };
}

export type SessionEvent =
  | { type: "turn.started"; data: { turnId: string; sequence: number } }
  | { type: "message.appended"; data: { turnId: string; messageDelta: string; messageSoFar: string } }
  | { type: "message.completed"; data: { turnId: string; message: string; finishReason: string } }
  | { type: "actions.requested"; data: { turnId: string; actions: SessionActionRequestItem[] } }
  | { type: "action.result"; data: { turnId: string; result: SessionActionResultData; status: "completed" | "failed" } }
  | { type: "input.requested"; data: { turnId: string; requests: SessionInputRequestItem[] } }
  | { type: "turn.completed"; data: { turnId: string; usage?: { inputTokens?: number; outputTokens?: number }; finishReason?: string } }
  | { type: "turn.failed"; data: { turnId: string; message: string } }
  | { type: "session.waiting"; data: { wait: "next-user-message" } }
  | { type: "session.failed"; data: { sessionId: string; message: string } }
  | { type: "tool.event"; data: { name: string; payload: unknown } };

/** Defensive NDJSON line parse — mirrors AgentRunDetail.tsx's live-tail
 * reader (plugins/web/src/pages/admin/AgentRunDetail.tsx): malformed/partial
 * lines are skipped rather than throwing, since a stream reader has no way
 * to ask the server to resend a bad line. */
export function parseSessionEvent(line: string): SessionEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as { type?: unknown }).type !== "string") {
    return null;
  }
  return parsed as SessionEvent;
}

export interface SessionChatState {
  messages: DevxUIMessage[];
  todos: AgentTodo[];
  questionnaire: QuestionnaireRequest | null;
  planContent: string | null;
  buildActions: BuildAction[];
  tokenUsage: { promptTokens?: number; completionTokens?: number } | null;
  pendingApproval: ConsentRequest | null;
  turnError: string | null;
  turnActive: boolean;
  /** turnId -> length of `messageSoFar`/`message` already rendered into
   * parts. See header comment on why this cursor (not naive replacement) is
   * required for correct text/tool-call interleaving. */
  textCursors: Record<string, number>;
}

export function initialSessionState(seed: DevxUIMessage[]): SessionChatState {
  return {
    messages: seed,
    todos: [],
    questionnaire: null,
    planContent: null,
    buildActions: [],
    tokenUsage: null,
    pendingApproval: null,
    turnError: null,
    turnActive: false,
    textCursors: {},
  };
}

function ensureAssistantMessage(messages: DevxUIMessage[], turnId: string): DevxUIMessage[] {
  if (messages.some((m) => m.id === turnId)) return messages;
  return [...messages, { id: turnId, role: "assistant", parts: [] }];
}

function updateMessage(
  messages: DevxUIMessage[],
  id: string,
  fn: (m: DevxUIMessage) => DevxUIMessage,
): DevxUIMessage[] {
  return messages.map((m) => (m.id === id ? fn(m) : m));
}

function upsertTextSuffix(parts: DevxUIMessagePart[], suffix: string): DevxUIMessagePart[] {
  if (!suffix) return parts;
  const last = parts[parts.length - 1];
  if (last && last.type === "text") {
    return [...parts.slice(0, -1), { ...last, text: last.text + suffix }];
  }
  return [...parts, { type: "text", text: suffix } as DevxUIMessagePart];
}

/** Appends only the NOT-YET-rendered suffix of a turn's cumulative text (see
 * header comment) — safe to call with `message.appended`'s `messageSoFar` or
 * `message.completed`'s `message`, live or replayed, in any order a
 * monotonic cumulative string can arrive in (a shorter/duplicate value is a
 * no-op). */
function appendTextSuffix(state: SessionChatState, turnId: string, fullText: string): SessionChatState {
  const cursor = state.textCursors[turnId] ?? 0;
  if (!fullText || fullText.length <= cursor) return state;
  const suffix = fullText.slice(cursor);
  const messages = updateMessage(ensureAssistantMessage(state.messages, turnId), turnId, (m) => ({
    ...m,
    parts: upsertTextSuffix(m.parts, suffix),
  }));
  return { ...state, messages, textCursors: { ...state.textCursors, [turnId]: fullText.length } };
}

function upsertToolCallParts(parts: DevxUIMessagePart[], actions: SessionActionRequestItem[]): DevxUIMessagePart[] {
  let next = parts;
  for (const a of actions) {
    if (next.some((p) => isToolUIPart(p) && (p as ToolUIPart | DynamicToolUIPart).toolCallId === a.callId)) continue;
    const part = {
      type: `tool-${a.toolName}`,
      toolCallId: a.callId,
      state: "input-available",
      input: a.input,
    } as unknown as DevxUIMessagePart;
    next = [...next, part];
  }
  return next;
}

function resolveToolCallPart(
  parts: DevxUIMessagePart[],
  callId: string,
  output: unknown,
  failed: boolean,
): DevxUIMessagePart[] {
  return parts.map((p) => {
    if (!isToolUIPart(p) || (p as ToolUIPart | DynamicToolUIPart).toolCallId !== callId) return p;
    return failed
      ? ({ ...p, state: "output-error", errorText: typeof output === "string" ? output : JSON.stringify(output) } as unknown as DevxUIMessagePart)
      : ({ ...p, state: "output-available", output } as unknown as DevxUIMessagePart);
  });
}

function safePreview(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export interface ToolEventEffects {
  appCommand?: string;
  buildAction?: BuildAction;
  modeChange?: string;
}

const NO_EFFECTS: ToolEventEffects = {};

/** H3's `tool.event {name, payload}` on the session path is the same wire
 * shape /chat's `data-<name>` UIMessage parts carry (see
 * plugins/devx/agent/lib/context.ts's toDevxCtx: `send` routes a ported
 * tool's `ctx.send({type, ...})` through `evectx.emit(type, data)` either
 * way) — just without the "data-" prefix useAgentsChat.ts's onData switch
 * keys on. Payload field names below are copied 1:1 from that switch. */
function applyToolEvent(
  state: SessionChatState,
  name: string,
  payload: unknown,
): { state: SessionChatState; effects: ToolEventEffects } {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (name) {
    case "todos":
      return { state: { ...state, todos: (p.todos as AgentTodo[] | undefined) ?? [] }, effects: NO_EFFECTS };
    case "questionnaire":
      if (typeof p.requestId === "string") {
        return {
          state: {
            ...state,
            questionnaire: { requestId: p.requestId, questions: (p.questions as QuestionnaireRequest["questions"]) ?? [] },
          },
          effects: NO_EFFECTS,
        };
      }
      return { state, effects: NO_EFFECTS };
    case "plan_update":
      if (typeof p.content === "string") return { state: { ...state, planContent: p.content }, effects: NO_EFFECTS };
      return { state, effects: NO_EFFECTS };
    case "plan_exit":
      return {
        state: { ...state, questionnaire: null },
        effects: typeof p.mode === "string" ? { modeChange: p.mode } : NO_EFFECTS,
      };
    case "mode_change":
      return { state, effects: typeof p.mode === "string" ? { modeChange: p.mode } : NO_EFFECTS };
    case "app_command":
      return { state, effects: typeof p.command === "string" ? { appCommand: p.command } : NO_EFFECTS };
    case "build_action": {
      const action: BuildAction = {
        action: (p.action as string) ?? "unknown",
        path: p.path as string | undefined,
        error: p.error as string | undefined,
      };
      return { state: { ...state, buildActions: [...state.buildActions, action] }, effects: { buildAction: action } };
    }
    default:
      // subagent_* and anything else: not emitted on this loop (same posture
      // as agentsChat.ts's onData default branch) — no-op, not a dropped bug.
      return { state, effects: NO_EFFECTS };
  }
}

/** The one reducer entry point the hook drives its stream-reading loop
 * through: `{state} = reduceSessionEvent(state, event)` for every parsed
 * NDJSON line, in arrival order (live or replayed — see header comment on
 * why both are safe here). */
export function reduceSessionEvent(
  state: SessionChatState,
  event: SessionEvent,
): { state: SessionChatState; effects: ToolEventEffects } {
  switch (event.type) {
    case "turn.started":
      return {
        state: { ...state, messages: ensureAssistantMessage(state.messages, event.data.turnId), turnError: null, turnActive: true },
        effects: NO_EFFECTS,
      };
    case "message.appended":
      return { state: appendTextSuffix(state, event.data.turnId, event.data.messageSoFar), effects: NO_EFFECTS };
    case "message.completed":
      return { state: appendTextSuffix(state, event.data.turnId, event.data.message), effects: NO_EFFECTS };
    case "actions.requested": {
      const { turnId, actions } = event.data;
      const messages = updateMessage(ensureAssistantMessage(state.messages, turnId), turnId, (m) => ({
        ...m,
        parts: upsertToolCallParts(m.parts, actions),
      }));
      return { state: { ...state, messages }, effects: NO_EFFECTS };
    }
    case "action.result": {
      const { turnId, result, status } = event.data;
      const messages = updateMessage(ensureAssistantMessage(state.messages, turnId), turnId, (m) => ({
        ...m,
        parts: resolveToolCallPart(m.parts, result.callId, result.output, status === "failed"),
      }));
      const pendingApproval = state.pendingApproval?.requestId === result.callId ? null : state.pendingApproval;
      return { state: { ...state, messages, pendingApproval }, effects: NO_EFFECTS };
    }
    case "input.requested": {
      const first = event.data.requests[0];
      if (!first) return { state, effects: NO_EFFECTS };
      return {
        state: {
          ...state,
          pendingApproval: {
            requestId: first.requestId,
            toolName: first.action.toolName,
            inputPreview: safePreview(first.action.input),
          },
        },
        effects: NO_EFFECTS,
      };
    }
    case "turn.completed": {
      const { turnId, usage } = event.data;
      const messages = usage
        ? updateMessage(state.messages, turnId, (m) => ({ ...m, metadata: { ...m.metadata, usage } }))
        : state.messages;
      return { state: { ...state, messages, turnActive: false, turnError: null }, effects: NO_EFFECTS };
    }
    case "turn.failed":
      return { state: { ...state, turnActive: false, turnError: event.data.message }, effects: NO_EFFECTS };
    case "session.waiting":
      return { state, effects: NO_EFFECTS };
    case "session.failed":
      return { state: { ...state, turnActive: false, turnError: event.data.message }, effects: NO_EFFECTS };
    case "tool.event":
      return applyToolEvent(state, event.data.name, event.data.payload);
    default:
      return { state, effects: NO_EFFECTS };
  }
}

// --- per-chat session-id cache -----------------------------------------
// task-u2 scope trim (flagged in task-u2-report.md, not an oversight): the
// session API needs the SAME agents.sessions row reused across turns of one
// devx chat for conversation memory (runner.ts's historyForModel reads prior
// turns off the session, unlike /chat which took full history from the
// client on every request) — but a devx chat has no server-side column to
// persist that mapping in yet. Cached client-side (localStorage) rather than
// adding a devx.chats migration + PATCH route in this pass: correct for the
// common single-browser devx workflow, degrades gracefully (a fresh session
// with no prior-turn memory, not an error) if the cache is missing/cleared,
// and is a pure addition a later task can upgrade to server-side storage
// without changing this module's interface.
const SESSION_ID_PREFIX = "devx.agentSession.";

export function loadCachedSessionId(chatId: string): string | null {
  try {
    return localStorage.getItem(SESSION_ID_PREFIX + chatId);
  } catch {
    return null;
  }
}

export function saveCachedSessionId(chatId: string, sessionId: string): void {
  try {
    localStorage.setItem(SESSION_ID_PREFIX + chatId, sessionId);
  } catch {
    // ignore — worst case, the next turn starts a fresh session
  }
}
