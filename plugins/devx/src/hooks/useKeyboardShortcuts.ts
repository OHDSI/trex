import { useEffect, useRef } from "react";

interface ShortcutHandlers {
  onNewChat?: () => void;
  onSearch?: () => void;
  onCancelStream?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const h = handlersRef.current;

      // Cmd/Ctrl+N — New chat
      if (mod && e.key === "n") {
        e.preventDefault();
        h.onNewChat?.();
      }

      // Cmd/Ctrl+K — Search
      if (mod && e.key === "k") {
        e.preventDefault();
        h.onSearch?.();
      }

      // Escape — Cancel streaming
      if (e.key === "Escape") {
        h.onCancelStream?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
