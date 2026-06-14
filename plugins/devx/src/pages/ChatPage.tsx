import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import { Settings, Box } from "lucide-react";
import { ChatPanel } from "@/components/ChatPanel";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { Button } from "@/components/ui/button";
import { Breadcrumb, type Crumb } from "@/components/nav/Breadcrumb";
import { AppsOverview } from "@/components/nav/AppsOverview";
import { ChatsOverview } from "@/components/nav/ChatsOverview";
import { useChats } from "@/hooks/useChats";
import { useApps } from "@/hooks/useApps";
import { useSettings } from "@/hooks/useSettings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useNavState } from "@/hooks/useNavState";
import { usePanelSizes } from "@/hooks/usePanelSizes";
import type { ChatMode } from "@/lib/types";
import type { SelectedElement, SelectedComponent, VisualEditContext } from "@/lib/visual-editing-types";

export default function ChatPage() {
  const nav = useNavState();
  const { activeAppId, activeChatId } = nav;
  const { chats, loading: chatsLoading, create, remove, updateMode } = useChats(activeAppId);
  const { apps, loading: appsLoading, create: createApp, remove: removeApp } = useApps();
  useSettings(); // pre-load settings for navigation to settings page
  const { initialSizes, saveSizes } = usePanelSizes();
  const [modeOverride, setModeOverride] = useState<ChatMode | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [visualEditContext, setVisualEditContext] = useState<VisualEditContext | null>(null);
  const [selectedComponents, setSelectedComponents] = useState<SelectedComponent[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const sendRef = useRef<((msg: string) => void) | null>(null);

  const handleAppCommand = useCallback((command: string) => {
    if (command === "refresh") {
      setRefreshSignal((n) => n + 1);
    }
  }, []);

  const handleBuildAction = useCallback(() => {
    setRefreshSignal((n) => n + 1);
  }, []);

  const handleFixPrompt = useCallback((prompt: string) => {
    sendRef.current?.(prompt);
  }, []);

  const activeApp = apps.find((a) => a.id === activeAppId);
  const activeChat = chats.find((c) => c.id === activeChatId);
  const currentMode: ChatMode = modeOverride ?? activeChat?.mode ?? "agent";

  const handleNewChat = useCallback(async () => {
    const chat = await create("New Chat", currentMode, activeAppId);
    nav.openChat(chat.id);
    setModeOverride(null);
  }, [create, currentMode, activeAppId, nav]);

  const handleSelectChat = useCallback((chatId: string) => {
    nav.openChat(chatId);
    setModeOverride(null);
  }, [nav]);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await remove(chatId);
      if (activeChatId === chatId) {
        nav.setActiveChatId(null);
        nav.showAppChats();
        setModeOverride(null);
      }
    },
    [remove, activeChatId, nav],
  );

  const handleModeChange = useCallback(
    async (mode: ChatMode) => {
      setModeOverride(mode);
      if (activeChatId) {
        try {
          await updateMode(activeChatId, mode);
          setModeOverride(null);
        } catch (err) {
          console.error("Failed to update chat mode:", err);
        }
      }
    },
    [activeChatId, updateMode],
  );

  const handleCreateApp = useCallback(
    async (name: string, opts?: { template?: string; gitUrl?: string }) => {
      const app = await createApp(name, opts);
      nav.openApp(app.id);
      return app;
    },
    [createApp, nav],
  );

  const handleDeleteApp = useCallback(
    async (appId: string) => {
      await removeApp(appId);
      if (activeAppId === appId) nav.goToApps();
    },
    [removeApp, activeAppId, nav],
  );

  const handleEditWithAI = useCallback((element: SelectedElement) => {
    setVisualEditContext({
      filePath: element.filePath,
      line: element.line,
      componentName: element.devxName,
    });
  }, []);

  const handleComponentsSelected = useCallback((components: SelectedComponent[]) => {
    setSelectedComponents(components);
  }, []);

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(() => ({
    onNewChat: handleNewChat,
  }), [handleNewChat]);
  useKeyboardShortcuts(shortcutHandlers);

  // Reconcile persisted nav state against loaded data: a deleted app/chat
  // restored from localStorage must not strand the user on a dead view.
  useEffect(() => {
    if (!appsLoading && activeAppId && !apps.some((a) => a.id === activeAppId)) {
      nav.goToApps();
      return;
    }
    if (nav.view === "chat" && !chatsLoading && activeChatId && !chats.some((c) => c.id === activeChatId)) {
      nav.showAppChats();
    }
  }, [appsLoading, chatsLoading, apps, chats, activeAppId, activeChatId, nav]);

  // Breadcrumb model: Apps / <app> / <chat>
  const crumbs: Crumb[] = [{
    key: "apps",
    label: "Apps",
    icon: Box,
    onNavigate: nav.view === "apps" ? undefined : nav.goToApps,
  }];
  if (nav.view !== "apps") {
    crumbs.push({
      key: "app",
      label: activeAppId === null ? "Quick chat" : activeApp?.name ?? "Loading…",
      onNavigate: nav.view === "chat" ? nav.showAppChats : undefined,
      siblings: apps.filter((a) => a.id !== activeAppId).map((a) => ({ id: a.id, label: a.name })),
      onSwitch: (id) => nav.openApp(id),
    });
  }
  if (nav.view === "chat") {
    crumbs.push({
      key: "chat",
      label: activeChat?.title || "New Chat",
      siblings: chats.filter((c) => c.id !== activeChatId).map((c) => ({ id: c.id, label: c.title || "New Chat" })),
      onSwitch: (id) => handleSelectChat(id),
      onNew: handleNewChat,
      newLabel: "New chat",
    });
  }

  const settingsAction = (
    <Link to="/settings">
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Settings">
        <Settings className="h-4 w-4" />
      </Button>
    </Link>
  );

  return (
    <div className="h-full">
      {/* Two-pane layout (no header — the trex shell provides chrome; settings live in the panels) */}
      <PanelGroup direction="horizontal" className="h-full" onLayout={saveSizes}>
        <Panel defaultSize={initialSizes[0]} minSize={24} collapsible className="flex flex-col min-h-0">
          {nav.view === "apps" && (
            <AppsOverview
              apps={apps}
              loading={appsLoading}
              onOpenApp={nav.openApp}
              onOpenFreeChat={nav.openFreeChat}
              onCreateApp={handleCreateApp}
              onDeleteApp={handleDeleteApp}
              settingsAction={settingsAction}
            />
          )}
          {nav.view !== "apps" && (
            <>
              {/* Breadcrumb stays pinned; the content below it owns the scroll */}
              <Breadcrumb crumbs={crumbs} actions={settingsAction} />
              <div className="flex-1 min-h-0">
                {nav.view === "app" && (
                  <ChatsOverview
                    chats={chats}
                    onOpenChat={handleSelectChat}
                    onNewChat={handleNewChat}
                    onDeleteChat={handleDeleteChat}
                  />
                )}
                {nav.view === "chat" && (
                  <ChatPanel
                    chatId={activeChatId}
                    onModeChange={handleModeChange}
                    onPlanContentChange={setPlanContent}
                    visualEditContext={visualEditContext}
                    onClearVisualEditContext={() => setVisualEditContext(null)}
                    selectedComponents={selectedComponents}
                    onRemoveSelectedComponent={(devxId) => setSelectedComponents((prev) => prev.filter((c) => c.devxId !== devxId))}
                    onClearSelectedComponents={() => setSelectedComponents([])}
                    onAppCommand={handleAppCommand}
                    onBuildAction={handleBuildAction}
                    sendRef={sendRef}
                    onNewChat={handleNewChat}
                  />
                )}
              </div>
            </>
          )}
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/20 transition-colors cursor-col-resize" />

        <Panel defaultSize={initialSizes[1]} minSize={30} collapsible>
          <PreviewPanel
            appId={activeAppId}
            planContent={planContent}
            chatMode={currentMode}
            onEditWithAI={handleEditWithAI}
            onComponentsSelected={handleComponentsSelected}
            refreshSignal={refreshSignal}
            onFixPrompt={handleFixPrompt}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
