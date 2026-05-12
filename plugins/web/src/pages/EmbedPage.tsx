import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { BASE_PATH } from "@/lib/config";

/** Renders an external plugin app inside an iframe that fills the content area.
 *  For Studio, exchanges the access token for an sb-access-token cookie first
 *  — same-origin iframes can't read the parent's localStorage. */
export function EmbedPage({ plugin }: { plugin: string }) {
  const [ready, setReady] = useState(false);
  const src = `/plugins/trex/${plugin}/`;

  useEffect(() => {
    if (plugin !== "studio") { setReady(true); return; }
    let cancelled = false;
    (async () => {
      const token = authClient.getAccessToken();
      if (token) {
        try {
          await fetch(`${BASE_PATH}/auth/v1/sync-cookie`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch { /* iframe will surface its own 401 if auth is missing */ }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [plugin]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <iframe
      src={src}
      className="w-full border-0"
      style={{ height: "calc(100vh - 3.5rem)" }}
      title={plugin}
    />
  );
}
