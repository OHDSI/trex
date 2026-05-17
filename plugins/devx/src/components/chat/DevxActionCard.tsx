import { useState, memo } from "react";
import { Pencil, Trash2, FileEdit, Package, Loader2, Check, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TagSegment } from "@/lib/devx-tag-parser";

type CardState = "pending" | "finished" | "aborted";

const TAG_CONFIG: Record<
  string,
  { icon: typeof Pencil; accent: string; label: string }
> = {
  "devx-write": { icon: Pencil, accent: "border-blue-500", label: "Write" },
  "devx-delete": { icon: Trash2, accent: "border-red-500", label: "Delete" },
  "devx-rename": { icon: FileEdit, accent: "border-amber-500", label: "Rename" },
  "devx-add-dependency": { icon: Package, accent: "border-blue-500", label: "Install" },
};

function getFilePath(tag: TagSegment): string {
  if (tag.tagType === "devx-write" || tag.tagType === "devx-delete") {
    return tag.attrs.file_path || "";
  }
  if (tag.tagType === "devx-rename") {
    const old = tag.attrs.old_file_path || "";
    const next = tag.attrs.new_file_path || "";
    return old && next ? `${old} → ${next}` : old || next;
  }
  if (tag.tagType === "devx-add-dependency") {
    return tag.attrs.packages || "";
  }
  return "";
}

function StateIcon({ state }: { state: CardState }) {
  if (state === "pending") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }
  if (state === "finished") {
    return <Check className="h-3.5 w-3.5 text-emerald-500" />;
  }
  return <X className="h-3.5 w-3.5 text-destructive" />;
}

interface DevxActionCardProps {
  tag: TagSegment;
  state: CardState;
}

export const DevxActionCard = memo(function DevxActionCard({
  tag,
  state,
}: DevxActionCardProps) {
  const config = TAG_CONFIG[tag.tagType];
  if (!config) return null;

  const Icon = config.icon;
  const filePath = getFilePath(tag);
  const hasContent = tag.tagType === "devx-write" && tag.content.length > 0;
  const isDependency = tag.tagType === "devx-add-dependency";

  // Always start collapsed; user can expand manually
  const [expanded, setExpanded] = useState(false);
  const [hasBeenExpanded, setHasBeenExpanded] = useState(false);

  const toggleExpand = () => {
    if (!hasContent) return;
    const next = !expanded;
    setExpanded(next);
    if (next) setHasBeenExpanded(true);
  };

  return (
    <div
      className={cn(
        "my-1.5 rounded-md border-l-[3px] bg-muted/50 transition-colors",
        config.accent,
      )}
    >
      <button
        type="button"
        onClick={toggleExpand}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
          hasContent && "cursor-pointer hover:bg-muted/80",
          !hasContent && "cursor-default",
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {isDependency ? (
          <DependencyPills packages={filePath} />
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {filePath}
          </span>
        )}
        <StateIcon state={state} />
        {hasContent && (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>
      {/* Animated expand/collapse using CSS grid */}
      {hasContent && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            {/* Lazy mount: only render content once first expanded */}
            {hasBeenExpanded && (
              <pre className="mx-3 mb-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                <code>{tag.content.trim()}</code>
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function DependencyPills({ packages }: { packages: string }) {
  const pkgs = packages
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-1">
      {pkgs.map((pkg) => (
        <span
          key={pkg}
          className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-mono text-blue-700 dark:text-blue-300"
        >
          {pkg}
        </span>
      ))}
    </div>
  );
}
