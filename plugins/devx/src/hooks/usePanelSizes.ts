import { useCallback } from "react";

const KEY = "devx-panel-sizes";

export function usePanelSizes() {
  const load = (): number[] => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) return JSON.parse(s) as number[];
    } catch { /* ignore */ }
    return [42, 58];
  };
  const save = useCallback((sizes: number[]) => {
    localStorage.setItem(KEY, JSON.stringify(sizes));
  }, []);
  return { initialSizes: load(), saveSizes: save };
}
