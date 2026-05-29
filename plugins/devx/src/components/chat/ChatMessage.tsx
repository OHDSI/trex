import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Copy, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Message, BuildAction, ToolCall } from "@/lib/types";
import { stripDevxTags } from "@/lib/build-tags";
import { parseDevxTags, hasDevxTags } from "@/lib/devx-tag-parser";
import { DevxActionCard } from "./DevxActionCard";
import { ToolCallCard } from "./tool-cards/ToolCallCard";
import { StreamingLoader } from "./StreamingLoader";
import type { Segment, TagSegment } from "@/lib/devx-tag-parser";

const TOOL_MARKER_RE = /<!--tool:(.+?)-->/;
const TOOL_MARKER_RE_G = /<!--tool:(.+?)-->/g;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
  /** Tags saved from streaming phase, rendered on completed messages */
  completedBuildTags?: TagSegment[];
  /** Tool calls associated with this completed message */
  completedToolCalls?: ToolCall[];
  /** Live build actions arriving during streaming (one per completed file op) */
  buildActions?: BuildAction[];
}

/**
 * Check if a build action corresponds to a tag segment.
 * Server sends: file_written→devx-write, file_deleted→devx-delete,
 * file_renamed→devx-rename, dependency_installed→devx-add-dependency
 */
function isTagCompleted(tag: TagSegment, actions: BuildAction[]): boolean {
  for (const a of actions) {
    switch (a.action) {
      case "file_written":
        if (tag.tagType === "devx-write" && a.path === tag.attrs.file_path) return true;
        break;
      case "file_deleted":
        if (tag.tagType === "devx-delete" && a.path === tag.attrs.file_path) return true;
        break;
      case "file_renamed":
        if (tag.tagType === "devx-rename") {
          const expected = `${tag.attrs.old_file_path} → ${tag.attrs.new_file_path}`;
          if (a.path === expected) return true;
        }
        break;
      case "dependency_installed":
        if (tag.tagType === "devx-add-dependency") return true;
        break;
    }
    // Error variants (e.g. "write_error")
    if (a.error) {
      if (tag.tagType === "devx-write" && a.path === tag.attrs.file_path) return true;
      if (tag.tagType === "devx-delete" && a.path === tag.attrs.file_path) return true;
    }
  }
  return false;
}

function isTagErrored(tag: TagSegment, actions: BuildAction[]): boolean {
  return actions.some(
    (a) =>
      a.error &&
      ((tag.tagType === "devx-write" && a.path === tag.attrs.file_path) ||
        (tag.tagType === "devx-delete" && a.path === tag.attrs.file_path) ||
        (tag.tagType === "devx-rename" &&
          a.path === `${tag.attrs.old_file_path} → ${tag.attrs.new_file_path}`) ||
        (tag.tagType === "devx-add-dependency" && a.action.includes("dependency"))),
  );
}

function getTagState(
  tag: TagSegment,
  buildActions: BuildAction[] | undefined,
): "pending" | "finished" | "aborted" {
  if (tag.inProgress) return "pending";
  if (!buildActions || buildActions.length === 0) return "pending";
  if (isTagErrored(tag, buildActions)) return "aborted";
  if (isTagCompleted(tag, buildActions)) return "finished";
  return "pending";
}

/** Markdown renderer shared between plain and segmented rendering */
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

/** Render parsed segments as interleaved markdown + action cards */
function SegmentedContent({
  segments,
  buildActions,
}: {
  segments: Segment[];
  buildActions?: BuildAction[];
}) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "markdown") {
          const trimmed = seg.content.trim();
          if (!trimmed) return null;
          return (
            <div key={i} className="prose prose-sm dark:prose-invert max-w-none break-words text-sm">
              <MarkdownContent content={trimmed} />
            </div>
          );
        }
        // Skip chat-summary and command tags from display
        if (seg.tagType === "devx-chat-summary" || seg.tagType === "devx-command") {
          return null;
        }
        const state = getTagState(seg, buildActions);
        return <DevxActionCard key={i} tag={seg} state={state} />;
      })}
    </>
  );
}

/** Render content with tool calls interleaved at their invocation positions */
function InlineToolCallContent({
  content,
  toolCalls,
}: {
  content: string;
  toolCalls: ToolCall[];
}) {
  const toolCallMap = useMemo(() => {
    const map = new Map<string, ToolCall>();
    for (const tc of toolCalls) map.set(tc.callId, tc);
    return map;
  }, [toolCalls]);

  type InlinePart =
    | { type: "markdown"; text: string }
    | { type: "tool"; tc: ToolCall }
    | { type: "tool_loading"; callId: string };

  const parts = useMemo<InlinePart[]>(() => {
    const result: InlinePart[] = [];
    let lastIndex = 0;
    const re = new RegExp(TOOL_MARKER_RE_G.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const before = stripDevxTags(content.slice(lastIndex, match.index)).trim();
      if (before) result.push({ type: "markdown", text: before });
      const tc = toolCallMap.get(match[1]);
      if (tc) {
        result.push({ type: "tool", tc });
      } else {
        result.push({ type: "tool_loading", callId: match[1] });
      }
      lastIndex = re.lastIndex;
    }
    const remaining = stripDevxTags(content.slice(lastIndex)).trim();
    if (remaining) result.push({ type: "markdown", text: remaining });
    return result;
  }, [content, toolCallMap]);

  return (
    <>
      {parts.map((part, i) =>
        part.type === "markdown" ? (
          <div key={i} className="prose prose-sm dark:prose-invert max-w-none break-words text-sm">
            <MarkdownContent content={part.text} />
          </div>
        ) : part.type === "tool" ? (
          <ToolCallCard key={part.tc.callId} toolCall={part.tc} />
        ) : (
          <div key={part.callId} className="flex items-center gap-2 my-1.5 rounded-md border bg-muted/50 px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Running tool...</span>
          </div>
        ),
      )}
    </>
  );
}

