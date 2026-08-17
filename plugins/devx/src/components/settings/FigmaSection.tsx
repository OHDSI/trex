import { useCallback, useEffect, useState } from "react";
import {
  exchangeFigmaMcpCode,
  figmaMcpLogout,
  getFigmaMcpStatus,
  startFigmaMcpLogin,
} from "@/lib/api";

// The OAuth redirect target is THIS settings page (plus a marker param so the
// callback params are unambiguous). The page is authenticated in the browser,
// so the code/state relay to the backend needs no unauthenticated callback
// route — see figma_mcp_routes.ts.
function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}?figma=1`;
}

export function FigmaSection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await getFigmaMcpStatus();
      setConnected(status.connected);
    } catch {
      setConnected(null);
    }
  }, []);

  // Complete the OAuth round-trip: Figma redirected back to this page with
  // ?figma=1&code=...&state=... — relay them, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("figma") === "1" && params.get("code") && params.get("state")) {
      setBusy(true);
      exchangeFigmaMcpCode(params.get("code")!, params.get("state")!)
        .then(() => setConnected(true))
        .catch((err) => setError(err?.message || "Figma connection failed"))
        .finally(() => {
          setBusy(false);
          const clean = new URL(window.location.href);
          ["figma", "code", "state"].forEach((k) => clean.searchParams.delete(k));
          window.history.replaceState({}, "", clean.toString());
        });
    } else {
      refresh();
    }
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authUrl } = await startFigmaMcpLogin(redirectUri());
      // Full-page redirect: Figma sends the browser back to this page.
      window.location.href = authUrl;
    } catch (err) {
      setError((err as Error)?.message || "Could not start the Figma login");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await figmaMcpLogout();
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Figma</h3>
      <p className="text-xs text-muted-foreground">
        Connect Figma so the coding agent can read designs behind Figma links
        (official Figma MCP server).
      </p>
      {connected ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-green-600">Connected</span>
          <button
            type="button"
            className="text-xs underline text-muted-foreground disabled:opacity-50"
            disabled={busy}
            onClick={disconnect}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="rounded border px-3 py-1 text-xs disabled:opacity-50"
          disabled={busy || connected === null}
          onClick={connect}
        >
          {busy ? "Connecting..." : "Connect Figma"}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
