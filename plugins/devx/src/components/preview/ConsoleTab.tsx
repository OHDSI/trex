import { useEffect, useRef, useState } from "react";
import { Trash2, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useDevServer } from "@/hooks/useDevServer";

interface ConsoleTabProps {
  devServer: ReturnType<typeof useDevServer>;
}

export function ConsoleTab({ devServer }: ConsoleTabProps) {
  const { consoleLines, clearConsole, status } = devServer;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<"all" | "stdout" | "stderr">("all");

  const filtered = filter === "all"
    ? consoleLines
    : consoleLines.filter((l) => l.type === filter);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  if (status.status === "stopped" && consoleLines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Start the dev server to see console output
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
        <div className="flex items-center gap-0.5 text-xs">
          {(["all", "stdout", "stderr"] as const).map((f) => (
            <button
              key={f}
              className={`px-2 py-0.5 rounded text-xs ${
                filter === f ? "bg-muted font-medium" : "hover:bg-muted/50"
              }`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "stdout" ? "Info" : "Errors"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {!autoScroll && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
          >
            <ArrowDown className="h-3 w-3" />
            Scroll to bottom
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearConsole}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-xs p-2 space-y-px"
        onScroll={handleScroll}
      >
        {filtered.map((line, i) => (
          <div
            key={i}
            className={`flex gap-2 py-px px-1 rounded ${
              line.type === "stderr" ? "text-red-400 bg-red-500/5" : "text-foreground"
            }`}
          >
            <span className="text-muted-foreground shrink-0 w-16 text-right tabular-nums">
              {new Date(line.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="whitespace-pre-wrap break-all">{line.data}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
