import { useState, useEffect, useCallback } from "react";
import type { DevxSettings } from "@/lib/types";
import * as api from "@/lib/api";

export function useSettings() {
  const [settings, setSettings] = useState<DevxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((data) => {
      setSettings(data);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings");
      setLoading(false);
    });
  }, []);

  const save = useCallback(async (updates: Partial<DevxSettings>) => {
    setError(null);
    try {
      const saved = await api.saveSettings(updates);
      setSettings(saved);
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      setError(msg);
      throw err;
    }
  }, []);

  return { settings, loading, error, save };
}
