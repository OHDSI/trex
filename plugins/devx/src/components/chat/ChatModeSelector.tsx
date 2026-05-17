import { Hammer, MessageCircle, Bot, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAT_MODES, type ChatMode } from "@/lib/types";

const MODE_ICONS: Partial<Record<ChatMode, React.ElementType>> = {
  build: Hammer,
  ask: MessageCircle,
  agent: Bot,
  plan: Map,
};

interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export function ChatModeSelector({ mode, onChange, disabled }: ChatModeSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {CHAT_MODES.map((m) => {
        const Icon = MODE_ICONS[m.id] || MessageCircle;
        const isActive = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            title={m.description}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              disabled && "opacity-50 cursor-not-allowed",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
