// task-u1: chat panel for the ported eve/agents runtime, rendered by
// ChatPanel.tsx's flag branch point when devx.settings.loop === 'agents'.
// Structurally parallel to ChatPanel.tsx's legacy body (same ChatInput,
// same PlanQuestionnaire, same "no chat selected" empty state) but wired to
// useAgentsChat + AgentsMessagesList instead of useMessages + MessagesList.
import { useEffect } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentsMessagesList } from "./chat/AgentsMessagesList";
import { ChatInput } from "./chat/ChatInput";
import { PlanQuestionnaire } from "./chat/PlanQuestionnaire";
import { useAgentsChat } from "@/hooks/useAgentsChat";
import type { ChatMode } from "@/lib/types";
import type { VisualEditContext, SelectedComponent } from "@/lib/visual-editing-types";

interface AgentsChatPanelProps {
  chatId: string | null;
  mode: ChatMode;
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

export function AgentsChatPanel({
  chatId, mode, appId, onModeChange, onPlanContentChange, visualEditContext, onClearVisualEditContext,
  selectedComponents, onRemoveSelectedComponent, onClearSelectedComponents, onAppCommand, onBuildAction,
  sendRef, onNewChat,
}: AgentsChatPanelProps) {
  const {
    uiMessages,
    legacyMessages,
    streaming,
    todos,
    questionnaire,
    planContent,
    tokenUsage,
    send,
    cancel,
    answerQuestionnaire,
  } = useAgentsChat(chatId, mode, appId, {
    onAppCommand,
    onBuildAction,
    onModeChange: (m) => onModeChange(m as ChatMode),
  });

  useEffect(() => {
    onPlanContentChange?.(planContent ?? null);
  }, [planContent, onPlanContentChange]);

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
      <AgentsMessagesList messages={uiMessages} streaming={streaming} onAction={(msg) => send(msg)} />
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
        // U1 scope: needsApproval tools on the stateless /chat endpoint run
        // to completion and return an "approval required" tool-result
        // instead of pausing for a decision (no session to attach an
        // approval request to) — surfaced inline on the tool call itself
        // (agentsChat.ts's APPROVAL_DEFERRED_MESSAGE), not via this modal.
        // The interactive consent flow (this banner) is U2's job, once
        // devx switches to the session-scoped API.
        consentRequest={null}
        onConsentDecision={() => {}}
        messages={legacyMessages}
        tokenUsage={tokenUsage}
        visualEditContext={visualEditContext}
        onClearVisualEditContext={onClearVisualEditContext}
        selectedComponents={selectedComponents}
        onRemoveSelectedComponent={onRemoveSelectedComponent}
      />
    </div>
  );
}
