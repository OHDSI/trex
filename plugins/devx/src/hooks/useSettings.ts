import { useState, useEffect, useCallback } from "react";
import type { DevxSettings } from "@/lib/types";
import * as api from "@/lib/api";

export function useSettings() {
  const [settings, setSettings] = useState<DevxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (updates: Partial<DevxSettings>) => {
    setError(null);
    try {
      const saved = await api.saveSettings(updates);
      // PUT /settings' RETURNING clause deliberately omits the key columns, so
      // its response carries no api_key/auth_shape/key_status/is_plaintext.
      // Storing it verbatim would drop all four until the next page load —
      // auth_shape is the credential-shape hint this Settings UI displays and
      // is_plaintext gates the encrypt-stored-keys offer, so both would
      // silently read as "not set" after any unrelated save. Refetch instead,
      // so what's in state is always the shape GET returns.
      await refresh();
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      setError(msg);
      throw err;
    }
  }, [refresh]);

  return { settings, loading, error, save, refresh };
}
