import type { ToolCall } from "@/lib/types";

interface ActionButtonsProps {
  toolCalls?: ToolCall[];
  onAction: (message: string) => void;
}

interface ActionRule {
  condition: (toolCalls: ToolCall[]) => boolean;
  label: string;
  message: string;
}

const ACTION_RULES: ActionRule[] = [
  {
    condition: (tc) => tc.some((t) => t.name === "write_plan"),
    label: "Implement this plan",
    message: "Implement the plan",
  },
  {
    condition: (tc) => tc.some((t) => t.name === "web_search"),
    label: "Search more",
    message: "Search the web for more details",
  },
];

const FALLBACK_ACTION = {
  label: "Keep going",
  message: "Keep going",
};

export function ActionButtons({ toolCalls = [], onAction }: ActionButtonsProps) {
  const matched = ACTION_RULES.filter((rule) => rule.condition(toolCalls));
  const actions = matched.length > 0 ? matched : [FALLBACK_ACTION];

  return (
    <div className="flex gap-2 px-4 py-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onAction(action.message)}
          className="border border-border rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
