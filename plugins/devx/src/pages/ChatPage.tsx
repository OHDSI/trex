import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Settings, PanelLeft, Columns2, PanelRight } from "lucide-react";
import { ChatPanel } from "@/components/ChatPanel";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { AppSelector } from "@/components/AppSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useChats } from "@/hooks/useChats";
import { useApps } from "@/hooks/useApps";
import { useSettings } from "@/hooks/useSettings";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import { cn } from "@/lib/utils";
import type { ChatMode } from "@/lib/types";
import { LAYOUT_MODES } from "@/lib/types";
import type { SelectedElement, SelectedComponent, VisualEditContext } from "@/lib/visual-editing-types";

export default function ChatPage() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const { chats, create, remove, updateMode } = useChats(activeAppId);
  const { apps, loading: appsLoading, create: createApp, remove: removeApp } = useApps();
  useSettings(); // pre-load settings for navigation to settings page
  const [isResizing, setIsResizing] = useState(false);
  const [modeOverride, setModeOverride] = useState<ChatMode | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visualEditContext, setVisualEditContext] = useState<VisualEditContext | null>(null);
  const [selectedComponents, setSelectedComponents] = useState<SelectedComponent[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const sendRef = useRef<((msg: string) => void) | null>(null);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);
  const { layoutMode, setLayoutMode, panelAssignment } = useLayoutMode();

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

  // Auto-select the first chat when chats load and none is selected
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, [chats, activeChatId]);

  const activeChat = chats.find((c) => c.id === activeChatId);
  const currentMode: ChatMode = modeOverride ?? activeChat?.mode ?? "agent";

  const handleNewChat = useCallback(async () => {
    const chat = await create("New Chat", currentMode, activeAppId);
    setActiveChatId(chat.id);
    setModeOverride(null);
  }, [create, currentMode, activeAppId]);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await remove(chatId);
      if (activeChatId === chatId) {
        setActiveChatId(chats.find((c) => c.id !== chatId)?.id || null);
        setModeOverride(null);
      }
    },
    [remove, activeChatId, chats],
  );

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setModeOverride(null);
  }, []);

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
    async (name: string, template?: string) => {
      const app = await createApp(name, template);
      setActiveAppId(app.id);
      return app;
    },
    [createApp],
  );

  const handleDeleteApp = useCallback(
    async (appId: string) => {
      await removeApp(appId);
      if (activeAppId === appId) setActiveAppId(null);
    },
    [removeApp, activeAppId],
  );

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Drive panel collapse/expand from layout mode
  useEffect(() => {
    const leftPanel = chatPanelRef.current;
    const rightPanel = previewPanelRef.current;
    if (!leftPanel || !rightPanel) return;
    switch (layoutMode) {
      case "left-only":
        leftPanel.expand();
        rightPanel.collapse();
        break;
      case "right-only":
        leftPanel.collapse();
        rightPanel.expand();
        break;
      case "split":
      default:
        leftPanel.expand();
        rightPanel.expand();
        break;
    }
  }, [layoutMode]);

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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 h-12 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">DevX</h1>
          <AppSelector
            apps={apps}
            loading={appsLoading}
            activeAppId={activeAppId}
            onSelectApp={setActiveAppId}
            onCreateApp={handleCreateApp}
            onDeleteApp={handleDeleteApp}
          />
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center border rounded-md">
            {LAYOUT_MODES.map((mode) => {
              const Icon = mode.id === "left-only" ? PanelLeft : mode.id === "split" ? Columns2 : PanelRight;
              return (
                <Button
                  key={mode.id}
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-none first:rounded-l-md last:rounded-r-md",
                    layoutMode === mode.id && "bg-accent",
                  )}
                  onClick={() => setLayoutMode(mode.id)}
                  title={mode.label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
          <ThemeToggle />
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* 3-panel layout */}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel
          defaultSize={sidebarCollapsed ? 4 : 20}
          minSize={sidebarCollapsed ? 3 : 15}
          maxSize={sidebarCollapsed ? 5 : 35}
        >
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
          />
        </Panel>

        <PanelResizeHandle
          onDragging={setIsResizing}
          className="w-1 bg-border hover:bg-primary/20 transition-colors cursor-col-resize"
        />

        <Panel
          ref={chatPanelRef}
          defaultSize={50}
          minSize={30}
          collapsible
          onCollapse={() => { if (layoutMode !== "right-only") setLayoutMode("right-only"); }}
          onExpand={() => { if (layoutMode === "right-only") setLayoutMode("split"); }}
          className={cn(!isResizing && "transition-all duration-100 ease-in-out")}
        >
          {panelAssignment.left === "chat" ? (
            <ChatPanel
              chatId={activeChatId}
              mode={currentMode}
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
          ) : (
            <PreviewPanel appId={activeAppId} planContent={planContent} chatMode={currentMode} onEditWithAI={handleEditWithAI} onComponentsSelected={handleComponentsSelected} refreshSignal={refreshSignal} onFixPrompt={handleFixPrompt} />
          )}
        </Panel>

        <PanelResizeHandle
          onDragging={setIsResizing}
          className="w-1 bg-border hover:bg-primary/20 transition-colors cursor-col-resize"
        />

        <Panel
          ref={previewPanelRef}
          defaultSize={30}
          minSize={20}
          collapsible
          onCollapse={() => { if (layoutMode !== "left-only") setLayoutMode("left-only"); }}
          onExpand={() => { if (layoutMode === "left-only") setLayoutMode("split"); }}
          className={cn(!isResizing && "transition-all duration-100 ease-in-out")}
        >
          {panelAssignment.right === "preview" ? (
            <PreviewPanel appId={activeAppId} planContent={planContent} chatMode={currentMode} onEditWithAI={handleEditWithAI} onComponentsSelected={handleComponentsSelected} refreshSignal={refreshSignal} onFixPrompt={handleFixPrompt} />
          ) : (
            <ChatPanel
              chatId={activeChatId}
              mode={currentMode}
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
        </Panel>
      </PanelGroup>
    </div>
  );
}
