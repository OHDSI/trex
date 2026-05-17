import type { ToolCall } from "@/lib/types";
import { ToolCallCard } from "./tool-cards/ToolCallCard";

interface ToolCallRendererProps {
  toolCalls: ToolCall[];
}

export function ToolCallRenderer({ toolCalls }: ToolCallRendererProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="space-y-1.5 my-2">
      {toolCalls.map((tc) => (
        <ToolCallCard key={tc.callId} toolCall={tc} />
      ))}
    </div>
  );
}
