// Translates messages from the claude-agent-sdk's `Query()` stream
// (`SDKMessage`, a union of ~38 variants) into eve's `AgentEvent`
// vocabulary. Same house style as toolset.ts's bridgeChildEvent: map the
// few kinds that matter, drop the rest, and say why in a comment.
//
// We map exactly six shapes:
//   - an assistant message's text content -> message.appended
//   - an assistant message's tool_use content -> actions.requested
//   - a user message's tool_result content (the SDK's own echo of a
//     finished tool call back into the transcript) -> action.result
//   - the terminal result message -> turn.completed / turn.failed
//   - a compact_boundary system message -> context.compacted
//   - a permission_denied system message -> action.result (status: failed)
//
// Everything else — session bootstrap/status/notification messages,
// streaming partials (stream_event), task/background-task/hook/plugin
// progress, conversation_reset, replayed history, etc. — returns null:
// eve has no counterpart for them and they carry no turn-lifecycle
// information this bridge needs to forward.
//
// Do NOT import the SDK: `SdkMessageLike` below is a minimal structural
// mirror of just the fields this file reads, sourced from
// @anthropic-ai/claude-agent-sdk@0.3.214's sdk.d.ts (pinned by
// plugins/devx/fn-claude-code/package.json) — see the task report for the
// exact types read.
import type { AgentEvent } from "../events.ts";

// Anthropic's wire content blocks. `message` is typed loosely (object OR a
// plain string) because the SDK's own MessageParam/BetaMessage.content field
// is `string | Array<ContentBlock>` — a plain-text message has no blocks at
// all, which the readers below treat as "nothing to map here", not malformed.
interface SdkContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

interface SdkMessageEnvelope {
  content?: SdkContentBlock[] | string;
}

