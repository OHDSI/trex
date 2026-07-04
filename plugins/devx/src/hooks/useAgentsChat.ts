// task-u1: chat client for the ported eve/agents runtime's stateless
// UIMessage endpoint (core/server/agents/service/handler.ts's POST /chat),
// gated behind devx.settings.loop === 'agents' (see ChatPanel.tsx's single
// flag branch point). Parallel to useMessages.ts (the legacy hand-rolled-SSE
// client), not a drop-in replacement of it — the two loops render through
// different components (AgentsChatPanel vs the legacy ChatPanel body)
// because tool-call position is carried natively in `useChat`'s
// `messages[].parts` here, whereas the legacy loop reconstructs position
// from `<!--tool:id-->` markers spliced into a flat content string. Forcing
// both onto one hook/interface would mean re-deriving markers just to throw
// them away again downstream — see task-u1-report.md's "useChat vs custom
// reader" section for the fuller rationale.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import * as api from "@/lib/api";
import { getAuthToken } from "@/lib/api";
import { AGENTS_CHAT_URL } from "@/lib/config";
import type { AgentTodo, BuildAction, QuestionnaireRequest, ChatMode } from "@/lib/types";
import type { VisualEditContext, SelectedComponent } from "@/lib/visual-editing-types";
import {
  type DevxUIMessage,
  storedMessagesToUIMessages,
  uiMessageText,
  uiMessageToolCalls,
  uiMessageToLegacyMessage,
  extractUsage,
  isApprovalRequiredOutput,
  FILE_MUTATING_TOOLS,
} from "@/lib/agentsChat";
import { getToolName, isToolUIPart } from "ai";

interface UseAgentsChatOptions {
  onAppCommand?: (command: string) => void;
  onBuildAction?: (action: BuildAction) => void;
  onModeChange?: (mode: string) => void;
}

// DevxMetadata (agent/lib/context.ts) — mode is omitted (undefined) for
// legacy's "agent" chat mode, matching agent.ts's readMode contract ("no
// mode / unknown mode" -> filterTools allows everything, the same posture
// legacy's own free-form mode has).
function toAgentMode(mode: ChatMode): "ask" | "plan" | "build" | undefined {
  return mode === "ask" || mode === "plan" || mode === "build" ? mode : undefined;
}

function buildContextNote(context?: { visualEdit?: VisualEditContext; selectedComponents?: SelectedComponent[] }): string {
  // Simplification vs. legacy (functions/index.ts:344-393): the server-side
  // loop reads the target file from the app's workspace and inlines a code
  // snippet around the target line. /chat has no equivalent hook for this
  // today, and there's no devx REST call the client could make to compute
  // "N lines around line L" server-side either (getFileContent returns the
  // whole file). Rather than fetch+slice client-side (real fs reads exist,
  // but the risk/complexity of getting line-slicing subtly wrong here isn't
  // worth it for U1), this just names the component/file/line — the ported
  // agent has real Read/Glob tool access and can look at the file itself if
  // it needs to, unlike the legacy raw-text loop. Documented as a deliberate
  // fidelity gap in task-u1-report.md, not an oversight.
  if (!context) return "";
  const notes: string[] = [];
  if (context.visualEdit) {
    notes.push(`Selected component: ${context.visualEdit.componentName} (${context.visualEdit.filePath}:${context.visualEdit.line})`);
  }
  for (const c of context.selectedComponents ?? []) {
    notes.push(`Selected component: ${c.devxName} (${c.filePath}:${c.line})`);
  }
  return notes.length > 0 ? `${notes.join("\n")}\n\n` : "";
}

