// task-u1: per-message renderer for the eve/agents runtime's UIMessage
// stream. Deliberately NOT a reuse of ChatMessage.tsx (legacy stays
// byte-untouched, per the brief) — the two loops carry tool-call position
// differently: legacy splices `<!--tool:id-->` markers into a flat content
// string and re-parses them client-side (ChatMessage.tsx's
// InlineToolCallContent); here, `message.parts` already IS the ordered
// interleave of text/tool segments, so this component just walks it. No
// marker plumbing exists on this path to delete because none was ever
// built.
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolCallCard } from "./tool-cards/ToolCallCard";
import { isToolUIPart } from "ai";
import { toolPartToLegacyToolCall, type DevxUIMessage } from "@/lib/agentsChat";

/** Small standalone markdown renderer — intentionally duplicated from
 * ChatMessage.tsx's own (unexported) MarkdownContent rather than exporting
 * that one, so the legacy file needs zero edits for this path to exist. */
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children, ...props }) {
          return (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs" {...props}>
              {children}
            </pre>
          );
        },
        code({ children, className, ...props }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props}>
                {children}
              </code>
            );
          }
          return <code className={className} {...props}>{children}</code>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface AgentsChatMessageProps {
  message: DevxUIMessage;
  isStreaming?: boolean;
}

export const AgentsChatMessage = memo(function AgentsChatMessage({ message, isStreaming }: AgentsChatMessageProps) {
  const isAssistant = message.role === "assistant";

  // Group consecutive text parts into markdown blocks, tool parts into
  // cards, in wire order. step-start / data-* / reasoning / file / source
  // parts carry no rendered content of their own here — step-start has no
  // main-chat equivalent in legacy either (onStep is wired nowhere in
  // useMessages.ts/ChatPanel.tsx), and data-* parts drive the side panels
  // (todos/questionnaire/plan) via useAgentsChat's onData, not inline
  // per-message content.
  const rendered = useMemo(() => {
    const out: Array<{ kind: "text"; text: string; key: string } | { kind: "tool"; key: string; toolCallId: string }> = [];
    let textBuf = "";
    let i = 0;
    const flush = () => {
      const trimmed = textBuf.trim();
      if (trimmed) out.push({ kind: "text", text: trimmed, key: `t-${i++}` });
      textBuf = "";
    };
    for (const part of message.parts) {
      if (part.type === "text") {
        textBuf += part.text;
      } else if (isToolUIPart(part)) {
        flush();
        out.push({ kind: "tool", key: part.toolCallId, toolCallId: part.toolCallId });
      }
      // step-start / data-* / reasoning / file / source-*: no inline
      // content, don't touch textBuf.
    }
    flush();
    return out;
  }, [message.parts]);

  const toolCallsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof toolPartToLegacyToolCall>>();
    for (const part of message.parts) {
      if (isToolUIPart(part)) map.set(part.toolCallId, toolPartToLegacyToolCall(part));
    }
    return map;
  }, [message.parts]);

  if (rendered.length === 0 && !isStreaming) return null;

  return (
    <div className={cn("group flex gap-3 px-4 py-3", isAssistant ? "bg-muted/30" : "")}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background">
        {isAssistant ? <Sparkles className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{isAssistant ? "Assistant" : "You"}</span>
        </div>
        {rendered.map((seg) =>
          seg.kind === "text" ? (
            <div key={seg.key} className="prose prose-sm dark:prose-invert max-w-none break-words text-sm">
              <MarkdownContent content={seg.text} />
            </div>
          ) : (
            <div key={seg.key} className="my-1.5">
              {(() => {
                const tc = toolCallsById.get(seg.toolCallId);
                return tc ? <ToolCallCard toolCall={tc} /> : null;
              })()}
            </div>
          ),
        )}
        {isAssistant && isStreaming && (
          <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50 ml-0.5" />
        )}
      </div>
    </div>
  );
});
