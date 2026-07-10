// task-u1: parallel to MessagesList.tsx, for the eve/agents runtime's
// UIMessage[] shape instead of the legacy Message[] shape. Kept separate
// (rather than teaching MessagesList to branch on a union type) so the
// legacy list stays byte-untouched.
import { useEffect, useRef } from "react";
import { AgentsChatMessage } from "./AgentsChatMessage";
import { ActionButtons } from "./ActionButtons";
import { uiMessageToolCalls, type DevxUIMessage } from "@/lib/agentsChat";

interface AgentsMessagesListProps {
  messages: DevxUIMessage[];
  streaming: boolean;
  onAction?: (message: string) => void;
}

export function AgentsMessagesList({ messages, streaming, onAction }: AgentsMessagesListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const lastMessage = messages.at(-1);
  const isLastAssistant = lastMessage?.role === "assistant";

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {messages.length === 0 && !streaming && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm">Send a message to begin</p>
          </div>
        </div>
      )}
      {messages.map((msg, index) => {
        const isStreamingThis = streaming && index === messages.length - 1 && msg.role === "assistant";
        return <AgentsChatMessage key={msg.id} message={msg} isStreaming={isStreamingThis} />;
      })}
      {isLastAssistant && !streaming && onAction && (
        <ActionButtons toolCalls={uiMessageToolCalls(lastMessage)} onAction={onAction} />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
