import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ActionButtons } from "./ActionButtons";
import type { Message, ToolCall, BuildAction } from "@/lib/types";
import type { TagSegment } from "@/lib/devx-tag-parser";

interface MessagesListProps {
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  toolCalls?: ToolCall[];
  completedToolCalls?: Map<string, ToolCall[]>;
  completedBuildTags?: Map<string, TagSegment[]>;
  buildActions?: BuildAction[];
  onAction?: (message: string) => void;
}

export function MessagesList({ messages, streaming, streamingContent, toolCalls = [], completedToolCalls, completedBuildTags, buildActions, onAction }: MessagesListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Track if user is at bottom
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

  // Auto-scroll when new content arrives and user is at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent, toolCalls]);

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
        const msgToolCalls = completedToolCalls?.get(msg.id) || msg.tool_calls || undefined;
        const msgBuildTags = completedBuildTags?.get(msg.id);
        const isLastAssistantMessage = msg.role === "assistant" && !messages.slice(index + 1).some((m) => m.role === "assistant");
        const showActions = isLastAssistantMessage && !streaming && onAction;
        return (
          <div key={msg.id}>
            <ChatMessage message={msg} completedBuildTags={msgBuildTags} completedToolCalls={msgToolCalls} />
            {showActions && (
              <ActionButtons toolCalls={msgToolCalls} onAction={onAction} />
            )}
          </div>
        );
      })}
      {streaming && (
        <ChatMessage
          message={{
            id: "streaming",
            chat_id: "",
            role: "assistant",
            content: "",
            created_at: new Date().toISOString(),
          }}
          isStreaming
          streamingContent={streamingContent}
          completedToolCalls={toolCalls.length > 0 ? toolCalls : undefined}
          buildActions={buildActions}
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
