import { useState, useCallback, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FileIcon } from "./FileIcon";
import * as api from "@/lib/api";
import type { SearchResult } from "@/lib/api";

interface SearchPanelProps {
  appId: string;
  onOpenResult: (filePath: string, line: number) => void;
}

export function SearchPanel({ appId, onOpenResult }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.searchFiles(appId, q);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [appId]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 400);
  }, [doSearch]);

  // Group results by file
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.file] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search in files..."
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            className="h-6 text-xs pl-6 pr-2"
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {searching && (
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching...
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No results found
          </div>
        )}

        {!searching && Object.entries(grouped).map(([file, matches]) => (
          <div key={file} className="mb-1">
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground bg-muted/30">
              <FileIcon name={file.split("/").pop() || file} className="h-3 w-3 shrink-0" />
              <span className="truncate">{file}</span>
              <span className="ml-auto text-[10px] opacity-60">{matches.length}</span>
            </div>
            {matches.map((match, i) => (
              <button
                key={`${match.line}-${i}`}
                className="flex items-start gap-2 w-full text-left px-3 py-1 text-xs hover:bg-muted/50 transition-colors"
                onClick={() => onOpenResult(match.file, match.line)}
              >
                <span className="text-muted-foreground shrink-0 w-8 text-right tabular-nums">
                  {match.line}
                </span>
                <span className="truncate text-foreground">{match.text}</span>
              </button>
            ))}
          </div>
        ))}

        {!searching && !searched && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            Type to search across all files
          </div>
        )}
      </div>
    </div>
  );
}