/** Render saved build tags on a completed message */
function CompletedBuildTags({ tags }: { tags: TagSegment[] }) {
  return (
    <div className="mt-2">
      {tags.map((tag, i) => {
        if (tag.tagType === "devx-chat-summary" || tag.tagType === "devx-command") {
          return null;
        }
        return <DevxActionCard key={i} tag={tag} state="finished" />;
      })}
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
  streamingContent,
  completedBuildTags,
  completedToolCalls,
  buildActions,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === "assistant";
  const rawContent = isStreaming ? streamingContent || "" : message.content;

  // For streaming: parse tags into segments for inline cards
  // For completed messages (from DB): tags are already stripped, render plain markdown
  const useInlineTags = isAssistant && isStreaming && hasDevxTags(rawContent);
  const segments = useMemo(
    () => (useInlineTags ? parseDevxTags(rawContent) : []),
    [useInlineTags, rawContent],
  );
  // Strip legacy bracket notation from older user messages (e.g. "[Visual edit target: ...]")
  const cleanedContent = isAssistant ? rawContent : rawContent
    .replace(/^\[Visual edit target: [^\]]+\]\n?/, "")
    .replace(/^\[Selected components: [^\]]+\]\n?/, "");
  const content = useInlineTags ? "" : (isAssistant ? stripDevxTags(cleanedContent) : cleanedContent);
  const hasToolMarkers = TOOL_MARKER_RE.test(content);
  // Strip tool markers for display — only when not rendering inline
  const contentWithoutMarkers = content.replace(TOOL_MARKER_RE_G, "").trim();

  const handleCopy = async () => {
    const textToCopy = isAssistant ? stripDevxTags(rawContent) : rawContent;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasBuildTags = completedBuildTags && completedBuildTags.length > 0;
  const hasToolCalls = completedToolCalls && completedToolCalls.length > 0;

  if (!content && !useInlineTags && !isStreaming && !message.error && !hasBuildTags && !hasToolCalls) return null;

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-3",
        isAssistant ? "bg-muted/30" : "",
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background">
        {isAssistant ? (
          <Bot className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">
            {isAssistant ? "Assistant" : "You"}
          </span>
          {isAssistant && isStreaming && (
            <Badge variant="default" className="bg-blue-500 text-white text-[10px] px-1.5 py-0">
              Generating
            </Badge>
          )}
          {isAssistant && !isStreaming && message.error && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Failed
            </Badge>
          )}
          {message.model && (
            <span className="text-xs text-muted-foreground">{message.model}</span>
          )}
          {message.tokens != null && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {message.tokens} tokens
            </span>
          )}
          <span
            className="text-[10px] text-muted-foreground/60"
            title={formatRelativeTime(message.created_at)}
          >
            {formatRelativeTime(message.created_at)}
          </span>
        </div>
        {message.error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message.error}
          </div>
        )}
        {useInlineTags ? (
          <>
            <SegmentedContent segments={segments} buildActions={buildActions} />
            {isStreaming && (
              <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50 ml-0.5" />
            )}
          </>
        ) : isAssistant && hasToolMarkers && hasToolCalls ? (
          /* Render tool calls inline at their marker positions (streaming + completed) */
          <>
            <InlineToolCallContent content={content} toolCalls={completedToolCalls!} />
            {isStreaming && (
              <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50 ml-0.5" />
            )}
          </>
        ) : contentWithoutMarkers ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm">
            {isAssistant ? (
              <>
                <MarkdownContent content={contentWithoutMarkers} />
                {isStreaming && (
                  <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/50 ml-0.5" />
                )}
              </>
            ) : (
              <p className="whitespace-pre-wrap">{contentWithoutMarkers}</p>
            )}
          </div>
        ) : null}
        {!contentWithoutMarkers && !useInlineTags && isStreaming && !hasToolCalls && !hasToolMarkers && (
          <StreamingLoader />
        )}
        {/* Fallback: show tool calls below text only for messages without inline markers */}
        {hasToolCalls && !hasToolMarkers && (
          <div className="space-y-1.5 my-2">
            {completedToolCalls!.map((tc) => (
              <ToolCallCard key={tc.callId} toolCall={tc} />
            ))}
          </div>
        )}
        {/* Completed build tags — persisted from streaming phase */}
        {!isStreaming && hasBuildTags && (
          <CompletedBuildTags tags={completedBuildTags} />
        )}
        {isAssistant && !isStreaming && (content || hasBuildTags) && (
          <button
            onClick={handleCopy}
            className="mt-1 text-muted-foreground hover:text-foreground transition-opacity"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
});
