// task-u1: pure event-mapping layer between the eve/agents runtime's
// UIMessage stream (core/server/agents/service/handler.ts's POST /chat) and
// the legacy-shaped state useMessages.ts/ChatPanel.tsx already consume.
// Kept dependency-free of React so it's trivially unit-testable (this repo
// has no vitest/jest config under src/ today — see task-u1-report.md — so
// these are exercised indirectly via `tsc`/`vite build` only).
//
// Mapping table (bespoke SSE type -> eve/agents wire shape), cross-checked
// against plugins/devx/agent/lib/context.ts's send-adapter (toDevxCtx's
// `send` routes every ported tool's `ctx.send({type, ...})` through
// `evectx.emit(type, data)`) and core/server/agents/service/handler.ts's H3
// `toolEmit` (`writeData({type: \`data-${name}\`, data})`):
//   chunk                -> UIMessage text part (state streaming/done)
//   tool_call_start/end  -> UIMessage tool-<name> part (position inherent in
//                           `message.parts`; the `<!--tool:id-->` marker
//                           convention is deleted on this path)
//   step                 -> UIMessage step-start part (ai@6's own client-side
//                           reducer, not something trex's server code emits
//                           explicitly) - not rendered specially, matching
//                           legacy's own posture (onStep is wired nowhere in
//                           useMessages.ts/ChatPanel.tsx today either)
//   token_usage           -> finish part's `messageMetadata.usage` (see
//                           core/server/agents/service/handler.ts's
//                           messageMetadata option, added by this task after
//                           discovering usage did not reach the wire at all
//                           previously)
//   done                  -> finish part (triggers this client's own
//                           devx.messages persistence — see useAgentsChat.ts)
//   error                 -> UIMessage error part / useChat's `error` state
//   consent_request       -> NOT emitted on /chat at all. A needsApproval
//                           tool instead runs to completion and returns the
//                           tool-result `{error: "approval required — use
//                           the session API"}` (toolset.ts's authoredTool,
//                           since /chat's buildSdkTools call has no
//                           emit/turnId). Detected below via
//                           isApprovalRequiredOutput and surfaced as a
//                           non-blocking notice on the tool call itself, per
//                           the brief's U1 scope (session-API-based approval
//                           UX is U2's job).
//   todos                 -> data-todos {type:"todos", todos: AgentTodo[]}
//   questionnaire         -> data-questionnaire {type, requestId, questions}
//   plan_update           -> data-plan_update {type, content}
//   plan_exit             -> data-plan_exit {type, mode}
//   mode_change           -> data-mode_change {type, mode}
//   app_command           -> data-app_command {type, command}
//   build_action          -> data-build_action {type, action, path?, error?}
//                           (in practice unused on this loop today —
//                           build_tag_executor.ts, the only legacy emitter,
//                           is never invoked by the ported tool-based
//                           runtime; wired anyway per the brief, and the
//                           FILE_MUTATING_TOOLS heuristic useMessages.ts
//                           already runs on tool-call completion covers the
//                           actual "a file changed" signal on this loop)
//   subagent_*            -> NOT emitted on this loop at all. The legacy
//                           `Agent` tool (functions/tools/spawn_agent.ts,
//                           source of every subagent_* event) is superseded
//                           by eve's built-in `agent` tool (a different
//                           implementation - core/server/agents/service/
//                           toolset.ts's agentTool/runSubagent), which does
//                           NOT stream nested activity: "the outer agent
//                           tool-call/tool-result events carry prompt and
//                           result" (toolset.ts's own comment). A subagent
//                           run surfaces as an ordinary tool-<agent> call,
//                           rendered like any other tool via ToolCallCard -
//                           no separate handler needed or possible.
import {
  type UIMessage,
  type UIMessagePart,
  type UIDataTypes,
  type UITools,
  type ToolUIPart,
  type DynamicToolUIPart,
  isToolUIPart,
  getToolName,
} from "ai";
import type { Message, ToolCall, AgentTodo, QuestionnaireRequest } from "./types";

export type DevxUIMessage = UIMessage<{ usage?: { inputTokens?: number; outputTokens?: number } }>;
export type DevxUIMessagePart = UIMessagePart<UIDataTypes, UITools>;

/** The exact tool-result sentinel toolset.ts's authoredTool returns when a
 * needsApproval tool is invoked via the stateless /chat endpoint (no
 * emit/turnId wired -> no session to attach an approval request to). */
export const APPROVAL_REQUIRED_MARKER = "approval required — use the session API";

export function isApprovalRequiredOutput(output: unknown): boolean {
  return (
    !!output &&
    typeof output === "object" &&
    "error" in output &&
    (output as { error?: unknown }).error === APPROVAL_REQUIRED_MARKER
  );
}

/** Human-facing replacement for the raw sentinel — U2 builds the real
 * session-API approval flow; U1 just says so instead of pretending the tool
 * ran. */
export const APPROVAL_DEFERRED_MESSAGE =
  "This tool needs approval — approval UX lands with the session-API switch (U2). The action was not executed.";

