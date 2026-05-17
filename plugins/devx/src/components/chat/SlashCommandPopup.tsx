import { useEffect, useRef, useState } from "react";
import type { SlashCompletion } from "../../lib/types";

interface SlashCommandPopupProps {
  items: SlashCompletion[];
  query: string;
  onSelect: (item: SlashCompletion) => void;
  onDismiss: () => void;
  visible: boolean;
}

export function SlashCommandPopup({
  items,
  query,
  onSelect,
  onDismiss,
  visible,
}: SlashCommandPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items, query]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    // Don't capture keys when there are no items to navigate
    if (items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (items[selectedIndex]) {
          onSelect(items[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, items, selectedIndex, onSelect, onDismiss]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!visible || items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-80 max-h-60 overflow-y-auto
                 bg-popover border rounded-lg shadow-lg z-50"
    >
      {items.map((item, idx) => (
        <button
          key={item.slug}
          className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm
                     hover:bg-accent transition-colors
                     ${idx === selectedIndex ? "bg-accent" : ""}`}
          onClick={() => onSelect(item)}
          onMouseEnter={() => setSelectedIndex(idx)}
        >
          <span className="font-mono text-foreground shrink-0">
            /{item.slug}
          </span>
          <span className="text-muted-foreground text-xs truncate">
            {item.description || ""}
          </span>
          <span className="ml-auto text-[10px] uppercase text-muted-foreground/60 shrink-0">
            {item.type}
          </span>
        </button>
      ))}
    </div>
  );
}
