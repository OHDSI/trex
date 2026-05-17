import { useState, useEffect, useRef, useMemo } from "react";
import type { FileTreeEntry } from "@/lib/types";

interface QuickOpenProps {
  tree: FileTreeEntry[];
  onSelect: (filePath: string) => void;
  onDismiss: () => void;
}

function flattenTree(entries: FileTreeEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.type === "file") {
      paths.push(entry.path);
    }
    if (entry.children) {
      paths.push(...flattenTree(entry.children));
    }
  }
  return paths;
}

function fuzzyMatch(path: string, query: string): number {
  const lower = path.toLowerCase();
  const q = query.toLowerCase();
  // Exact substring match scores highest
  const idx = lower.indexOf(q);
  if (idx !== -1) {
    // Prefer matches at the end (filename vs deep path)
    return 1000 - idx;
  }
  // Character-by-character fuzzy
  let qi = 0;
  let score = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      qi++;
      score += 1;
    }
  }
  return qi === q.length ? score : -1;
}

export function QuickOpen({ tree, onSelect, onDismiss }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allPaths = useMemo(() => flattenTree(tree), [tree]);

  const filtered = useMemo(() => {
    if (!query) return allPaths.slice(0, 20);
    return allPaths
      .map((p) => ({ path: p, score: fuzzyMatch(p, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((r) => r.path);
  }, [allPaths, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, selectedIndex, onSelect, onDismiss]);

  return (
    <div className="absolute inset-x-0 top-0 z-50 flex justify-center pt-2 px-4">
      <div className="w-full max-w-md bg-popover border rounded-lg shadow-lg overflow-hidden">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files..."
          className="w-full px-3 py-2 text-sm bg-transparent border-b outline-none placeholder:text-muted-foreground"
        />
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              No files found
            </div>
          ) : (
            filtered.map((path, i) => {
              const parts = path.split("/");
              const fileName = parts.pop() || path;
              const dir = parts.join("/");
              return (
                <button
                  key={path}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-baseline gap-2 hover:bg-accent transition-colors ${
                    i === selectedIndex ? "bg-accent" : ""
                  }`}
                  onClick={() => onSelect(path)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="font-medium text-foreground">{fileName}</span>
                  {dir && (
                    <span className="text-xs text-muted-foreground truncate">{dir}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
