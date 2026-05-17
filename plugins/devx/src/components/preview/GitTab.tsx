import { useState } from "react";
import { GitBranch, GitCommitHorizontal, RefreshCw, ChevronDown, FileDiff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useGit } from "@/hooks/useGit";
import * as api from "@/lib/api";
import { GitHubBranchManager } from "@/components/integrations/GitHubBranchManager";

interface GitTabProps {
  git: ReturnType<typeof useGit>;
  appId: string;
}

export function GitTab({ git, appId }: GitTabProps) {
  const { status, log, branches, loading, refresh } = git;
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);

  const handleCommit = async () => {
    if (!commitMsg.trim() || status.length === 0 || committing) return;
    setCommitting(true);
    try {
      await api.gitCommit(appId, commitMsg.trim());
      setCommitMsg("");
      refresh();
    } catch (err) {
      console.error("Commit failed:", err);
    } finally {
      setCommitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading git status...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: branch selector + refresh */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
              <GitBranch className="h-3 w-3" />
              {branches.current}
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {branches.branches.map((b) => (
              <DropdownMenuItem key={b} className={b === branches.current ? "font-medium" : ""}>
                {b}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Quick commit */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Input
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message..."
          className="h-7 text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleCommit()}
        />
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs gap-1 shrink-0"
          disabled={!commitMsg.trim() || status.length === 0 || committing}
          onClick={handleCommit}
        >
          <GitCommitHorizontal className="h-3 w-3" />
          Commit
        </Button>
      </div>

      {/* Branch manager */}
      <div className="px-3 py-2 border-b shrink-0">
        <GitHubBranchManager
          branches={branches}
          onCreateBranch={async (name) => {
            await api.gitCreateBranch(appId, name);
            refresh();
          }}
          onSwitchBranch={async (name) => {
            await api.gitSwitchBranch(appId, name);
            refresh();
          }}
          onDeleteBranch={async (name) => {
            await api.gitDeleteBranch(appId, name);
            refresh();
          }}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {/* Uncommitted changes */}
        {status.length > 0 && (
          <div className="border-b">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
              Uncommitted Changes ({status.length})
            </div>
            {status.map((f, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30">
                <span className={`font-mono w-5 shrink-0 ${
                  f.status === "M" ? "text-yellow-500" :
                  f.status === "A" || f.status === "?" ? "text-green-500" :
                  f.status === "D" ? "text-red-500" : ""
                }`}>
                  {f.status === "?" ? "A" : f.status}
                </span>
                <FileDiff className="h-3 w-3 shrink-0 opacity-40" />
                <span className="truncate">{f.path}</span>
              </div>
            ))}
          </div>
        )}

        {status.length === 0 && (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            Working tree clean
          </div>
        )}

        {/* Commit history */}
        <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
          Recent Commits
        </div>
        {log.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            No commits yet
          </div>
        ) : (
          log.map((c) => (
            <div key={c.hash} className="flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b border-border/50">
              <span className="font-mono text-primary/70 shrink-0">{c.hash.substring(0, 7)}</span>
              <span className="flex-1 truncate">{c.message}</span>
              <span className="text-muted-foreground shrink-0">{c.date.substring(0, 10)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