export function useAgentsChat(
  chatId: string | null,
  mode: ChatMode,
  appId: string | null | undefined,
  options?: UseAgentsChatOptions,
) {
  const [loading, setLoading] = useState(false);
  const [todos, setTodos] = useState<AgentTodo[]>([]);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireRequest | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ promptTokens?: number; completionTokens?: number } | null>(null);
  const [buildActions, setBuildActions] = useState<BuildAction[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);

  // History: task-u1-brief's dual-write posture — devx.messages (read here
  // via the existing REST, same as useMessages.ts) is the single source of
  // truth for chat history across BOTH loops; agents.sessions/turns records
  // the run for the dashboard in parallel (written automatically by /chat
  // itself, nothing this hook does). Seeds useChat's initial `messages` —
  // /chat is stateless, so full history goes out on every request.
  const [history, setHistory] = useState<{ chatId: string | null; seed: DevxUIMessage[]; ready: boolean }>({
    chatId: null,
    seed: [],
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    setHistory({ chatId, seed: [], ready: false });
    setQuestionnaire(null);
    setPlanContent(null);
    setBuildActions([]);
    setPersistError(null);
    if (!chatId) {
      setTodos([]);
      return;
    }
    setLoading(true);
    Promise.all([api.listMessages(chatId), api.getTodos(chatId).catch(() => [] as AgentTodo[])])
      .then(([msgs, chatTodos]) => {
        if (cancelled) return;
        setTodos(chatTodos);
        setHistory({ chatId, seed: storedMessagesToUIMessages(msgs), ready: true });
        setLoading(false);
      })
      .catch((err) => {
        console.error("useAgentsChat: failed to load history:", err);
        if (cancelled) return;
        setHistory({ chatId, seed: [], ready: true });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // metadata/transport: a ref, not a useChat dependency — mode/appId can
  // change without needing to recreate the Chat instance (which would drop
  // in-flight streaming state). Only `chatId` changing recreates the chat
  // (via the `id` below), which is correct: switching chats SHOULD reset to
  // that chat's own history.
  const metadataRef = useRef<{ mode?: "ask" | "plan" | "build"; chatId: string; appId?: string }>({
    chatId: chatId ?? "",
  });
  useEffect(() => {
    metadataRef.current = { mode: toAgentMode(mode), chatId: chatId ?? "", appId: appId ?? undefined };
  }, [mode, chatId, appId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<DevxUIMessage>({
        api: AGENTS_CHAT_URL,
        headers: (): Record<string, string> => {
          const token = getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        body: () => ({ metadata: metadataRef.current }),
      }),
    [],
  );

  // Recreates the underlying Chat instance exactly once per chat switch,
  // and once more when that chat's history finishes loading (so useChat's
  // one-shot `messages` seed sees the real data, not the empty array the
  // fetch above starts from) — see task-u1-report.md for why `id` is the
  // lever: @ai-sdk/react's useChat only re-reads its `messages` init option
  // when `id` changes, not on every render.
  const chatInstanceId = `${chatId ?? "none"}:${history.ready ? "ready" : "pending"}`;

  const seenFileMutationsRef = useRef<Set<string>>(new Set());

  const {
    messages: uiMessages,
    sendMessage,
    stop,
    status,
    error: streamError,
  } = useChat<DevxUIMessage>({
    id: chatInstanceId,
    messages: history.seed,
    transport,
    onData: (dataPart) => {
      const payload = dataPart.data as Record<string, unknown> | undefined;
      switch (dataPart.type) {
        case "data-todos":
          setTodos((payload?.todos as AgentTodo[] | undefined) ?? []);
          break;
        case "data-questionnaire":
          if (payload && typeof payload.requestId === "string") {
            setQuestionnaire({
              requestId: payload.requestId,
              questions: (payload.questions as QuestionnaireRequest["questions"]) ?? [],
            });
          }
          break;
        case "data-plan_update":
          if (payload && typeof payload.content === "string") setPlanContent(payload.content);
          break;
        case "data-plan_exit":
          setQuestionnaire(null);
          if (payload && typeof payload.mode === "string") options?.onModeChange?.(payload.mode);
          break;
        case "data-mode_change":
          if (payload && typeof payload.mode === "string") options?.onModeChange?.(payload.mode);
          break;
        case "data-app_command":
          if (payload && typeof payload.command === "string") options?.onAppCommand?.(payload.command);
          break;
        case "data-build_action": {
          const action: BuildAction = {
            action: (payload?.action as string) ?? "unknown",
            path: payload?.path as string | undefined,
            error: payload?.error as string | undefined,
          };
          setBuildActions((prev) => [...prev, action]);
          options?.onBuildAction?.(action);
          break;
        }
        default:
          // data-subagent_* and anything else: intentionally not emitted on
          // this loop at all (see agentsChat.ts's header comment) or not
          // rendered specially — no-op, not a silently-dropped bug.
          break;
      }
    },
    onFinish: ({ message }) => {
      if (!chatId) return;
      const usage = extractUsage(message);
      if (usage) setTokenUsage(usage);
      const content = uiMessageText(message);
      const toolCalls = uiMessageToolCalls(message);
      api
        .createMessage(chatId, {
          role: "assistant",
          content,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        })
        .catch((err) => {
          console.error("useAgentsChat: failed to persist assistant message:", err);
          setPersistError("Reply generated but failed to save to chat history.");
        });
    },
    onError: (err) => {
      console.error("useAgentsChat: stream error:", err);
    },
  });

  // FILE_MUTATING_TOOLS heuristic (parity with useMessages.ts's
  // onToolCallEnd): fire onBuildAction("file_change") once per tool call id
  // the first time it completes successfully, so the preview panel refreshes
  // after Write/Edit/Bash/etc. — same tool-name set, same rationale.
  useEffect(() => {
    const last = uiMessages.at(-1);
    if (!last || last.role !== "assistant") return;
    for (const part of last.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.state !== "output-available" && part.state !== "output-error") continue;
      if (seenFileMutationsRef.current.has(part.toolCallId)) continue;
      seenFileMutationsRef.current.add(part.toolCallId);
      if (part.state === "output-error") continue;
      if (isApprovalRequiredOutput(part.output)) continue;
      const stripped = getToolName(part).replace(/^mcp__[^_]+__/, "");
      if (FILE_MUTATING_TOOLS.has(stripped)) {
        const action: BuildAction = { action: "file_change" };
        setBuildActions((prev) => [...prev, action]);
        options?.onBuildAction?.(action);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiMessages]);

  const streaming = status === "submitted" || status === "streaming";

  const send = useCallback(
    (prompt: string, context?: { visualEdit?: VisualEditContext; selectedComponents?: SelectedComponent[] }) => {
      if (!chatId || streaming) return;
      const note = buildContextNote(context);
      const text = note ? `${note}${prompt}` : prompt;
      setPersistError(null);
      api.createMessage(chatId, { role: "user", content: text }).catch((err) => {
        console.error("useAgentsChat: failed to persist user message:", err);
        setPersistError("Message sent but failed to save to chat history.");
      });
      void sendMessage({ text });
    },
    [chatId, streaming, sendMessage],
  );

  const cancel = useCallback(() => {
    void stop();
  }, [stop]);

  const answerQuestionnaire = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!chatId || !questionnaire) return;
      try {
        await api.answerQuestionnaire(chatId, questionnaire.requestId, answers);
        setQuestionnaire(null);
      } catch (err) {
        console.error("useAgentsChat: failed to send questionnaire answers:", err);
        setQuestionnaire(null);
        throw err;
      }
    },
    [chatId, questionnaire],
  );

  // Legacy-shaped Message[] mirror — ChatInput's useTokenCount only needs
  // {content}, so an exact interleave-position round trip isn't required
  // here (unlike the live rendering path, see AgentsChatMessage.tsx).
  const legacyMessages = useMemo(
    () => uiMessages.map((m) => uiMessageToLegacyMessage(chatId ?? "", m)),
    [uiMessages, chatId],
  );

  return {
    uiMessages,
    legacyMessages,
    loading,
    streaming,
    error: persistError ?? streamError?.message ?? null,
    todos,
    questionnaire,
    planContent,
    tokenUsage,
    buildActions,
    send,
    cancel,
    answerQuestionnaire,
  };
}
