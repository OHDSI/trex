import { useState, useCallback } from "react";
import * as api from "@/lib/api";

interface ClaudeCodeStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  account: string | null;
}

export function useClaudeCode() {
  const [status, setStatus] = useState<ClaudeCodeStatus>({
    installed: false, authenticated: false, version: null, account: null,
  });
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getClaudeCodeAuthStatus();
      setStatus(s);
      return s;
    } catch {
      setStatus({ installed: false, authenticated: false, version: null, account: null });
      return null;
    }
  }, []);

  const startLogin = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.startClaudeCodeLogin();
      if (result.status === "already_authenticated") {
        await refreshStatus();
        setLoading(false);
        return;
      }
      if (result.status === "pending" && result.login_url) {
        setLoginUrl(result.login_url);
        setNeedsCode(!!result.needs_code);
        setLoading(false);
        return;
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [refreshStatus]);

  const submitCode = useCallback(async (code: string) => {
    setSubmitting(true);
    try {
      const result = await api.submitClaudeCodeLoginCode(code);
      if (result.status === "authenticated") {
        setLoginUrl(null);
        setNeedsCode(false);
        await refreshStatus();
      }
    } finally {
      setSubmitting(false);
    }
  }, [refreshStatus]);

  const logout = useCallback(async () => {
    await api.claudeCodeLogout();
    setStatus({ ...status, authenticated: false, account: null });
  }, [status]);

  return { status, loginUrl, needsCode, loading, submitting, startLogin, submitCode, logout, refreshStatus };
}
