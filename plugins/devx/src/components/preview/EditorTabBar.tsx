import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorTab } from "@/hooks/useEditorTabs";

interface EditorTabBarProps {
  tabs: EditorTab[];
  activeTab: string | null;
  onSelectTab: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
}

export function EditorTabBar({ tabs, activeTab, onSelectTab, onCloseTab }: EditorTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b bg-muted/20 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.filePath}
          className={cn(
            "group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border/50 shrink-0 max-w-[180px]",
            "hover:bg-muted/50 transition-colors",
            tab.filePath === activeTab
              ? "bg-background text-foreground border-b-2 border-b-primary"
              : "text-muted-foreground",
          )}
          onClick={() => onSelectTab(tab.filePath)}
        >
          <span className="truncate">{tab.label}</span>
          {tab.isModified && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
          )}
          <span
            className="h-4 w-4 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted shrink-0 ml-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.filePath);
            }}
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      ))}
    </div>
  );
}
