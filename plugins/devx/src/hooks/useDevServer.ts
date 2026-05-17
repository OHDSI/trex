import { useState, useEffect, useCallback, useRef } from "react";
import type { DevServerStatus, ServerOutputEvent } from "@/lib/types";
import * as api from "@/lib/api";

export function useDevServer(appId: string | null) {
  const [status, setStatus] = useState<DevServerStatus>({ status: "stopped" });
  const [consoleLines, setConsoleLines] = useState<ServerOutputEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Poll status
  const refreshStatus = useCallback(async () => {
    if (!appId) {
      setStatus({ status: "stopped" });
      return;
    }
    try {
      const s = await api.getDevServerStatus(appId);
      setStatus(s);
    } catch {
      setStatus({ status: "stopped" });
    }
  }, [appId]);

  useEffect(() => {
    refreshStatus();
    setConsoleLines([]);
    // Clean up SSE on app change
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [appId, refreshStatus]);

  // Poll status while "starting" (SSE status_change may not fire reliably)
  useEffect(() => {
    if (status.status !== "starting" || !appId) return;
    const interval = setInterval(refreshStatus, 2000);
    return () => clearInterval(interval);
  }, [status.status, appId, refreshStatus]);

  // Subscribe to output SSE — always connected when appId is set
  useEffect(() => {
    if (!appId) return;

    abortRef.current?.abort();
    const controller = api.streamDevServerOutput(appId, (event) => {
      setConsoleLines((prev) => {
        const next = [...prev, event as ServerOutputEvent];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
      // Update status on status_change events
      if (event.type === "status_change") {
        if (event.data === "running") {
          // Full refresh to get the real port/URL (may differ from allocated port)
          refreshStatus();
        } else if (event.data === "stopped") {
          setStatus((s) => ({ ...s, status: "stopped" }));
        } else if (event.data === "error") {
          setStatus((s) => ({ ...s, status: "error" }));
        }
      }
    });
    abortRef.current = controller;

    return () => controller.abort();
  }, [appId]);

  const start = useCallback(async () => {
    if (!appId) return;
    setConsoleLines([]);
    // Ensure visual editing tagger plugin is installed before starting
    try {
      await api.setupVisualEditing(appId);
    } catch {
      // Non-fatal — visual editing just won't work
    }
    const s = await api.startDevServer(appId);
    setStatus(s);
  }, [appId]);

  const stop = useCallback(async () => {
    if (!appId) return;
    const s = await api.stopDevServer(appId);
    setStatus(s);
  }, [appId]);

  const restart = useCallback(async () => {
    if (!appId) return;
    setConsoleLines([]);
    const s = await api.restartDevServer(appId);
    setStatus(s);
  }, [appId]);

  const clearConsole = useCallback(() => setConsoleLines([]), []);

  return { status, consoleLines, start, stop, restart, clearConsole, refreshStatus };
}
