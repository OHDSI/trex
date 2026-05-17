import { useState } from "react";
import { GitBranch, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GitBranches } from "@/lib/types";

interface GitHubBranchManagerProps {
  branches: GitBranches;
  onCreateBranch: (name: string) => Promise<void>;
  onSwitchBranch: (name: string) => Promise<void>;
  onDeleteBranch: (name: string) => Promise<void>;
}

export function GitHubBranchManager({ branches, onCreateBranch, onSwitchBranch, onDeleteBranch }: GitHubBranchManagerProps) {
  const [newBranch, setNewBranch] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newBranch.trim()) return;
    setCreating(true);
    try {
      await onCreateBranch(newBranch.trim());
      setNewBranch("");
    } catch (err) {
      console.error("Failed to create branch:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Branches</div>
      {branches.branches.map((b) => (
        <div key={b} className="flex items-center justify-between text-xs border rounded px-2 py-1.5 group">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className={b === branches.current ? "font-medium" : ""}>{b}</span>
            {b === branches.current && <Check className="h-3 w-3 text-green-500" />}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {b !== branches.current && (
              <>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSwitchBranch(b)} title="Switch to branch">
                  <Check className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => onDeleteBranch(b)} title="Delete branch">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          placeholder="New branch name"
          className="h-7 text-xs flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={handleCreate} disabled={!newBranch.trim() || creating}>
          <Plus className="h-3 w-3" />
          Create
        </Button>
      </div>
    </div>
  );
}
