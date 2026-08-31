import { AgentsChatPanel } from "./AgentsChatPanel";
import type { ChatMode } from "@/lib/types";
import type { VisualEditContext, SelectedComponent } from "@/lib/visual-editing-types";

interface ChatPanelProps {
  chatId: string | null;
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

// Every provider now runs on the agents loop (Phase 4 Task 2) — the
// devx.settings.loop flag and its sidecar-provider carve-out are gone, so
// this is a plain pass-through rather than a router.
export function ChatPanel(props: ChatPanelProps) {
  return <AgentsChatPanel {...props} mode={props.mode ?? "agent"} appId={props.appId} />;
}
