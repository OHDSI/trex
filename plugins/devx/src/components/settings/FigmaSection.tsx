import { useCallback, useEffect, useState } from "react";
import { figmaLogout, getFigmaStatus, setFigmaToken } from "@/lib/api";

export function FigmaSection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await getFigmaStatus();
      setConnected(status.connected);
      setHandle(status.handle);
    } catch {
      setConnected(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await setFigmaToken(token.trim());
      setConnected(result.connected);
      setHandle(result.handle);
      setToken("");
    } catch (err) {
      setError((err as Error)?.message || "Figma rejected the token");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await figmaLogout();
      setConnected(false);
      setHandle(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Figma</h3>
      <p className="text-xs text-muted-foreground">
        Paste a Figma personal access token (Figma → Settings → Security, scope
        “File content: read”) so the coding agent can pull mockups behind Figma
        links.
      </p>
      {connected ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-green-600">
            Connected{handle ? ` as ${handle}` : ""}
          </span>
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
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={token}
            placeholder="figd_..."
            autoComplete="off"
            className="rounded border px-2 py-1 text-xs w-64"
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            type="button"
            className="rounded border px-3 py-1 text-xs disabled:opacity-50"
            disabled={busy || !token.trim()}
            onClick={connect}
          >
            {busy ? "Checking..." : "Connect"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