function toolPartArgs(part: ToolUIPart | DynamicToolUIPart): Record<string, unknown> {
  const input = (part as { input?: unknown }).input;
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

/** Maps one UIMessage tool part (native `tool-<name>` or the fallback
 * `dynamic-tool` shape — see agentsChat.ts's header comment on why devx's
 * tools resolve to the former in practice) to the legacy `ToolCall` shape
 * ToolCallCard.tsx already renders, unchanged from the legacy loop. */
export function toolPartToLegacyToolCall(part: ToolUIPart | DynamicToolUIPart): ToolCall {
  const name = getToolName(part);
  const args = toolPartArgs(part);
  if (part.state === "output-error") {
    return { callId: part.toolCallId, name, args, result: part.errorText, error: true };
  }
  if (part.state === "output-available") {
    if (isApprovalRequiredOutput(part.output)) {
      return { callId: part.toolCallId, name, args, result: APPROVAL_DEFERRED_MESSAGE, error: true };
    }
    const output = part.output;
    const result = typeof output === "string" ? output : JSON.stringify(output);
    return { callId: part.toolCallId, name, args, result, error: false };
  }
  // input-streaming / input-available / approval-requested / approval-responded:
  // still running from the UI's point of view (result === undefined is
  // ToolCallCard's own "pending" signal).
  return { callId: part.toolCallId, name, args, result: undefined, error: false };
}

/** Concatenates a UIMessage's text parts (in order) — the same "plain text,
 * no <!--tool:id--> markers" content shape devx.messages.content stores for
 * the legacy loop too. */
export function uiMessageText(message: DevxUIMessage): string {
  return message.parts
    .filter((p): p is Extract<DevxUIMessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** All tool parts on a message, in wire order — position is inherent in
 * `parts`, unlike the legacy `<!--tool:id-->` marker convention this
 * replaces. */
export function uiMessageToolCalls(message: DevxUIMessage): ToolCall[] {
  return message.parts.filter(isToolUIPart).map(toolPartToLegacyToolCall);
}

/** Seeds useChat's initial message list from devx's own persisted history
 * (api.listMessages) — the stateless /chat endpoint has no server-side
 * memory of its own, so the client must resend full history on every turn.
 * Position fidelity for interleaved text/tool-call ordering is NOT
 * reconstructed here (devx.messages stores tool_calls separately from
 * content, with no persisted interleave-position) — reloaded history
 * renders as text-then-tool-cards, the same fallback layout ChatMessage.tsx
 * already uses for legacy messages with tool calls but no markers. Live,
 * same-session turns get full parts-order fidelity straight from useChat's
 * own stream-built `messages`. */
export function storedMessagesToUIMessages(messages: Message[]): DevxUIMessage[] {
  return messages.map((m): DevxUIMessage => {
    const parts: DevxUIMessagePart[] = [];
    if (m.content) parts.push({ type: "text", text: m.content });
    for (const tc of m.tool_calls ?? []) {
      const toolType = `tool-${tc.name}` as const;
      if (tc.error) {
        parts.push({
          type: toolType,
          toolCallId: tc.callId,
          state: "output-error",
          input: tc.args ?? {},
          errorText: tc.result ?? "error",
        } as unknown as DevxUIMessagePart);
      } else if (tc.result !== undefined) {
        parts.push({
          type: toolType,
          toolCallId: tc.callId,
          state: "output-available",
          input: tc.args ?? {},
          output: tc.result,
        } as unknown as DevxUIMessagePart);
      } else {
        parts.push({
          type: toolType,
          toolCallId: tc.callId,
          state: "input-available",
          input: tc.args ?? {},
        } as unknown as DevxUIMessagePart);
      }
    }
    return { id: m.id, role: m.role, parts };
  });
}

// --- data-* part payload shapes (mirrors the legacy StreamCallbacks'
// parsed.* field names 1:1 — see api.ts's streamChat switch statement) ---

export interface TodosDataPayload { type?: string; todos: AgentTodo[] }
export interface QuestionnaireDataPayload { type?: string; requestId: string; questions: QuestionnaireRequest["questions"] }
export interface PlanUpdateDataPayload { type?: string; content: string }
export interface PlanExitDataPayload { type?: string; mode?: string }
export interface ModeChangeDataPayload { type?: string; mode: string }
export interface AppCommandDataPayload { type?: string; command: string }
export interface BuildActionDataPayload { type?: string; action: string; path?: string; error?: string }

/** Legacy-shaped view of a UIMessage, for components (ChatInput's
 * useTokenCount) that only need `{id, role, content}` and don't care about
 * tool-call position. */
export function uiMessageToLegacyMessage(chatId: string, message: DevxUIMessage): Message {
  const toolCalls = uiMessageToolCalls(message);
  return {
    id: message.id,
    chat_id: chatId,
    role: message.role === "assistant" ? "assistant" : "user",
    content: uiMessageText(message),
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    created_at: new Date().toISOString(),
  };
}

export function extractUsage(message: DevxUIMessage): { promptTokens?: number; completionTokens?: number } | null {
  const usage = message.metadata?.usage as
    | {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadInputTokens?: number;
        cacheWriteInputTokens?: number;
      }
    | undefined;
  if (!usage) return null;
  // The context-window usage is dominated by cache-read tokens for a caching
  // agent (claude-code); inputTokens alone is just the small non-cached delta
  // per turn and massively understates the context. Sum the cached input so the
  // context indicator reflects the real tokens resident in the window.
  const promptTokens =
    (usage.inputTokens ?? 0) +
    (usage.cacheReadInputTokens ?? 0) +
    (usage.cacheWriteInputTokens ?? 0);
  return {
    promptTokens: promptTokens || usage.inputTokens,
    completionTokens: usage.outputTokens,
  };
}

/** Devx-authored tools whose completion should trigger a preview refresh —
 * copied 1:1 from useMessages.ts's onToolCallEnd (same rationale: Write /
 * Edit / Bash etc. routinely mutate files on disk). Kept here so both the
 * legacy and agents hooks can share one definition without either importing
 * from the other. */
export const FILE_MUTATING_TOOLS = new Set([
  "Write", "Edit", "MultiEdit", "SearchReplace",
  "DeleteFile", "CopyFile", "RenameFile", "NotebookEdit",
  "Bash",
]);
