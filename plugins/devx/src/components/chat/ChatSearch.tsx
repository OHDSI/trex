import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ChatSearchProps {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}

export function ChatSearch({ open, onClose, onSearch }: ChatSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      setQuery("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSearch(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
            onSearch("");
          }
        }}
        placeholder="Search messages..."
        className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-0"
      />
      <button onClick={() => { onClose(); onSearch(""); }} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
