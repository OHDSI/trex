import { useEffect } from "react";
import { MessageSquarePlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessagesList } from "./chat/MessagesList";
import { ChatInput } from "./chat/ChatInput";
import { PlanQuestionnaire } from "./chat/PlanQuestionnaire";
import { useMessages } from "@/hooks/useMessages";
import { useEffectiveLoop } from "@/hooks/useEffectiveLoop";
import { AgentsChatPanel } from "./AgentsChatPanel";
import type { ChatMode } from "@/lib/types";
import type { VisualEditContext, SelectedComponent } from "@/lib/visual-editing-types";

interface ChatPanelProps {
  chatId: string | null;
  // task-u1: only consumed by the agents-loop branch below (metadata.mode/
  // appId for the stateless /chat endpoint) — the legacy loop derives mode
  // server-side from the chat row and never needed these client-side.
  mode?: ChatMode;
  appId?: string | null;
  onModeChange: (mode: ChatMode) => void;
  onPlanContentChange?: (content: string | null) => void;
  visualEditContext?: VisualEditContext | null;
  onClearVisualEditContext?: () => void;
  selectedComponents?: SelectedComponent[];
  onRemoveSelectedComponent?: (devxId: string) => void;
  onClearSelectedComponents?: () => void;
  onAppCommand?: (command: string) => void;
  onBuildAction?: (action: import("@/lib/types").BuildAction) => void;
  sendRef?: React.MutableRefObject<((msg: string) => void) | null>;
  onNewChat?: () => void;
}

// task-u1: the single flag branch point (task-u1-brief.md's Requirement 4).
// devx.settings.loop === 'agents' (and no claude-code provider
// override — see useEffectiveLoop.ts) renders AgentsChatPanel; everything
// else renders LegacyChatPanel below, whose body is byte-for-byte what
// ChatPanel used to be before this task (see git history) — same hook
// (useMessages), same components, same behavior. The "loading" state gates
// against a one-render flash of the legacy UI before the settings/provider
// fetch completes: renders nothing (same posture as the loading gate every
// other devx page already uses) rather than mount-then-possibly-remount
// into the agents loop, which would otherwise start a stream against the
// wrong endpoint for a moment on every chat open. "error" (settings/provider
// could not be read at all) must not guess a loop — it renders a retryable
// error instead.
export function ChatPanel(props: ChatPanelProps) {
  const loopState = useEffectiveLoop();
  if (loopState.status === "loading") return null;
  if (loopState.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Couldn't load chat settings.</p>
        <Button variant="outline" size="sm" onClick={loopState.retry}>Retry</Button>
      </div>
    );
  }
  if (loopState.loop === "agents") {
    return (
      <AgentsChatPanel
        {...props}
        mode={props.mode ?? "agent"}
        appId={props.appId}
      />
    );
  }
  return <LegacyChatPanel {...props} />;
}

function LegacyChatPanel({ chatId, onModeChange, onPlanContentChange, visualEditContext, onClearVisualEditContext, selectedComponents, onRemoveSelectedComponent, onClearSelectedComponents, onAppCommand, onBuildAction, sendRef, onNewChat }: ChatPanelProps) {
  const {
    messages,
    streaming,
    streamingContent,
    error: _error,
    todos,
    toolCalls,
    completedToolCalls,
    completedBuildTags,
    buildActions,
    consentRequest,
    consentError,
    questionnaire,
    planContent,
    tokenUsage,
    send,
    cancel,
    resolveConsent,
    answerQuestionnaire,
  } = useMessages(chatId, { onAppCommand, onBuildAction, onModeChange: (m) => onModeChange(m as ChatMode) });

  // Propagate plan content to parent for preview panel
  useEffect(() => {
    onPlanContentChange?.(planContent ?? null);
  }, [planContent, onPlanContentChange]);

  // Expose send function to parent for fix prompts
  useEffect(() => {
    if (sendRef) sendRef.current = send;
    return () => { if (sendRef) sendRef.current = null; };
  }, [send, sendRef]);

  if (!chatId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquarePlus className="h-10 w-10 opacity-30" />
        <p className="text-sm">No chat selected</p>
        {onNewChat && (
          <Button onClick={onNewChat} variant="outline" size="sm" className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            Start a new chat
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MessagesList
        messages={messages}
        streaming={streaming}
        streamingContent={streamingContent}
        toolCalls={toolCalls}
        completedToolCalls={completedToolCalls}
        completedBuildTags={completedBuildTags}
        buildActions={buildActions}
        onAction={(msg) => send(msg)}
      />
      {questionnaire && (
        <PlanQuestionnaire
          questionnaire={questionnaire}
          onAnswer={answerQuestionnaire}
          onDismiss={() => answerQuestionnaire({})}
        />
      )}
      <ChatInput
        onSend={(message) => {
          send(message, {
            visualEdit: visualEditContext || undefined,
            selectedComponents: selectedComponents && selectedComponents.length > 0 ? selectedComponents : undefined,
          });
          onClearVisualEditContext?.();
          onClearSelectedComponents?.();
        }}
        onCancel={cancel}
        streaming={streaming}
        disabled={!chatId}
        todos={todos}
        consentRequest={consentRequest}
        consentError={consentError}
        onConsentDecision={resolveConsent}
        messages={messages}
        tokenUsage={tokenUsage}
        visualEditContext={visualEditContext}
        onClearVisualEditContext={onClearVisualEditContext}
        selectedComponents={selectedComponents}
        onRemoveSelectedComponent={onRemoveSelectedComponent}
      />
    </div>
  );
}
