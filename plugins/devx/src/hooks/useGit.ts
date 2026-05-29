import { useState, useEffect, useCallback } from "react";
import type { GitFile, GitCommit, GitBranches } from "@/lib/types";
import * as api from "@/lib/api";

export function useGit(appId: string | null) {
  const [status, setStatus] = useState<GitFile[]>([]);
  const [log, setLog] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranches>({ current: "main", branches: [] });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!appId) {
      setStatus([]);
      setLog([]);
      setBranches({ current: "main", branches: [] });
      return;
    }
    setLoading(true);
    try {
      const [s, l, b] = await Promise.all([
        api.getGitStatus(appId),
        api.getGitLog(appId),
        api.getGitBranches(appId),
      ]);
      setStatus(s.files || []);
      setLog(l);
      setBranches(b);
    } catch {
      // Git may not be initialized yet
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, log, branches, loading, refresh };
}
