import { useState, useEffect, useCallback, useRef } from "react";
import type { GitHubStatus, GitHubDeviceCode, GitHubCliAuthStatus, GitHubCliAuthLogin } from "@/lib/types";
import * as api from "@/lib/api";

// The CLI login runs detached in the container, so nothing pushes its
// completion back here — the UI re-reads `gh auth status` on a timer while a
// code is outstanding. GitHub device codes expire after ~15 minutes; stop then
// rather than polling a dead code forever.
const CLI_POLL_INTERVAL_MS = 5000;
const CLI_POLL_TIMEOUT_MS = 15 * 60 * 1000;

const UNKNOWN_CLI_STATUS: GitHubCliAuthStatus = {
  installed: false,
  authenticated: false,
  version: null,
  account: null,
  scopes: null,
};

export function useGitHub() {
  const [status, setStatus] = useState<GitHubStatus>({ connected: false });
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCode | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);

  const [cliStatus, setCliStatus] = useState<GitHubCliAuthStatus>(UNKNOWN_CLI_STATUS);
  const [cliLogin, setCliLogin] = useState<GitHubCliAuthLogin | null>(null);
  const [cliBusy, setCliBusy] = useState(false);
  // Until the first probe lands, cliStatus is all-false — which reads
  // identically to "gh is missing". Callers gate on this so a fresh page load
  // doesn't flash a wrong "not available" before the answer arrives.
  const [cliChecked, setCliChecked] = useState(false);
  const cliPollRef = useRef<number | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getGitHubStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  const refreshCliStatus = useCallback(async (): Promise<GitHubCliAuthStatus> => {
    try {
      const s = await api.getGitHubCliAuthStatus();
      setCliStatus(s);
      return s;
    } catch (err) {
      // The route answers 200-with-`error` for a shell layer that threw, so
      // reaching here means the request itself failed. Either way the caller
      // must be able to tell "the probe broke" from "gh is missing" — both
      // arrive as installed:false, so carry the reason instead of dropping it.
      const failed = {
        ...UNKNOWN_CLI_STATUS,
        error: err instanceof Error ? err.message : String(err),
      };
      setCliStatus(failed);
      return failed;
    } finally {
      setCliChecked(true);
    }
  }, []);

  const stopCliPolling = useCallback(() => {
    if (cliPollRef.current) {
      clearInterval(cliPollRef.current);
      cliPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshCliStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (cliPollRef.current) clearInterval(cliPollRef.current);
    };
  }, [refreshStatus, refreshCliStatus]);

  /**
   * Start the CLI device flow. The response carries the code to show; the
   * poll below is what notices the user finishing in their browser.
   */
  const startCliAuth = useCallback(async () => {
    setCliBusy(true);
    try {
      const result = await api.startGitHubCliAuth();
      setCliLogin(result);
      if (result.status !== "pending") {
        await refreshCliStatus();
        return;
      }

      const startedAt = Date.now();
      stopCliPolling();
      cliPollRef.current = window.setInterval(async () => {
        const s = await refreshCliStatus();
        if (s.authenticated) {
          stopCliPolling();
          setCliLogin(null);
        } else if (Date.now() - startedAt > CLI_POLL_TIMEOUT_MS) {
          stopCliPolling();
          setCliLogin({
            status: "error",
            message: "The code expired before it was authorized. Start again.",
          });
        }
      }, CLI_POLL_INTERVAL_MS);
    } catch (err) {
      setCliLogin({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setCliBusy(false);
    }
  }, [refreshCliStatus, stopCliPolling]);

  /** Abandon an outstanding code. The detached gh process expires on its own. */
  const cancelCliAuth = useCallback(() => {
    stopCliPolling();
    setCliLogin(null);
  }, [stopCliPolling]);

  const signOutCli = useCallback(async () => {
    setCliBusy(true);
    stopCliPolling();
    setCliLogin(null);
    try {
      const result = await api.signOutGitHubCli();
      // A refused sign-out leaves the status unchanged, so without this the
      // block would simply keep saying "Signed in as ..." with no explanation
      // of why the button did nothing.
      if (!result.ok) {
        setCliLogin({ status: "error", message: result.message || "Sign out failed." });
      }
    } catch (err) {
      setCliLogin({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
    await refreshCliStatus();
    setCliBusy(false);
  }, [refreshCliStatus, stopCliPolling]);

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

  return {
    status, deviceCode, polling, startDeviceFlow, disconnect, refreshStatus,
    cliStatus, cliLogin, cliBusy, cliChecked,
    startCliAuth, cancelCliAuth, signOutCli, refreshCliStatus,
  };
}
