import { useEffect, useRef } from "react";
import { Sparkles, Type, Copy, Clipboard, CopyPlus, Trash2, Scissors, Group, Ungroup } from "lucide-react";

interface ContextMenuAction {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  separator?: boolean;
}

interface ElementContextMenuProps {
  position: { x: number; y: number };
  elementName: string;
  onEditWithAI: () => void;
  onEditText: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onCut: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onClose: () => void;
  canPaste: boolean;
}

export function ElementContextMenu({
  position,
  elementName,
  onEditWithAI,
  onEditText,
  onCopy,
  onPaste,
  onDuplicate,
  onCut,
  onDelete,
  onGroup,
  onUngroup,
  onClose,
  canPaste,
}: ElementContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const menuWidth = 200;
  const menuHeight = 240;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8);

  const actions: ContextMenuAction[] = [
    { label: "Edit with AI", icon: <Sparkles className="h-3 w-3" />, onClick: onEditWithAI },
    { label: "Edit text", icon: <Type className="h-3 w-3" />, onClick: onEditText, separator: true },
    { label: "Copy", shortcut: "Ctrl+C", icon: <Copy className="h-3 w-3" />, onClick: onCopy },
    { label: "Cut", shortcut: "Ctrl+X", icon: <Scissors className="h-3 w-3" />, onClick: onCut },
    { label: "Paste", shortcut: "Ctrl+V", icon: <Clipboard className="h-3 w-3" />, onClick: () => { if (canPaste) onPaste(); } },
    { label: "Duplicate", shortcut: "Ctrl+D", icon: <CopyPlus className="h-3 w-3" />, onClick: onDuplicate, separator: true },
    { label: "Group", shortcut: "Ctrl+G", icon: <Group className="h-3 w-3" />, onClick: onGroup },
    { label: "Ungroup", shortcut: "Ctrl+Shift+G", icon: <Ungroup className="h-3 w-3" />, onClick: onUngroup, separator: true },
    { label: "Delete", shortcut: "Del", icon: <Trash2 className="h-3 w-3" />, onClick: onDelete, destructive: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[200px] bg-popover border rounded-lg shadow-xl py-1 text-xs"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b mb-1">
        &lt;{elementName}&gt;
      </div>
      {actions.map((action, i) => (
        <div key={i}>
          <button
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors ${
              action.destructive ? "text-destructive" : ""
            } ${!canPaste && action.label === "Paste" ? "opacity-40 cursor-default" : "cursor-pointer"}`}
            onClick={() => { action.onClick(); onClose(); }}
            disabled={action.label === "Paste" && !canPaste}
          >
            {action.icon}
            <span className="flex-1 text-left">{action.label}</span>
            {action.shortcut && (
              <span className="text-[10px] text-muted-foreground">{action.shortcut}</span>
            )}
          </button>
          {action.separator && <div className="border-t my-1" />}
        </div>
      ))}
    </div>
  );
}
