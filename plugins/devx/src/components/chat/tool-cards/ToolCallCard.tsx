import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, ChevronDown } from "lucide-react";
import type { ToolCall } from "@/lib/types";
import { getToolConfig, getAccentClasses } from "./toolCallConfig";
import { FileToolCard } from "./FileToolCard";
import { SearchToolCard } from "./SearchToolCard";
import { cn } from "@/lib/utils";

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const FILE_TOOLS = new Set(["Write", "Edit", "SearchReplace", "Read", "Glob", "DeleteFile"]);
const SEARCH_TOOLS = new Set(["Grep", "CodeSearch"]);

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(false);
  const config = getToolConfig(toolCall.name || "");
  const accent = getAccentClasses(config.accentColor);
  const Icon = config.icon;

  const args = toolCall.args || {};
  const filePath = (args.path ?? args.file_path) as string | undefined;
  const isPending = toolCall.result === undefined;
  const hasError = toolCall.error === true;

  useEffect(() => {
    if (expanded && !hasBeenExpanded) {
      setHasBeenExpanded(true);
    }
  }, [expanded, hasBeenExpanded]);

  function renderExpandedContent() {
    if (FILE_TOOLS.has(toolCall.name)) {
      return <FileToolCard toolCall={toolCall} />;
    }
    if (SEARCH_TOOLS.has(toolCall.name)) {
      return <SearchToolCard toolCall={toolCall} />;
    }
    const argsStr = JSON.stringify(toolCall.args || {}, null, 2);
    return (
      <div className="space-y-2 text-xs">
        <div>
          <span className="text-muted-foreground mb-1 block">Arguments:</span>
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
            {argsStr.split("\n").slice(0, 15).join("\n")}
            {argsStr.split("\n").length > 15 && "\n..."}
          </pre>
        </div>
        {toolCall.result && (
          <div>
            <span className="text-muted-foreground mb-1 block">Result:</span>
            <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">
              {toolCall.result.split("\n").slice(0, 10).join("\n")}
              {toolCall.result.split("\n").length > 10 && "\n..."}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-sm transition-all duration-200",
        isPending && "border-l-[3px]",
        isPending && accent.border,
        !isPending && "border-l",
      )}
    >
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Tinted icon background */}
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", accent.bg)}>
          <Icon className={cn("h-3.5 w-3.5", accent.text)} />
        </div>

        {/* Label + file path */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-xs font-medium">{config.label}</span>
          {filePath && (
            <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground max-w-[250px]">
              {filePath}
            </code>
          )}
        </div>

        {/* State indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              <span className="text-[11px] text-amber-600 dark:text-amber-400">Running...</span>
            </>
          ) : hasError ? (
            <>
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[11px] text-destructive">Failed</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-[11px] text-green-600 dark:text-green-400">Done</span>
            </>
          )}

          {/* Expand chevron */}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {/* Expandable content with CSS grid animation */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          {hasBeenExpanded && (
            <div className="border-t px-3 py-2">
              {renderExpandedContent()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
