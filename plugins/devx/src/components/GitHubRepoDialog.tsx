import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { GitHubRepo } from "@/lib/types";
import * as api from "@/lib/api";

interface GitHubRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
}

export function GitHubRepoDialog({ open, onOpenChange, appId, appName }: GitHubRepoDialogProps) {
  const [mode, setMode] = useState<"create" | "connect">("create");
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [repoUrl, setRepoUrl] = useState("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRepoName(appName.replace(/\s+/g, "-").toLowerCase());
      setResult(null);
      api.listGitHubRepos().then(setRepos).catch(() => setRepos([]));
    }
  }, [open, appName]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const res = await api.createGitHubRepo(appId, repoName, isPrivate);
      setResult(`Repository created: ${res.url}`);
      setTimeout(() => onOpenChange(false), 2000);
    } catch (err) {
      setResult(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!repoUrl) return;
    setLoading(true);
    try {
      await api.connectGitHubRepo(appId, repoUrl);
      setResult("Repository connected");
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setResult(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>GitHub Repository</DialogTitle>
          <DialogDescription>Create a new GitHub repository or connect an existing one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 bg-muted rounded-md">
            <button
              className={`flex-1 py-1.5 text-xs rounded ${mode === "create" ? "bg-background shadow-sm font-medium" : ""}`}
              onClick={() => setMode("create")}
            >
              Create New
            </button>
            <button
              className={`flex-1 py-1.5 text-xs rounded ${mode === "connect" ? "bg-background shadow-sm font-medium" : ""}`}
              onClick={() => setMode("connect")}
            >
              Connect Existing
            </button>
          </div>

          {mode === "create" ? (
            <>
              <div className="space-y-2">
                <Label>Repository Name</Label>
                <Input
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-app"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                Private repository
              </label>
              <Button className="w-full" onClick={handleCreate} disabled={!repoName.trim() || loading}>
                {loading ? "Creating..." : "Create & Push"}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Repository URL</Label>
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                />
              </div>
              {repos.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-auto">
                  <Label className="text-xs text-muted-foreground">Or select from your repos:</Label>
                  {repos.map((r) => (
                    <button
                      key={r.name}
                      className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-muted ${
                        repoUrl === r.clone_url ? "bg-primary/10 text-primary" : ""
                      }`}
                      onClick={() => setRepoUrl(r.clone_url)}
                    >
                      {r.name} {r.private ? "(private)" : ""}
                    </button>
                  ))}
                </div>
              )}
              <Button className="w-full" onClick={handleConnect} disabled={!repoUrl.trim() || loading}>
                {loading ? "Connecting..." : "Connect"}
              </Button>
            </>
          )}

          {result && (
            <p className={`text-xs ${result.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {result}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
