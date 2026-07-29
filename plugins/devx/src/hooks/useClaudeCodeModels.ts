import { useState, useEffect, useCallback } from "react";
import type { ModelInfo } from "@/lib/types";
import * as api from "@/lib/api";

export function useClaudeCodeModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [source, setSource] = useState<string>("fallback");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.getClaudeCodeModels();
      setModels(data.models);
      setSource(data.source);
    } catch {
      setModels([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { models, source, loading, error, refresh };
}
