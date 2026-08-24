import { useCallback, useEffect, useState } from "react";
import type { AgentModelSelections, AgentName } from "@/lib/types";
import * as api from "@/lib/api";

const EMPTY: AgentModelSelections = { devx: null, claw: null, d2esupport: null };

export function useAgentModelSelection() {
  const [selections, setSelections] = useState<AgentModelSelections>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSelections(await api.getAgentModelSelections());
    } catch {
      setSelections(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setSelection = useCallback(async (agent: AgentName, providerConfigId: string) => {
    await api.setAgentModelSelection(agent, providerConfigId);
    await refresh();
  }, [refresh]);

  const clearSelection = useCallback(async (agent: AgentName) => {
    await api.clearAgentModelSelection(agent);
    await refresh();
  }, [refresh]);

  return { selections, loading, setSelection, clearSelection, refresh };
}
