import { useState, useCallback, useEffect } from "react";

export interface EditorTab {
  filePath: string;
  label: string;
  isModified: boolean;
}

function getLabel(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

function loadPersistedTabs(appId: string | null): { tabs: EditorTab[]; activeTab: string | null } {
  if (!appId) return { tabs: [], activeTab: null };
  try {
    const raw = localStorage.getItem(`devx-tabs-${appId}`);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        tabs: (data.tabs || []).map((t: any) => ({ filePath: t.filePath, label: getLabel(t.filePath), isModified: false })),
        activeTab: data.activeTab || null,
      };
    }
  } catch { /* ignore */ }
  return { tabs: [], activeTab: null };
}

export function useEditorTabs(appId?: string | null) {
  const [tabs, setTabs] = useState<EditorTab[]>(() => loadPersistedTabs(appId ?? null).tabs);
  const [activeTab, setActiveTab] = useState<string | null>(() => loadPersistedTabs(appId ?? null).activeTab);

  // Persist tabs to localStorage
  useEffect(() => {
    if (!appId) return;
    const data = { tabs: tabs.map((t) => ({ filePath: t.filePath })), activeTab };
    localStorage.setItem(`devx-tabs-${appId}`, JSON.stringify(data));
  }, [tabs, activeTab, appId]);

  // Reset when appId changes
  useEffect(() => {
    const persisted = loadPersistedTabs(appId ?? null);
    setTabs(persisted.tabs);
    setActiveTab(persisted.activeTab);
  }, [appId]);

  const openFile = useCallback((filePath: string) => {
    setTabs((prev) => {
      if (prev.some((t) => t.filePath === filePath)) return prev;
      return [...prev, { filePath, label: getLabel(filePath), isModified: false }];
    });
    setActiveTab(filePath);
  }, []);

  const closeTab = useCallback((filePath: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.filePath === filePath);
      const next = prev.filter((t) => t.filePath !== filePath);
      // If closing the active tab, switch to adjacent
      setActiveTab((current) => {
        if (current !== filePath) return current;
        const adjacent = prev[idx - 1] || prev[idx + 1];
        return adjacent?.filePath ?? null;
      });
      return next;
    });
  }, []);

  const setModified = useCallback((filePath: string, modified: boolean) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.filePath === filePath ? { ...t, isModified: modified } : t,
      ),
    );
  }, []);

  return { tabs, activeTab, openFile, closeTab, setModified, setActiveTab };
}