export interface SdkMessageLike {
  type: string;
  subtype?: string;
  session_id?: string;
  // SDKAssistantMessage/SDKUserMessage carry an object here (BetaMessage /
  // MessageParam); SDKPermissionDeniedMessage reuses the SAME field name for
  // a plain string (the rejection text) — a real collision in the SDK's own
  // wire shape, not an artifact of this type.
  message?: SdkMessageEnvelope | string;
  // SDKUserMessage: the tool's structured Output object, keyed by the
  // originating tool_use block's name (see sdk.d.ts) — preferred over the
  // content block's stringified text when present.
  tool_use_result?: unknown;
  // SDKUserMessageReplay reuses `type: "user"` for historical replay, not a
  // live turn event — this flag is how we tell the two apart.
  isReplay?: boolean;
  // SDKPermissionDeniedMessage
  tool_name?: string;
  tool_use_id?: string;
  // SDKResultMessage (SDKResultSuccess | SDKResultError)
  is_error?: boolean;
  result?: string;
  errors?: string[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function contentBlocks(m: SdkMessageLike): SdkContentBlock[] {
  const msg = m.message;
  if (!msg || typeof msg === "string" || !Array.isArray(msg.content)) return [];
  return msg.content;
}

function translateResult(m: SdkMessageLike): AgentEvent | null {
  const turnId = m.session_id;
  if (typeof turnId !== "string" || typeof m.is_error !== "boolean") return null;
  if (m.is_error) {
    const message = m.errors && m.errors.length > 0 ? m.errors.join("; ") : m.result ?? "the turn failed";
    return { type: "turn.failed", data: { turnId, message } };
  }
  return {
    type: "turn.completed",
    data: {
      turnId,
      usage: { inputTokens: m.usage?.input_tokens, outputTokens: m.usage?.output_tokens },
      finishReason: m.stop_reason ?? undefined,
    },
  };
}

// The sidecar's compact_boundary reports token counts for ITS OWN CLI
// transcript, not eve's turn sequence — there is no SDK field to read
// `replacedTurnSeqTo` from. -1 cannot collide with a real turn seq (seqs
// start at 1), so a consumer keying off it (handler.ts's boundaryTurn
// lookup) safely falls into its existing "no matching turn" branch instead
// of silently misattributing the compaction to turn 1. `via` is always
// "summary": the SDK only emits this event after an actual compaction ran
// (unlike eve's own compactor, it has no "gave up and dropped" case here).
function translateCompactBoundary(): AgentEvent {
  return { type: "context.compacted", data: { via: "summary", replacedTurnSeqTo: -1 } };
}

// Unlike a tool_result block, permission_denied carries the tool's name
// directly, so this action.result is more complete than a real tool result's.
function translatePermissionDenied(m: SdkMessageLike): AgentEvent | null {
  const turnId = m.session_id;
  if (typeof turnId !== "string" || typeof m.tool_use_id !== "string") return null;
  const reason = typeof m.message === "string" ? m.message : "denied";
  return {
    type: "action.result",
    data: {
      turnId,
      result: { kind: "tool-result", callId: m.tool_use_id, toolName: m.tool_name ?? "", output: { error: reason } },
      status: "failed",
    },
  };
}

// Anthropic's tool_result wire block carries only tool_use_id — never the
// tool's name — so translating it needs the name recorded from the EARLIER
// tool_use block in the same turn's stream. This factory holds exactly that
// one piece of per-turn state (no I/O; still fully testable via its
// returned closure) and nothing else is stateful here.
export function createSdkTranslator(): (m: SdkMessageLike) => AgentEvent | null {
  // tool_use_id -> toolName. Deleted on read so a long turn with many tool
  // calls doesn't grow this unboundedly.
  const toolNames = new Map<string, string>();

  function translateAssistant(m: SdkMessageLike): AgentEvent | null {
    const turnId = m.session_id;
    if (typeof turnId !== "string") return null;
    const blocks = contentBlocks(m);

    const toolUses = blocks.filter(
      (b): b is SdkContentBlock & { id: string; name: string } =>
        b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string",
    );
    if (toolUses.length > 0) {
      for (const b of toolUses) toolNames.set(b.id, b.name);
      return {
        type: "actions.requested",
        data: {
          turnId,
          actions: toolUses.map((b) => ({ kind: "tool-call" as const, callId: b.id, toolName: b.name, input: b.input })),
        },
      };
    }

    // A tool_use block takes priority when both appear in the same message
    // (the pending call is the actionable half; accompanying scratch text is
    // not separately surfaced by this function) — reachable only when the
    // filter above found none.
    const text = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");
    if (!text) return null;
    return { type: "message.appended", data: { turnId, messageDelta: text, messageSoFar: text } };
  }

  function translateToolResult(m: SdkMessageLike): AgentEvent | null {
    const turnId = m.session_id;
    if (typeof turnId !== "string") return null;
    const block = contentBlocks(m).find((b) => b.type === "tool_result" && typeof b.tool_use_id === "string");
    if (!block || typeof block.tool_use_id !== "string") return null;
    const output = m.tool_use_result !== undefined ? m.tool_use_result : block.content;
    // An id never seen (its tool_use arrived before this translator was
    // created, or was dropped for some other reason) still yields the
    // result with an empty name — losing the result entirely would be worse.
    const toolName = toolNames.get(block.tool_use_id) ?? "";
    toolNames.delete(block.tool_use_id);
    return {
      type: "action.result",
      data: {
        turnId,
        result: { kind: "tool-result", callId: block.tool_use_id, toolName, output },
        status: block.is_error === true ? "failed" : "completed",
      },
    };
  }

  return (m: SdkMessageLike): AgentEvent | null => {
    if (!m || typeof m.type !== "string") return null;
    switch (m.type) {
      case "assistant":
        return translateAssistant(m);
      case "user":
        // SDKUserMessageReplay shares `type: "user"` with a live tool result
        // but reconstructs history rather than reporting a live turn event.
        return m.isReplay ? null : translateToolResult(m);
      case "result":
        return translateResult(m);
      case "system":
        if (m.subtype === "compact_boundary") return translateCompactBoundary();
        if (m.subtype === "permission_denied") return translatePermissionDenied(m);
        // Other `system` subtypes (init, status, notification, api_retry,
        // background_tasks_changed, commands_changed, session_state_changed,
        // worker_shutting_down, plugin_install, ...) carry no turn-lifecycle
        // information eve needs.
        return null;
      default:
        // stream_event (partial assistant deltas), conversation_reset,
        // tool_progress, task_*, hook_*, auth_status, memory_recall,
        // rate_limit, elicitation_complete, prompt_suggestion, mirror_error,
        // informational, tool_use_summary, active_goal, and any other
        // variant not listed above.
        return null;
    }
  };
}
