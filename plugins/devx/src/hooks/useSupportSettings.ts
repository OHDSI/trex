import { useState, useEffect, useCallback } from "react";
import type { UserMapEntry, SlackAllowlistEntry } from "@/lib/types";
import * as api from "@/lib/api";

export function useSupportSettings() {
  const [userMap, setUserMap] = useState<UserMapEntry[]>([]);
  const [allowlist, setAllowlist] = useState<SlackAllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [map, allow] = await Promise.all([api.listUserMap(), api.listSlackAllowlist()]);
      setUserMap(map);
      setAllowlist(allow);
    } catch (err) {
      console.error("Failed to load support settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveMapping = useCallback(async (entry: { github_login: string; discord_user_id: string; display_name?: string }) => {
    const saved = await api.saveUserMapEntry(entry);
    setUserMap((prev) => {
      const rest = prev.filter((e) => e.id !== saved.id && e.github_login !== saved.github_login);
      return [...rest, saved].sort((a, b) => a.github_login.localeCompare(b.github_login));
    });
    return saved;
  }, []);

  const removeMapping = useCallback(async (id: string) => {
    await api.deleteUserMapEntry(id);
    setUserMap((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addAllowed = useCallback(async (entry: { slack_user_id: string; note?: string }) => {
    const saved = await api.addSlackAllowlistEntry(entry);
    setAllowlist((prev) => [...prev.filter((e) => e.id !== saved.id), saved]);
    return saved;
  }, []);

  const removeAllowed = useCallback(async (id: string) => {
    await api.deleteSlackAllowlistEntry(id);
    setAllowlist((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { userMap, allowlist, loading, refresh, saveMapping, removeMapping, addAllowed, removeAllowed };
}
