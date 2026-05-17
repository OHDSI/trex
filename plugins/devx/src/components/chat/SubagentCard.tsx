import { useState } from "react";
import { ChevronDown, ChevronRight, Bot, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface SubagentCardProps {
  agentName: string;
  task: string;
  status: "running" | "completed" | "failed";
  content?: string;
  error?: string;
}

export function SubagentCard({
  agentName,
  task,
  status,
  content,
  error,
}: SubagentCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
    completed: <CheckCircle className="w-4 h-4 text-green-400" />,
    failed: <XCircle className="w-4 h-4 text-red-400" />,
  }[status];

  return (
    <div className="my-2 border border-[var(--color-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm
                   bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]
                   transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
        )}
        <Bot className="w-4 h-4 text-blue-400" />
        <span className="font-medium text-[var(--color-text-primary)]">
          {agentName}
        </span>
        <span className="text-[var(--color-text-secondary)] truncate flex-1 text-left">
          {task.length > 80 ? task.slice(0, 80) + "..." : task}
        </span>
        {statusIcon}
      </button>

      {expanded && (
        <div className="px-3 py-2 text-sm text-[var(--color-text-secondary)]
                        border-t border-[var(--color-border)]
                        bg-[var(--color-bg-primary)] max-h-96 overflow-y-auto">
          {error ? (
            <p className="text-red-400">{error}</p>
          ) : content ? (
            <pre className="whitespace-pre-wrap font-mono text-xs">{content}</pre>
          ) : (
            <p className="italic">Running...</p>
          )}
        </div>
      )}
    </div>
  );
}
