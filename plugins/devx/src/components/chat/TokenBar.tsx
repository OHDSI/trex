import { useState } from "react";
import type { TokenCounts } from "@/hooks/useTokenCount";

interface TokenBarProps {
  counts: TokenCounts;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function TokenBar({ counts }: TokenBarProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const total = counts.promptTokens
    ? counts.promptTokens + (counts.completionTokens ?? 0)
    : counts.total;
  const limit = counts.limit;
  const pct = (v: number) => Math.max((v / limit) * 100, 0.5);

  const systemTokens = counts.promptTokens ? undefined : counts.system;
  const historyTokens = counts.promptTokens ?? counts.history;
  const inputTokens = counts.completionTokens ?? counts.input;

  const segments: { key: string; label: string; value: number; color: string }[] = [];

  if (systemTokens !== undefined) {
    segments.push({ key: "system", label: "System", value: systemTokens, color: "bg-zinc-400 dark:bg-zinc-500" });
  }
  segments.push({ key: "history", label: counts.promptTokens ? "Prompt" : "History", value: historyTokens, color: "bg-blue-500" });
  segments.push({ key: "input", label: counts.completionTokens !== undefined ? "Completion" : "Input", value: inputTokens, color: "bg-green-500" });

  return (
    <div
      className="relative px-3 pb-1"
      onMouseLeave={() => setHovered(null)}
    >
      {/* Token bar */}
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.color} transition-all duration-200`}
            style={{ width: `${pct(seg.value)}%` }}
            onMouseEnter={() => setHovered(seg.key)}
          />
        ))}
      </div>

      {/* Labels */}
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {segments.map((seg) => (
            <span key={seg.key} className="flex items-center gap-0.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${seg.color}`} />
              {seg.label}: {formatNumber(seg.value)}
            </span>
          ))}
        </div>
        <span>{formatNumber(total)} / {formatNumber(limit)}</span>
      </div>

      {/* Tooltip on hover */}
      {hovered && (() => {
        const seg = segments.find((s) => s.key === hovered);
        if (!seg) return null;
        return (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 rounded bg-popover border px-2 py-1 text-[11px] text-popover-foreground shadow-md whitespace-nowrap z-50">
            {seg.label}: {seg.value.toLocaleString()} tokens
          </div>
        );
      })()}
    </div>
  );
}
