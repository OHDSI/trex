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

  const active = configs.find((c) => c.is_active) || null;

  return { configs, active, loading, create, update, remove, activate, refresh };
}
