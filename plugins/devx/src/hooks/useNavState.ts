import { useState, useEffect, useCallback } from "react";

export type NavView = "apps" | "app" | "chat";

interface NavState {
  view: NavView;
  activeAppId: string | null;
  activeChatId: string | null;
}

const KEY = "devx-nav-state";

function load(): NavState {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s) as NavState;
  } catch { /* ignore */ }
  return { view: "apps", activeAppId: null, activeChatId: null };
}

export function useNavState() {
  const [state, setState] = useState<NavState>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const goToApps = useCallback(() => setState((s) => ({ ...s, view: "apps" })), []);

  const openApp = useCallback((appId: string) =>
    setState((s) => ({
      view: "app",
      activeAppId: appId,
      // keep the chat only if it belongs to the same app session; otherwise clear
      activeChatId: s.activeAppId === appId ? s.activeChatId : null,
    })), []);

  const openFreeChat = useCallback(() =>
    setState({ view: "app", activeAppId: null, activeChatId: null }), []);

  const openChat = useCallback((chatId: string) =>
    setState((s) => ({ ...s, view: "chat", activeChatId: chatId })), []);

  const showAppChats = useCallback(() => setState((s) => ({ ...s, view: "app" })), []);

  const setActiveChatId = useCallback((chatId: string | null) =>
    setState((s) => ({ ...s, activeChatId: chatId, view: chatId ? "chat" : s.view })), []);

  return {
    ...state,
    goToApps,
    openApp,
    openFreeChat,
    openChat,
    showAppChats,
    setActiveChatId,
    setActiveAppId: openApp,
  };
}
