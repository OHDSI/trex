import { useCallback, useState } from "react";

const KEY = "devx-panel-sizes";

function load(): number[] {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s) as number[];
  } catch { /* ignore */ }
  return [42, 58];
}

export function usePanelSizes() {
  const [initialSizes] = useState(load);
  const save = useCallback((sizes: number[]) => {
    localStorage.setItem(KEY, JSON.stringify(sizes));
  }, []);
  return { initialSizes, saveSizes: save };
}
