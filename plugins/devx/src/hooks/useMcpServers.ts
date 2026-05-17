import { useState, useEffect, useCallback } from "react";
import type { McpServer } from "@/lib/types";
import * as api from "@/lib/api";

export function useMcpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listMcpServers();
      setServers(data);
    } catch (err) {
      console.error("Failed to load MCP servers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (config: Partial<McpServer>) => {
    const server = await api.createMcpServer(config);
    setServers((prev) => [...prev, server]);
    return server;
  }, []);

  const update = useCallback(async (id: string, config: Partial<McpServer>) => {
    const server = await api.updateMcpServer(id, config);
    setServers((prev) => prev.map((s) => (s.id === id ? server : s)));
    return server;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteMcpServer(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    return update(id, { enabled } as Partial<McpServer>);
  }, [update]);

  return { servers, loading, refresh, create, update, remove, toggle };
}
