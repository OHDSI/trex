import { useState, useEffect, useCallback } from "react";
import type { App } from "@/lib/types";
import * as api from "@/lib/api";

export function useApps() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listApps();
      setApps(data);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load apps:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tryLoad = async (attempt = 0) => {
      try {
        const data = await api.listApps();
        if (!cancelled) {
          setApps(data);
          setLoading(false);
        }
      } catch {
        // Retry with backoff (1s, 2s, 4s, max 5s) — backend may still be starting
        if (!cancelled && attempt < 10) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          timeout = setTimeout(() => tryLoad(attempt + 1), delay);
        } else if (!cancelled) {
          setLoading(false);
        }
      }
    };

    tryLoad();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const create = useCallback(async (name: string, template?: string) => {
    const app = await api.createApp(name, template);
    setApps((prev) => [app, ...prev]);
    return app;
  }, []);

  const remove = useCallback(async (appId: string) => {
    await api.deleteApp(appId);
    setApps((prev) => prev.filter((a) => a.id !== appId));
  }, []);

  const update = useCallback(async (appId: string, data: Partial<App>) => {
    const updated = await api.updateApp(appId, data);
    setApps((prev) => prev.map((a) => (a.id === appId ? updated : a)));
    return updated;
  }, []);

  return { apps, loading, refresh, create, remove, update };
}
