import { useState, useEffect, useCallback, useRef } from "react";
import type { Message, AgentTodo, ToolCall, ConsentRequest, QuestionnaireRequest, BuildAction } from "@/lib/types";
import type { VisualEditContext } from "@/lib/visual-editing-types";
import type { TagSegment } from "@/lib/devx-tag-parser";
import { parseDevxTags, hasDevxTags } from "@/lib/devx-tag-parser";
import * as api from "@/lib/api";

export function useMessages(chatId: string | null, options?: { onAppCommand?: (command: string) => void; onBuildAction?: (action: BuildAction) => void; onModeChange?: (mode: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState<AgentTodo[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [completedToolCalls, setCompletedToolCalls] = useState<Map<string, ToolCall[]>>(new Map());
  const toolCallsRef = useRef<ToolCall[]>([]);
  const streamingContentRef = useRef("");
  const [completedBuildTags, setCompletedBuildTags] = useState<Map<string, TagSegment[]>>(new Map());
  const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireRequest | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ promptTokens?: number; completionTokens?: number } | null>(null);
  const [buildActions, setBuildActions] = useState<BuildAction[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  useEffect(() => {
    // Abort any in-flight stream when switching chats
    controllerRef.current?.abort();
    setStreaming(false);
    setStreamingContent("");
    setToolCalls([]);
    toolCallsRef.current = [];
    setCompletedToolCalls(new Map());
    setCompletedBuildTags(new Map());
    setConsentRequest(null);
    setQuestionnaire(null);
    setPlanContent(null);
    setBuildActions([]);

    if (!chatId) {
      setMessages([]);
      setTodos([]);
      return;
    }
    setLoading(true);
    // Fetch messages and todos in parallel
    Promise.all([
      api.listMessages(chatId),
      api.getTodos(chatId).catch(() => [] as AgentTodo[]),
    ]).then(([msgs, chatTodos]) => {
      if (chatIdRef.current === chatId) {
        setMessages(msgs);
        setTodos(chatTodos);
        // Restore tool calls from persisted message data
        const tcMap = new Map<string, ToolCall[]>();
        for (const msg of msgs) {
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            tcMap.set(msg.id, msg.tool_calls);
          }
        }
        if (tcMap.size > 0) setCompletedToolCalls(tcMap);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load messages:", err);
      setLoading(false);
    });
  }, [chatId]);

  const send = useCallback(
    async (prompt: string, context?: { visualEdit?: VisualEditContext; selectedComponents?: { devxId: string; devxName: string; filePath: string; line: number }[] }) => {
      if (!chatId || streaming) return;

      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        chat_id: chatId,
        role: "user",
        content: prompt,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);
      setStreamingContent("");
      streamingContentRef.current = "";
      setToolCalls([]);
      setBuildActions([]);
      setError(null);

      const sentChatId = chatId;

      const streamContext = (context?.visualEdit || context?.selectedComponents)
        ? { visualEdit: context?.visualEdit, selectedComponents: context?.selectedComponents }
        : undefined;
      const controller = api.streamChat(sentChatId, prompt, {
        onChunk(chunk) {
          streamingContentRef.current += chunk;
          setStreamingContent((prev) => prev + chunk);
        },
        onDone(_message) {
          // Snapshot current tool calls and streaming content before clearing
          const snapshotToolCalls = [...toolCallsRef.current];
          const snapshotContent = streamingContentRef.current;
          setStreamingContent("");
          setStreaming(false);
          setToolCalls([]);
          setConsentRequest(null);
          setConsentError(null);
          toolCallsRef.current = [];
          streamingContentRef.current = "";
          if (chatIdRef.current !== sentChatId) return;
          api.listMessages(sentChatId).then((data) => {
            if (chatIdRef.current === sentChatId) {
              setMessages(data);
              const lastAssistantMsg = [...data].reverse().find((m) => m.role === "assistant");
              if (lastAssistantMsg) {
                // Associate tool calls with the last assistant message
                if (snapshotToolCalls.length > 0) {
                  setCompletedToolCalls((prev) => {
                    const next = new Map(prev);
                    next.set(lastAssistantMsg.id, snapshotToolCalls);
                    return next;
                  });
                }
                // Associate build tags with the last assistant message
                if (hasDevxTags(snapshotContent)) {
                  const segments = parseDevxTags(snapshotContent);
                  const tags = segments.filter((s): s is TagSegment => s.type === "tag");
                  if (tags.length > 0) {
                    setCompletedBuildTags((prev) => {
                      const next = new Map(prev);
                      next.set(lastAssistantMsg.id, tags);
                      return next;
                    });
                  }
                }
              }
            }
          }).catch(console.error);
        },
        onError(error) {
          console.error("Stream error:", error);
          setStreaming(false);
          setStreamingContent("");
          setConsentRequest(null);
          setConsentError(null);
          // Extract readable message from API error JSON
          let msg = error;
          try {
            const parsed = JSON.parse(error.replace(/^API error \d+: /, ""));
            if (parsed.error) msg = parsed.error;
          } catch { /* use raw message */ }
          // Create a failed assistant message with error shown inline
          const errorMsg: Message = {
            id: `error-${Date.now()}`,
            chat_id: sentChatId,
            role: "assistant",
            content: "",
            error: msg,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errorMsg]);
          setError(null); // Clear top-level error since it's now inline
        },
        onToolCall(toolCall) {
          // Marker is now injected server-side into the content stream
          setToolCalls((prev) => {
            const next = [...prev, toolCall];
            toolCallsRef.current = next;
            return next;
          });
        },
        onToolCallEnd(toolCall) {
          setToolCalls((prev) => {
            const next = prev.map((tc) =>
              tc.callId === toolCall.callId
                ? { ...tc, result: toolCall.result, error: toolCall.error }
                : tc,
            );
            toolCallsRef.current = next;
            return next;
          });
          // Trigger file refresh when agent writes/edits files. Covers our registry,
          // Claude Code SDK built-ins, MCP variants, and Bash (which routinely mutates
          // files via heredocs, npm install, git checkout, etc.).
          const FILE_MUTATING_TOOLS = new Set([
            "Write", "Edit", "MultiEdit", "SearchReplace",
            "DeleteFile", "CopyFile", "RenameFile", "NotebookEdit",
            "Bash",
          ]);
          const stripped = toolCall.name.replace(/^mcp__[^_]+__/, "");
          if (FILE_MUTATING_TOOLS.has(stripped) && !toolCall.error) {
            console.debug("[file-refresh] triggered by tool:", toolCall.name);
            options?.onBuildAction?.({ action: "file_change" });
          }
        },
        onConsentRequest(request) {
          setConsentRequest(request);
        },
        onTodos(newTodos) {
          setTodos(newTodos);
        },
        onQuestionnaire(request) {
          setQuestionnaire(request);
        },
        onPlanUpdate(content) {
          setPlanContent(content);
        },
        onPlanExit() {
          setQuestionnaire(null);
        },
        onModeChange(mode) {
          options?.onModeChange?.(mode);
        },
        onTokenUsage(usage) {
          setTokenUsage(usage);
        },
        onBuildAction(action) {
          setBuildActions((prev) => [...prev, action]);
          options?.onBuildAction?.(action);
        },
        onAppCommand(command) {
          options?.onAppCommand?.(command);
        },
      }, streamContext);

      controllerRef.current = controller;
    },
    [chatId, streaming],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setStreaming(false);
    setStreamingContent("");
    setConsentRequest(null);
  }, []);

  const [consentError, setConsentError] = useState<string | null>(null);

  const resolveConsent = useCallback(
    async (decision: "allow" | "deny" | "always") => {
      if (!chatId || !consentRequest) return;
      setConsentError(null);
      try {
        await api.respondToConsent(chatId, consentRequest.requestId, decision);
        setConsentRequest(null);
      } catch (err: any) {
        const errMsg = err?.message || "";
        let msg: string;
        if (errMsg.includes("429")) {
          msg = "Rate limited — too many requests. Please wait a moment and try again.";
        } else if (errMsg.includes("404")) {
          msg = "Consent request expired or the agent has moved on. This can happen if the server restarted.";
          // Auto-dismiss stale consent after a moment
          setTimeout(() => setConsentRequest(null), 3000);
        } else {
          msg = `Failed to send decision: ${errMsg || "Unknown error"}`;
        }
        setConsentError(msg);
        console.error("Failed to send consent decision:", err);
      }
    },
    [chatId, consentRequest],
  );

  const answerQuestionnaire = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!chatId || !questionnaire) return;
      try {
        await api.answerQuestionnaire(chatId, questionnaire.requestId, answers);
        setQuestionnaire(null);
      } catch (err) {
        console.error("Failed to send questionnaire answers:", err);
        setQuestionnaire(null);
        throw err;
      }
    },
    [chatId, questionnaire],
  );

  return {
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    todos,
    toolCalls,
    completedToolCalls,
    completedBuildTags,
    consentRequest,
    consentError,
    questionnaire,
    planContent,
    tokenUsage,
    buildActions,
    send,
    cancel,
    resolveConsent,
    answerQuestionnaire,
  };
}
