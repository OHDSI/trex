import { useState, useEffect, useCallback } from "react";
import type { GitSigningStatus } from "@/lib/types";
import * as api from "@/lib/api";

// Commit-signing key state for Settings -> Integrations -> Git. Mirrors the
// useGitHub shape: status auto-loads on mount, actions refresh it. The private
// key never reaches this hook — status carries only the public half.
export function useGitSigning() {
  const [status, setStatus] = useState<GitSigningStatus>({ configured: false });
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.getGitSigningStatus());
    } catch {
      setStatus({ configured: false });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const run = useCallback(async (action: () => Promise<{ warning?: string } | undefined>) => {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const result = await action();
      if (result?.warning) setWarning(result.warning);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshStatus]);

  const generate = useCallback(() => run(() => api.generateGitSigningKey()), [run]);
  const importKey = useCallback((privateKey: string) => run(() => api.importGitSigningKey(privateKey)), [run]);
  const remove = useCallback(
    () =>
      run(async () => {
        await api.removeGitSigningKey();
        return undefined;
      }),
    [run],
  );

  return { status, busy, warning, error, generate, importKey, remove, refreshStatus };
}
