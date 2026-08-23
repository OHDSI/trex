import { useState, useEffect, useCallback } from "react";
import type { ProviderConfigRecord } from "@/lib/types";
import * as api from "@/lib/api";

export function useProviderConfigs() {
  const [configs, setConfigs] = useState<ProviderConfigRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getProviderConfigs();
      setConfigs(data);
    } catch {
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (config: {
    provider: string;
    model: string;
    api_key?: string;
    base_url?: string;
    display_name?: string;
  }) => {
    const created = await api.createProviderConfig(config);
    await refresh();
    return created;
  }, [refresh]);

  const update = useCallback(async (
    id: string,
    updates: Partial<{ provider: string; model: string; api_key: string; base_url: string; display_name: string }>,
  ) => {
    const updated = await api.updateProviderConfig(id, updates);
    await refresh();
    return updated;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await api.deleteProviderConfig(id);
    await refresh();
  }, [refresh]);

  const activate = useCallback(async (id: string) => {
    await api.activateProviderConfig(id);
    await refresh();
  }, [refresh]);

  // Backfill: encrypts every row still holding a plaintext api_key. Refreshes
  // afterwards so `configs` reflects the migrated rows (masked key/key_status
  // are unaffected — encryption only changes at-rest storage, never the
  // resolved value shown in the UI).
  const encryptExisting = useCallback(async () => {
    const result = await api.encryptExistingKeys();
    await refresh();
    return result;
  }, [refresh]);

  const active = configs.find((c) => c.is_active) || null;

  return { configs, active, loading, create, update, remove, activate, encryptExisting, refresh };
}
