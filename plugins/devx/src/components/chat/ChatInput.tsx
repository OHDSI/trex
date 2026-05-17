import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, Paperclip, X, BarChart3, Paintbrush, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatModeSelector } from "./ChatModeSelector";
import { TodoList } from "./TodoList";
import { AgentConsentBanner } from "./AgentConsentBanner";
import { TokenBar } from "./TokenBar";
import { VoiceInput } from "./VoiceInput";
import { SlashCommandPopup } from "./SlashCommandPopup";
import { useTokenCount } from "@/hooks/useTokenCount";
import { useSlashCommands } from "@/hooks/useSlashCommands";
import type { ChatMode, AgentTodo, ConsentRequest, Message, SlashCompletion } from "@/lib/types";
import type { VisualEditContext, SelectedComponent } from "@/lib/visual-editing-types";

interface AttachmentFile {
  id: string;
  name: string;
  size: number;
  file: File;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: AttachmentFile[]) => void;
  onCancel: () => void;
  streaming: boolean;
  disabled?: boolean;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  todos: AgentTodo[];
  consentRequest: ConsentRequest | null;
  consentError?: string | null;
  onConsentDecision: (decision: "allow" | "deny" | "always") => void;
  messages: Message[];
  tokenUsage?: { promptTokens?: number; completionTokens?: number } | null;
  visualEditContext?: VisualEditContext | null;
  onClearVisualEditContext?: () => void;
  selectedComponents?: SelectedComponent[];
  onRemoveSelectedComponent?: (devxId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatInput({
  onSend,
  onCancel,
  streaming,
  disabled,
  mode,
  onModeChange,
  todos,
  consentRequest,
  consentError,
  onConsentDecision,
  messages,
  tokenUsage,
  visualEditContext,
  onClearVisualEditContext,
  selectedComponents,
  onRemoveSelectedComponent,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showTokenBar, setShowTokenBar] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [showSlash, setShowSlash] = useState(false);
  const slash = useSlashCommands();

  const tokenCounts = useTokenCount(
    messages,
    input,
    tokenUsage ?? undefined,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Prefill input when visual edit context is set
  const prevContextRef = useRef(visualEditContext);
  useEffect(() => {
    // Only prefill when context changes (not on every input change)
    if (visualEditContext && visualEditContext !== prevContextRef.current) {
      setInput(`Modify the ${visualEditContext.componentName} component: `);
      textareaRef.current?.focus();
    }
    prevContextRef.current = visualEditContext;
  }, [visualEditContext]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setInput("");
    setAttachments([]);
  };

  // Slash command detection on input change
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    // Detect /slash at start of input
    const match = value.match(/^\/([a-zA-Z0-9-]*)$/);
    if (match) {
      setShowSlash(true);
      slash.search(match[1]);
    } else {
      setShowSlash(false);
    }
  }, [slash]);

  const handleSlashSelect = useCallback((item: SlashCompletion) => {
    setInput(`/${item.slug} `);
    setShowSlash(false);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const hasSlashItems = showSlash && slash.items.length > 0;
    // Let slash popup handle navigation keys when visible with items
    if (hasSlashItems && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab")) {
      return; // SlashCommandPopup handles these
    }
    if (showSlash && e.key === "Escape") {
      e.preventDefault();
      setShowSlash(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (hasSlashItems) return; // Let popup handle Enter only when it has items
      e.preventDefault();
      if (streaming) return;
      setShowSlash(false);
      handleSubmit();
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: AttachmentFile[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      file,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="border-t bg-background">
      {consentRequest && (
        <AgentConsentBanner consent={consentRequest} error={consentError} onDecision={onConsentDecision} />
      )}
      <TodoList todos={todos} />
      {showTokenBar && <TokenBar counts={tokenCounts} />}
      <div className="p-3 space-y-2">
        <ChatModeSelector mode={mode} onChange={onModeChange} disabled={streaming} />

        {/* Visual edit context badge */}
        {visualEditContext && (
          <div className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
            <Paintbrush className="h-3 w-3 text-primary shrink-0" />
            <span className="text-primary font-medium">Editing:</span>
            <span className="truncate max-w-[200px]">
              {visualEditContext.componentName} ({visualEditContext.filePath}:{visualEditContext.line})
            </span>
            <button
              onClick={onClearVisualEditContext}
              className="ml-0.5 rounded-sm hover:bg-accent p-0.5"
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        )}

        {/* Selected components for AI */}
        {selectedComponents && selectedComponents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedComponents.map((comp) => (
              <div
                key={comp.devxId}
                className="flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs"
              >
                <Code2 className="h-3 w-3 text-indigo-500 shrink-0" />
                <span className="font-medium text-indigo-600 dark:text-indigo-400">{comp.devxName}</span>
                <span className="text-muted-foreground truncate max-w-[180px]">
                  {comp.filePath}:{comp.line}
                </span>
                <button
                  onClick={() => onRemoveSelectedComponent?.(comp.devxId)}
                  className="ml-0.5 rounded-sm hover:bg-accent p-0.5"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[150px]">{attachment.name}</span>
                <span className="text-muted-foreground shrink-0">
                  ({formatFileSize(attachment.size)})
                </span>
                <button
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  className="ml-0.5 rounded-sm hover:bg-accent p-0.5"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-lg border bg-muted/50 p-2">
          <SlashCommandPopup
            items={slash.items}
            query={input.replace(/^\//, "")}
            onSelect={handleSlashSelect}
            onDismiss={() => setShowSlash(false)}
            visible={showSlash}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 shrink-0 ${showTokenBar ? "text-primary" : "text-muted-foreground"}`}
            onClick={() => setShowTokenBar((v) => !v)}
            title="Toggle token counter"
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleFileSelect}
            disabled={disabled || streaming}
            title="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <VoiceInput
            onTranscript={(text) => setInput((prev) => prev ? prev + " " + text : text)}
            disabled={disabled || streaming}
          />
          {streaming ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onCancel}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSubmit}
              disabled={!input.trim() || disabled}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
