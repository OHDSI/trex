import { useState, useEffect, useCallback, useRef } from "react";
import type { GitHubStatus, GitHubDeviceCode } from "@/lib/types";
import * as api from "@/lib/api";

export function useGitHub() {
  const [status, setStatus] = useState<GitHubStatus>({ connected: false });
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCode | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getGitHubStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshStatus]);

  const startDeviceFlow = useCallback(async () => {
    const code = await api.startGitHubDeviceFlow();
    setDeviceCode(code);
    setPolling(true);

    let currentInterval = (code.interval || 5) * 1000;

    const pollFn = async () => {
      try {
        const result = await api.pollGitHubToken(code.device_code);
        if (result.status === "connected") {
          setPolling(false);
          setDeviceCode(null);
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus({ connected: true, username: result.username });
        } else if (result.status === "slow_down") {
          // GitHub requires increasing interval by 5s on slow_down
          if (pollRef.current) clearInterval(pollRef.current);
          currentInterval += 5000;
          pollRef.current = window.setInterval(pollFn, currentInterval);
        } else if (result.status === "error") {
          setPolling(false);
          setDeviceCode(null);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Keep polling
      }
    };

    pollRef.current = window.setInterval(pollFn, currentInterval);
  }, []);

  const disconnect = useCallback(async () => {
    await api.disconnectGitHub();
    setStatus({ connected: false });
  }, []);

  return { status, deviceCode, polling, startDeviceFlow, disconnect, refreshStatus };
}
