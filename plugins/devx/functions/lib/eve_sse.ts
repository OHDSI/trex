// Translates eve turn events into the devx SSE frame vocabulary that
// plugins/devx/functions/agent.ts's `send()` already emits and that
// claude_code_agent.ts / security_routes.ts / index.ts's `agentSend`
// already parse (`chunk`, `tool_call_start`, `tool_call_end`). One eve
// event in, one devx frame or `null` out — devx has no batched-frame
// concept, so an eve event that can't collapse into exactly one devx frame
// is dropped, not split or invented.
//
// EveEvent is declared locally rather than imported from core/: functions/
// cannot import core/ — verified in Phase 2, and doing so breaks the staged
// worker in a way `deno test` (which runs with node_modules present) does
// not catch, since the worker stages without them.
//
// The kinds below mirror exactly what
// core/server/agents/service/engine/events.ts's TranslatedEvent can
// produce. There is no `default: never` check available here (this union
// is local, not core's), so eve_sse.test.ts pins HANDLED_EVE_EVENT_KINDS
// against that file's real literals — a kind added there and not here
// fails that test instead of silently vanishing through this file's
// `default: null`.

export interface EveActionItem {
  kind: "tool-call";
  callId: string;
  toolName: string;
  input: unknown;
}

export interface EveActionResult {
  kind: "tool-result";
  callId: string;
  toolName: string;
  output: unknown;
}

export type EveEvent =
  | { type: "message.appended"; data: { turnId: string; messageDelta: string; messageSoFar: string } }
  | { type: "actions.requested"; data: { turnId: string; actions: EveActionItem[] } }
  | { type: "action.result"; data: { turnId: string; result: EveActionResult; status: "completed" | "failed" } }
  | {
    type: "turn.completed";
    data: { turnId: string; usage?: { inputTokens?: number; outputTokens?: number }; finishReason?: string };
  }
  | { type: "turn.failed"; data: { turnId: string; message: string } }
  | { type: "context.compacted"; data: { via: "summary" | "drop"; replacedTurnSeqTo: number; warning?: string } };

export type DevxSseFrame =
  | { type: "chunk"; content: string }
  | { type: "tool_call_start"; callId: string; name: string; args: unknown }
  | { type: "tool_call_end"; callId: string; name: string; result: unknown; error?: boolean };

// Every eve event kind this file recognizes — sourced from
// core/server/agents/service/engine/events.ts's TranslatedEvent union.
// Kept in sync with MAPPED + DROPPED below; eve_sse.test.ts checks both.
export const HANDLED_EVE_EVENT_KINDS: readonly EveEvent["type"][] = [
  "message.appended",
  "actions.requested",
  "action.result",
  "turn.completed",
  "turn.failed",
  "context.compacted",
];

// Kinds that produce a real devx SSE frame.
export const MAPPED_EVE_EVENT_KINDS: readonly EveEvent["type"][] = [
  "message.appended",
  "actions.requested",
  "action.result",
];

// Kinds with no devx-renderable equivalent — toDevxSse returns null for
// these, deliberately, not by falling through an unhandled default.
export const DROPPED_EVE_EVENT_KINDS: readonly EveEvent["type"][] = [
  "turn.completed",
  "turn.failed",
  "context.compacted",
];

export function toDevxSse(event: EveEvent): DevxSseFrame | null {
  switch (event.type) {
    case "message.appended":
      return { type: "chunk", content: event.data.messageDelta };

    case "actions.requested": {
      // devx's tool_call_start is one call per frame. eve's actions array
      // supports a parallel-call batch, which has no lossless single-frame
      // form here — dropped rather than silently narrowed to the first.
      if (event.data.actions.length !== 1) return null;
      const action = event.data.actions[0];
      return { type: "tool_call_start", callId: action.callId, name: action.toolName, args: action.input };
    }

    case "action.result":
      return {
        type: "tool_call_end",
        callId: event.data.result.callId,
        name: event.data.result.toolName,
        result: event.data.result.output,
        error: event.data.status === "failed" ? true : undefined,
      };

    // Control signals, not renderable frames: today's callers
    // (claude_code_agent.ts's "done"/"error" cases) build the terminal
    // `done`/`error` SSE frame themselves from accumulated state — full
    // content, DB writes, error classification — that this stateless
    // per-event mapper never has.
    case "turn.completed":
    case "turn.failed":
      return null;

    // No devx concept for a mid-stream context-compaction notice.
    case "context.compacted":
      return null;

    default:
      return null;
  }
}
