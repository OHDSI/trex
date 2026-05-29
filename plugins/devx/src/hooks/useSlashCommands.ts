import { useState, useEffect, useCallback, useRef } from "react";
import type { SlashCompletion } from "../lib/types";
import * as api from "../lib/api";

/**
 * Hook for slash command autocomplete.
 * Fetches completions when query changes, with debouncing.
 */
export function useSlashCommands() {
  const [items, setItems] = useState<SlashCompletion[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, SlashCompletion[]>>(new Map());
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchCompletions = useCallback(async (query: string) => {
    // Check cache
    const cached = cacheRef.current.get(query);
    if (cached) {
      setItems(cached);
      return;
    }

    setLoading(true);
    try {
      const results = await api.getSlashCompletions(query);
      cacheRef.current.set(query, results);
      setItems(results);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback((query: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => fetchCompletions(query), 100);
  }, [fetchCompletions]);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { items, loading, search, clearCache };
}
