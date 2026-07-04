// task-u1/u2: chat client for the ported eve/agents runtime, gated behind
// devx.settings.loop === 'agents' (see ChatPanel.tsx's single flag branch
// point). U1 shipped this against the stateless /chat endpoint (useChat +
// DefaultChatTransport); U2 replaces the transport with the eve/v1 session
// API (POST /eve/v1/session, follow-up POSTs, GET .../stream NDJSON tail,
// POST .../approval) so `needsApproval` tools actually pause mid-turn for a
// live decision instead of erroring out (see lib/agentsSession.ts's header
// comment and task-u2-report.md's evidence table for why). useChat itself is
// no longer usable here: it speaks the AI SDK's UIMessage wire protocol,
// which the session API does not implement — this hook hand-rolls the
// stream reader instead, the same shape as
// plugins/web/src/pages/admin/AgentRunDetail.tsx's live tail. The output
// shape (DevxUIMessage / legacy Message mirrors) is UNCHANGED from U1, so
// every downstream renderer (AgentsMessagesList, AgentsChatMessage,
// ToolCallCard) needed zero changes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToolName, isToolUIPart } from "ai";
import * as api from "@/lib/api";
import { getAuthToken } from "@/lib/api";
import { AGENTS_SESSION_URL } from "@/lib/config";
import type { AgentTodo, BuildAction, ChatMode, ConsentRequest } from "@/lib/types";
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
import {
  type SessionChatState,
  initialSessionState,
  reduceSessionEvent,
  parseSessionEvent,
  loadCachedSessionId,
  saveCachedSessionId,
} from "@/lib/agentsSession";

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
  // snippet around the target line. The ported agent has real Read/Glob tool
  // access and can look at the file itself if it needs to — see U1's report
  // for the fuller rationale (unchanged by U2).
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

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    "content-type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function useAgentsChat(
  chatId: string | null,
  mode: ChatMode,
  appId: string | null | undefined,
  options?: UseAgentsChatOptions,
) {
  const [loading, setLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionChatState>(() => initialSessionState([]));

  // History: devx.messages (read here via the existing REST, same as
  // useMessages.ts) is still the single source of truth for chat history
  // across BOTH loops, and how this hook seeds its local state on chat
  // switch/reload — the session API has no "give me the full history"
  // endpoint of its own (it only accepts one new message per turn; its own
  // memory is scoped to whichever agents.sessions row the turn runs under,
  // see agentsSession.ts's session-id-cache comment).
  useEffect(() => {
    let cancelled = false;
    setSessionState(initialSessionState([]));
    setPersistError(null);
    if (!chatId) return;
    setLoading(true);
    Promise.all([api.listMessages(chatId), api.getTodos(chatId).catch(() => [] as AgentTodo[])])
      .then(([msgs, chatTodos]) => {
        if (cancelled) return;
        setSessionState((prev) => ({ ...initialSessionState(storedMessagesToUIMessages(msgs)), todos: chatTodos, pendingApproval: prev.pendingApproval }));
        setLoading(false);
      })
      .catch((err) => {
        console.error("useAgentsChat: failed to load history:", err);
        if (cancelled) return;
        setSessionState(initialSessionState([]));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // metadata: a ref, not a dependency of send/ensureStream — mode/appId can
  // change without needing to tear down an in-flight turn.
  const metadataRef = useRef<{ mode?: "ask" | "plan" | "build"; chatId: string; appId?: string }>({
    chatId: chatId ?? "",
  });
  useEffect(() => {
    metadataRef.current = { mode: toAgentMode(mode), chatId: chatId ?? "", appId: appId ?? undefined };
  }, [mode, chatId, appId]);

  // Session lifecycle: one agents.sessions row per devx chat, reused across
  // turns (and page reloads, via the localStorage cache) so runner.ts's
  // historyForModel sees prior turns. `streamController` guards against
  // opening a second concurrent tail for the same session (send() and the
  // eager reconnect-on-load effect below could otherwise race).
  const sessionIdRef = useRef<string | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);
  const seenFileMutationsRef = useRef<Set<string>>(new Set());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const persistAssistantMessage = useCallback(
    (message: DevxUIMessage) => {
      if (!chatId) return;
      const usage = extractUsage(message);
      const content = uiMessageText(message);
      const toolCalls = uiMessageToolCalls(message);
      api
        .createMessage(chatId, { role: "assistant", content, tool_calls: toolCalls.length > 0 ? toolCalls : undefined })
        .catch((err) => {
          console.error("useAgentsChat: failed to persist assistant message:", err);
          setPersistError("Reply generated but failed to save to chat history.");
        });
      // FILE_MUTATING_TOOLS heuristic (parity with useMessages.ts/U1): fire
      // onBuildAction("file_change") once per successfully-completed
      // mutating tool call so the preview panel refreshes.
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.state !== "output-available") continue;
        if (seenFileMutationsRef.current.has(part.toolCallId)) continue;
        seenFileMutationsRef.current.add(part.toolCallId);
        if (isApprovalRequiredOutput(part.output)) continue;
        const stripped = getToolName(part).replace(/^mcp__[^_]+__/, "");
        if (FILE_MUTATING_TOOLS.has(stripped)) {
          optionsRef.current?.onBuildAction?.({ action: "file_change" });
        }
      }
      if (usage) setSessionState((prev) => ({ ...prev, tokenUsage: usage }));
    },
    [chatId],
  );

  // Consumes one session's NDJSON tail until it ends/errors/is aborted.
  // Race-free approval ordering (see task-u2-report.md): the caller MUST
  // await this function's promise resolving PAST the initial `fetch` (i.e.
  // await `ensureStreamOpen`, not this function directly) before POSTing any
  // message that starts a turn — the server subscribes to the session's live
  // event bus synchronously while constructing the stream Response, so by
  // the time `fetch()`'s promise resolves, no `input.requested` (or any
  // other live-only event) emitted after that point can be missed.
  const consumeStream = useCallback(
    async (sessionId: string, res: Response) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const event = parseSessionEvent(line);
            if (!event) continue;
            let finishedMessage: DevxUIMessage | null = null;
            setSessionState((prev) => {
              const { state: next, effects } = reduceSessionEvent(prev, event);
              if (effects.appCommand) optionsRef.current?.onAppCommand?.(effects.appCommand);
              if (effects.buildAction) optionsRef.current?.onBuildAction?.(effects.buildAction);
              if (effects.modeChange) optionsRef.current?.onModeChange?.(effects.modeChange);
              if (event.type === "turn.completed") {
                finishedMessage = next.messages.find((m) => m.id === event.data.turnId) ?? null;
              }
              return next;
            });
            if (finishedMessage) persistAssistantMessage(finishedMessage);
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("useAgentsChat: session stream dropped", sessionId, err);
        }
      }
    },
    [persistAssistantMessage],
  );

  // `streamOpenPromiseRef` serializes concurrent callers (the eager
  // reconnect-on-load effect below and `send()` can both call this for the
  // same session): without it, two callers racing before either's `fetch`
  // resolves would each see `streamControllerRef.current` still null and
  // open a SECOND parallel connection — not just wasteful, but a
  // correctness bug, since every event would then be reduced twice (once
  // per connection) into session state.
  const streamOpenPromiseRef = useRef<Promise<void> | null>(null);

  const ensureStreamOpen = useCallback(
    (sessionId: string): Promise<void> => {
      if (streamControllerRef.current) return Promise.resolve();
      if (streamOpenPromiseRef.current) return streamOpenPromiseRef.current;
      const opening = (async () => {
        const controller = new AbortController();
        const token = getAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${AGENTS_SESSION_URL}/${sessionId}/stream`, { headers, signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`session stream failed (${res.status})`);
        streamControllerRef.current = controller;
        void consumeStream(sessionId, res).finally(() => {
          if (streamControllerRef.current === controller) streamControllerRef.current = null;
        });
      })();
      streamOpenPromiseRef.current = opening.finally(() => {
        streamOpenPromiseRef.current = null;
      });
      return streamOpenPromiseRef.current;
    },
    [consumeStream],
  );

  // Reconnect eagerly when a chat with a cached session loads: a turn or a
  // pending approval may already be in flight from before a reload (best
  // effort only — `input.requested` is a live-only event with no replay, so
  // a pending approval from before this reload cannot be recovered here; the
  // server's own approvalTimeoutMs eventually resolves it as "timed out" —
  // see task-u2-report.md's residual-risk note. Ordinary in-progress text
  // and tool-call/result events DO replay correctly).
  useEffect(() => {
    if (!chatId) return;
    const cached = loadCachedSessionId(chatId);
    if (cached) {
      sessionIdRef.current = cached;
      ensureStreamOpen(cached).catch((err) => console.warn("useAgentsChat: reconnect failed", err));
    } else {
      sessionIdRef.current = null;
    }
    return () => {
      streamControllerRef.current?.abort();
      streamControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const streaming = sessionState.turnActive;

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
      setSessionState((prev) => ({
        ...prev,
        turnError: null,
        messages: [...prev.messages, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }],
      }));

      void (async () => {
        try {
          let sessionId = sessionIdRef.current;
          if (!sessionId) {
            // Created WITHOUT `message` on purpose: the stream must be
            // subscribed BEFORE the turn starts (see consumeStream's
            // comment) — creating-with-message would race the fire-and-
            // forget turn against our not-yet-open GET stream.
            const createRes = await fetch(AGENTS_SESSION_URL, { method: "POST", headers: authHeaders(), body: "{}" });
            if (!createRes.ok) throw new Error(`session create failed (${createRes.status})`);
            const body = await createRes.json();
            sessionId = body.sessionId as string;
            sessionIdRef.current = sessionId;
            if (chatId) saveCachedSessionId(chatId, sessionId);
          }
          await ensureStreamOpen(sessionId);
          const followUp = await fetch(`${AGENTS_SESSION_URL}/${sessionId}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ message: text, metadata: metadataRef.current }),
          });
          if (!followUp.ok) throw new Error(`send failed (${followUp.status})`);
        } catch (err) {
          console.error("useAgentsChat: send failed:", err);
          setSessionState((prev) => ({ ...prev, turnError: err instanceof Error ? err.message : "send failed" }));
        }
      })();
    },
    [chatId, streaming, ensureStreamOpen],
  );

  // No server-side turn-cancellation endpoint exists on the session API
  // (startTurn is fire-and-forget, unlike /chat's request-scoped stream) —
  // this can only stop the CLIENT from watching the turn, not the turn
  // itself. Documented gap, not a bug: see task-u2-report.md's evidence
  // table ("risk" row).
  const cancel = useCallback(() => {
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setSessionState((prev) => ({ ...prev, turnActive: false }));
  }, []);

  const respondToConsent = useCallback(
    async (decision: "allow" | "deny" | "always") => {
      const sessionId = sessionIdRef.current;
      const pending = sessionState.pendingApproval;
      if (!sessionId || !pending) return;
      const wire = decision === "allow" ? "approve" : decision;
      setConsentError(null);
      try {
        const res = await fetch(`${AGENTS_SESSION_URL}/${sessionId}/approval`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ requestId: pending.requestId, decision: wire }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setConsentError(body?.error ?? `approval failed (${res.status})`);
          return;
        }
        // The already-open stream's next `action.result` clears
        // pendingApproval (see reduceSessionEvent) — no local mutation
        // needed here beyond letting the live tail do its job.
      } catch (err) {
        console.error("useAgentsChat: approval decision failed:", err);
        setConsentError(err instanceof Error ? err.message : "approval failed");
      }
    },
    [sessionState.pendingApproval],
  );

  const answerQuestionnaire = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!chatId || !sessionState.questionnaire) return;
      try {
        await api.answerQuestionnaire(chatId, sessionState.questionnaire.requestId, answers);
        setSessionState((prev) => ({ ...prev, questionnaire: null }));
      } catch (err) {
        console.error("useAgentsChat: failed to send questionnaire answers:", err);
        setSessionState((prev) => ({ ...prev, questionnaire: null }));
        throw err;
      }
    },
    [chatId, sessionState.questionnaire],
  );

  // Legacy-shaped Message[] mirror — ChatInput's useTokenCount only needs
  // {content}, so an exact interleave-position round trip isn't required
  // here (unlike the live rendering path, see AgentsChatMessage.tsx).
  const legacyMessages = useMemo(
    () => sessionState.messages.map((m) => uiMessageToLegacyMessage(chatId ?? "", m)),
    [sessionState.messages, chatId],
  );

  const consentRequest: ConsentRequest | null = sessionState.pendingApproval;
  useEffect(() => {
    if (consentRequest) setConsentError(null);
    // Only the identity of the pending request matters here, not the whole
    // (freshly-derived-every-render) object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentRequest?.requestId]);

  return {
    uiMessages: sessionState.messages,
    legacyMessages,
    loading,
    streaming,
    error: persistError ?? sessionState.turnError,
    todos: sessionState.todos,
    questionnaire: sessionState.questionnaire,
    planContent: sessionState.planContent,
    tokenUsage: sessionState.tokenUsage,
    buildActions: sessionState.buildActions,
    consentRequest,
    consentError,
    send,
    cancel,
    answerQuestionnaire,
    respondToConsent,
  };
}
