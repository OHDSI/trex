import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "@/lib/api";

interface CopilotStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  account: string | null;
}

export function useCopilot() {
  const [status, setStatus] = useState<CopilotStatus>({
    installed: false,
    authenticated: false,
    version: null,
    account: null,
  });
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getCopilotAuthStatus();
      setStatus(s);
      return s;
    } catch {
      setStatus({ installed: false, authenticated: false, version: null, account: null });
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startLogin = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.startCopilotLogin();

      if (result.status === "already_authenticated") {
        await refreshStatus();
        setLoading(false);
        return;
      }

      if (result.status === "pending" && result.login_url) {
        setLoginUrl(result.login_url);
        setUserCode(result.user_code || null);
        setPolling(true);
        setLoading(false);

        // Poll auth status every 3s until authenticated
        pollRef.current = window.setInterval(async () => {
          try {
            const s = await api.getCopilotAuthStatus();
            setStatus(s);
            if (s.authenticated) {
              setPolling(false);
              setLoginUrl(null);
              setUserCode(null);
              if (pollRef.current) clearInterval(pollRef.current);
            }
          } catch {
            // Keep polling
          }
        }, 3000);

        // Stop polling after 5 minutes
        setTimeout(() => {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            setPolling(false);
            setLoginUrl(null);
            setUserCode(null);
          }
        }, 5 * 60 * 1000);

        return;
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [refreshStatus]);

  const logout = useCallback(async () => {
    await api.copilotLogout();
    setStatus({ ...status, authenticated: false, account: null });
  }, [status]);

  return { status, loginUrl, userCode, polling, loading, startLogin, logout, refreshStatus };
}
