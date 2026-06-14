import { useState, useEffect, useCallback } from "react";
import type { GitFile, GitCommit, GitBranches, GitWorktree } from "@/lib/types";
import * as api from "@/lib/api";

export function useGit(appId: string | null) {
  const [status, setStatus] = useState<GitFile[]>([]);
  const [log, setLog] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranches>({ current: "main", branches: [] });
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!appId) {
      setStatus([]);
      setLog([]);
      setBranches({ current: "main", branches: [] });
      setWorktrees([]);
      return;
    }
    setLoading(true);
    try {
      const [s, l, b, w] = await Promise.all([
        api.getGitStatus(appId),
        api.getGitLog(appId),
        api.getGitBranches(appId),
        api.getGitWorktrees(appId).catch(() => ({ worktrees: [] })),
      ]);
      setStatus(s.files || []);
      setLog(l);
      setBranches(b);
      setWorktrees(w.worktrees || []);
    } catch {
      // Git may not be initialized yet
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const mergeWorktree = useCallback(async (branch: string, path?: string) => {
    if (!appId) return;
    await api.mergeGitWorktree(appId, branch, path);
    await refresh();
  }, [appId, refresh]);

  const discardWorktree = useCallback(async (branch: string | null, path: string) => {
    if (!appId) return;
    await api.discardGitWorktree(appId, branch, path);
    await refresh();
  }, [appId, refresh]);

  return { status, log, branches, worktrees, loading, refresh, mergeWorktree, discardWorktree };
}
