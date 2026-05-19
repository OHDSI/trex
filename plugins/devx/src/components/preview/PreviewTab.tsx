import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { RefreshCw, Smartphone, Tablet, Monitor, Play, Square, MousePointer2, Terminal, Sparkles, Plus, Layers, ZoomIn, ZoomOut, Maximize, Eye, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { API_BASE } from "@/lib/config";
import type { useDevServer } from "@/hooks/useDevServer";
import { PreviewAnnotator } from "./PreviewAnnotator";
import { VisualEditingToolbar } from "./VisualEditingToolbar";
import { VisualEditingChangesDialog } from "./VisualEditingChangesDialog";
import { InsertElementToolbar } from "./InsertElementToolbar";
import { LayersPanel } from "./LayersPanel";
import { ElementContextMenu } from "./ElementContextMenu";
import { ConsoleTab } from "./ConsoleTab";
import type { SelectedElement, SelectedComponent, PendingChange } from "@/lib/visual-editing-types";
import * as api from "@/lib/api";
import { PreviewConfigBar } from "./PreviewConfigBar";
import type { App } from "@/lib/types";
import type { Prototype } from "@/lib/api";
import { createIframeRpc } from "@/lib/visual-editing-rpc";

const VIEWPORT_PRESETS = [
  { label: "Mobile", icon: Smartphone, width: 375 },
  { label: "Tablet", icon: Tablet, width: 768 },
  { label: "Desktop", icon: Monitor, width: 0 }, // 0 = 100%
];

interface PreviewTabProps {
  appId: string;
  app?: App | null;
  devServer: ReturnType<typeof useDevServer>;
  onEditWithAI?: (element: SelectedElement) => void;
  onComponentsSelected?: (components: SelectedComponent[]) => void;
  refreshSignal?: number;
  appConfig?: Record<string, string> | null;
  onConfigChanged?: (config: Record<string, string>) => void;
  onOpenFile?: (path: string) => void;
}

export function PreviewTab({ appId, app, devServer, onEditWithAI, onComponentsSelected, refreshSignal, appConfig, onConfigChanged, onOpenFile }: PreviewTabProps) {
  const { status, start, stop } = devServer;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [annotatorEnabled, setAnnotatorEnabled] = useState(false);
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[] | null>(null);
  const [insertToolbarVisible, setInsertToolbarVisible] = useState(false);
  const [layersPanelVisible, setLayersPanelVisible] = useState(false);
  const [consoleVisible, setConsoleVisible] = useState(false);
  const [copiedElementHTML, setCopiedElementHTML] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [selectedPrototype, setSelectedPrototype] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const [panMode, setPanMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    devxId: string;
    devxName: string;
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consolePanelRef = useRef<ImperativePanelHandle>(null);
  const layersRpcRef = useRef<ReturnType<typeof createIframeRpc> | null>(null);
  const layersRpc = useMemo(() => {
    layersRpcRef.current?.destroy();
    const rpc = createIframeRpc(iframeRef.current);
    layersRpcRef.current = rpc;
    return rpc;
  }, [iframeRef.current, layersPanelVisible]);
  useEffect(() => {
    return () => { layersRpcRef.current?.destroy(); };
  }, []);

  const isRunning = status.status === "running";
  const isStarting = status.status === "starting";
  const token = (() => {
    try {
      const raw = localStorage.getItem("trex.auth.session");
      if (raw) return JSON.parse(raw).access_token;
    } catch { /* ignore */ }
    return null;
  })();
  const proxyUrl = (() => {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (appConfig) {
      for (const [k, v] of Object.entries(appConfig)) {
        if (v) params.set(k, v);
      }
    }
    const qs = params.toString();
    const subPath = selectedPrototype
      ? `prototypes/${selectedPrototype}/index.html`
      : "";
    return `${API_BASE}/apps/${appId}/proxy/${subPath}${qs ? `?${qs}` : ""}`;
  })();

  const loadPrototypes = useCallback(() => {
    api.listPrototypes(appId)
      .then((list) => {
        setPrototypes(list);
        // If the currently-selected prototype no longer exists, fall back to app.
        if (selectedPrototype && !list.some((p) => p.name === selectedPrototype)) {
          setSelectedPrototype(null);
        }
      })
      .catch(() => setPrototypes([]));
  }, [appId, selectedPrototype]);

  useEffect(() => {
    if (isRunning) loadPrototypes();
  }, [isRunning, refreshSignal, loadPrototypes]);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  // Refresh iframe when refreshSignal changes (triggered by agent's refresh_app_preview tool)
  useEffect(() => {
    if (refreshSignal && refreshSignal > 0) {
      handleRefresh();
    }
  }, [refreshSignal, handleRefresh]);

  const toggleConsole = useCallback(() => {
    const panel = consolePanelRef.current;
    if (!panel) return;
    if (consoleVisible) panel.collapse();
    else panel.expand();
  }, [consoleVisible]);

  const handleSelectElement = useCallback((element: SelectedElement) => {
    setSelectedElement(element);
  }, []);

  const handleCloseAnnotator = useCallback(() => {
    setAnnotatorEnabled(false);
    setSelectedElement(null);
  }, []);

  const handleCloseToolbar = useCallback(() => {
    setSelectedElement(null);
  }, []);

  const handleEditWithAI = useCallback(
    (element: SelectedElement) => {
      onEditWithAI?.(element);
    },
    [onEditWithAI],
  );

  // Multi-select mode: activate/deactivate and listen for messages
  useEffect(() => {
    if (!multiSelectEnabled) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const contentWindow = iframe.contentWindow;
    const timer = setTimeout(() => {
      contentWindow.postMessage({ type: "activate-devx-multi-selector" }, "*");
    }, 100);

    function handleMessage(e: MessageEvent) {
      if (e.source !== contentWindow) return;
      if (e.data?.type === "devx-components-selected") {
        const components: SelectedComponent[] = (e.data.components || []).map(
          (c: { devxId: string; devxName: string }) => {
            const parts = c.devxId.split(":");
            parts.pop(); // col
            const line = parseInt(parts.pop() || "0", 10);
            const filePath = parts.join(":");
            return { devxId: c.devxId, devxName: c.devxName, filePath, line };
          },
        );
        onComponentsSelected?.(components);
      }
      if (e.data?.type === "devx-multi-selector-closed") {
        setMultiSelectEnabled(false);
        onComponentsSelected?.([]);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      try {
        contentWindow.postMessage({ type: "deactivate-devx-multi-selector" }, "*");
      } catch { /* iframe may be destroyed */ }
    };
  }, [multiSelectEnabled, onComponentsSelected]);

  // Listen for context menu events from iframe
  useEffect(() => {
    function handleContextMenu(e: MessageEvent) {
      const contentWindow = iframeRef.current?.contentWindow;
      if (!contentWindow || e.source !== contentWindow) return;
      if (e.data?.type !== "devx-context-menu") return;
      setContextMenu({
        position: e.data.position,
        devxId: e.data.devxId,
        devxName: e.data.devxName,
      });
    }

    window.addEventListener("message", handleContextMenu);
    return () => window.removeEventListener("message", handleContextMenu);
  }, []);

  // Listen for drag-to-reorder events from iframe and apply them via RPC
  useEffect(() => {
    function handleDragMove(e: MessageEvent) {
      const iframe = iframeRef.current;
      const contentWindow = iframe?.contentWindow;
      if (!contentWindow || e.source !== contentWindow) return;
      if (e.data?.type !== "devx-element-moved") return;

      const { devxId, parentDevxId, fromIndex, toIndex } = e.data;
      if (!devxId || fromIndex === toIndex) return;

      // Move element in DOM via RPC
      const rpc = createIframeRpc(iframe);
      rpc.moveElement(devxId, parentDevxId, toIndex).catch(() => {}).finally(() => rpc.destroy());

      // Build a PendingChange for save
      const parts = parentDevxId.split(":");
      const col = parseInt(parts.pop() || "1", 10);
      const line = parseInt(parts.pop() || "0", 10);
      const filePath = parts.join(":");
      if (filePath && line > 0) {
        setPendingChanges([{
          componentId: parentDevxId,
          componentName: "parent",
          filePath,
          line,
          col,
          styles: {},
          moveChild: { fromIndex, toIndex },
        }]);
      }
    }

    window.addEventListener("message", handleDragMove);
    return () => window.removeEventListener("message", handleDragMove);
  }, []);

  // Listen for resize events from iframe
  useEffect(() => {
    function handleResize(e: MessageEvent) {
      const contentWindow = iframeRef.current?.contentWindow;
      if (!contentWindow || e.source !== contentWindow) return;
      if (e.data?.type !== "devx-element-resized") return;

      const { devxId, width, height } = e.data;
      if (!devxId) return;

      const parts = devxId.split(":");
      const col = parseInt(parts.pop() || "1", 10);
      const line = parseInt(parts.pop() || "0", 10);
      const filePath = parts.join(":");
      if (filePath && line > 0) {
        setPendingChanges([{
          componentId: devxId,
          componentName: "element",
          filePath,
          line,
          col,
          styles: { sizing: { width, height } },
        }]);
      }
    }

    window.addEventListener("message", handleResize);
    return () => window.removeEventListener("message", handleResize);
  }, []);

  // Handle element insertion
  const handleInsertElement = useCallback((parentDevxId: string, index: number, tagName: string, classes: string, text: string) => {
    // Insert in DOM via RPC
    const iframe = iframeRef.current;
    if (iframe) {
      const rpc = createIframeRpc(iframe);
      rpc.insertElement(parentDevxId, index, tagName, classes, text).catch(() => {}).finally(() => rpc.destroy());
    }

    // Parse parent's devxId for file/line info
    const parts = parentDevxId.split(":");
    const col = parseInt(parts.pop() || "1", 10);
    const line = parseInt(parts.pop() || "0", 10);
    const filePath = parts.join(":");
    if (filePath && line > 0) {
      setPendingChanges([{
        componentId: parentDevxId,
        componentName: "parent",
        filePath,
        line,
        col,
        styles: {},
        insertChild: { index, tagName, classes, text },
      }]);
    }
    setInsertToolbarVisible(false);
  }, []);

  const handleSaveChanges = useCallback((changes: PendingChange[]) => {
    setPendingChanges(changes);
  }, []);

  const handleConfirmSave = useCallback(async () => {
    if (!pendingChanges) return;
    try {
      await api.applyVisualEdit(appId, pendingChanges);
      setPendingChanges(null);
      setSelectedElement(null);
      // Refresh iframe to show updated code
      handleRefresh();
    } catch (err) {
      console.error("Failed to save visual changes:", err);
    }
  }, [appId, pendingChanges]);

  const handleCancelSave = useCallback(() => {
    setPendingChanges(null);
  }, []);

  // === Keyboard shortcuts ===
  useEffect(() => {
    function parseDevxId(devxId: string) {
      const parts = devxId.split(":");
      const col = parseInt(parts.pop() || "1", 10);
      const line = parseInt(parts.pop() || "0", 10);
      const filePath = parts.join(":");
      return { filePath, line, col };
    }

    async function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const iframe = iframeRef.current;
      if (!iframe) return;

      // Delete selected element
      if ((e.key === "Delete" || e.key === "Backspace") && selectedElement && !mod) {
        // Don't intercept if user is typing in an input
        if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try {
          const parentInfo = await rpc.getParentInfo(selectedElement.devxId);
          if (!parentInfo) return;
          await rpc.removeElement(selectedElement.devxId);
          const { filePath, line, col } = parseDevxId(parentInfo.parentDevxId);
          if (filePath && line > 0) {
            setPendingChanges([{
              componentId: parentInfo.parentDevxId,
              componentName: "parent",
              filePath, line, col,
              styles: {},
              removeChild: { index: parentInfo.index },
            }]);
          }
          setSelectedElement(null);
        } finally { rpc.destroy(); }
      }

      // Copy element (Ctrl+C)
      if (mod && e.key === "c" && selectedElement) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try {
          const html = await rpc.getElementHTML(selectedElement.devxId);
          setCopiedElementHTML(html);
        } finally { rpc.destroy(); }
      }

      // Paste element (Ctrl+V)
      if (mod && e.key === "v" && copiedElementHTML && selectedElement) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try {
          const parentInfo = await rpc.getParentInfo(selectedElement.devxId);
          if (!parentInfo) return;
          await rpc.pasteHTML(parentInfo.parentDevxId, parentInfo.index + 1, copiedElementHTML);
          const { filePath, line, col } = parseDevxId(parentInfo.parentDevxId);
          if (filePath && line > 0) {
            setPendingChanges([{
              componentId: parentInfo.parentDevxId,
              componentName: "parent",
              filePath, line, col,
              styles: {},
              insertChild: { index: parentInfo.index + 1, tagName: "div", classes: "", text: "" },
            }]);
          }
        } finally { rpc.destroy(); }
      }

      // Duplicate element (Ctrl+D)
      if (mod && e.key === "d" && selectedElement) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try {
          const html = await rpc.getElementHTML(selectedElement.devxId);
          const parentInfo = await rpc.getParentInfo(selectedElement.devxId);
          if (!parentInfo) return;
          await rpc.pasteHTML(parentInfo.parentDevxId, parentInfo.index + 1, html);
          const { filePath, line, col } = parseDevxId(parentInfo.parentDevxId);
          if (filePath && line > 0) {
            setPendingChanges([{
              componentId: parentInfo.parentDevxId,
              componentName: "parent",
              filePath, line, col,
              styles: {},
              insertChild: { index: parentInfo.index + 1, tagName: "div", classes: "", text: "" },
            }]);
          }
        } finally { rpc.destroy(); }
      }

      // Cut element (Ctrl+X)
      if (mod && e.key === "x" && selectedElement) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try {
          const html = await rpc.getElementHTML(selectedElement.devxId);
          setCopiedElementHTML(html);
          const parentInfo = await rpc.getParentInfo(selectedElement.devxId);
          if (parentInfo) {
            await rpc.removeElement(selectedElement.devxId);
            const { filePath, line, col } = parseDevxId(parentInfo.parentDevxId);
            if (filePath && line > 0) {
              setPendingChanges([{
                componentId: parentInfo.parentDevxId,
                componentName: "parent",
                filePath, line, col,
                styles: {},
                removeChild: { index: parentInfo.index },
              }]);
            }
          }
          setSelectedElement(null);
        } finally { rpc.destroy(); }
      }

      // Group element (Ctrl+G)
      if (mod && e.key === "g" && !e.shiftKey && selectedElement) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try { await rpc.groupElement(selectedElement.devxId); } finally { rpc.destroy(); }
      }

      // Ungroup element (Ctrl+Shift+G)
      if (mod && e.key === "g" && e.shiftKey && selectedElement) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        try { await rpc.ungroupElement(selectedElement.devxId); } finally { rpc.destroy(); }
      }

      const notTyping = !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]");

      // Toggle preview mode (P key)
      if (e.key === "p" && !mod && notTyping) {
        e.preventDefault();
        setPreviewMode((prev) => !prev);
      }

      // R key: activate insert div mode
      if (e.key === "r" && !mod && notTyping) {
        e.preventDefault();
        setInsertToolbarVisible(true);
      }

      // T key: activate insert text mode
      if (e.key === "t" && !mod && notTyping) {
        e.preventDefault();
        setInsertToolbarVisible(true);
      }

      // Enter: enable text editing on selected element
      if (e.key === "Enter" && !mod && selectedElement && notTyping) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        rpc.enableTextEditing(selectedElement.devxId).catch(() => {}).finally(() => rpc.destroy());
      }

      // Shift+ArrowUp/Down: move element up/down in DOM
      if (e.shiftKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown") && selectedElement && notTyping) {
        e.preventDefault();
        const rpc = createIframeRpc(iframe);
        (async () => {
          try {
            const parentInfo = await rpc.getParentInfo(selectedElement.devxId);
            if (!parentInfo) return;
            const newIndex = e.key === "ArrowUp" ? Math.max(0, parentInfo.index - 1) : parentInfo.index + 1;
            if (newIndex !== parentInfo.index) {
              await rpc.moveElement(selectedElement.devxId, parentInfo.parentDevxId, newIndex);
            }
          } finally { rpc.destroy(); }
        })();
      }

      // Zoom shortcuts
      if (mod && (e.key === "0" || e.key === "=" || e.key === "-") && notTyping) {
        e.preventDefault();
        if (e.key === "0") { setCanvasScale(1); setCanvasPan({ x: 0, y: 0 }); }
        else if (e.key === "=") setCanvasScale((s) => Math.min(3, +(s + 0.1).toFixed(2)));
        else if (e.key === "-") setCanvasScale((s) => Math.max(0.25, +(s - 0.1).toFixed(2)));
      }

      // Escape to deselect
      if (e.key === "Escape" && selectedElement) {
        setSelectedElement(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElement, copiedElementHTML]);

  // Track Space key for pan mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) {
        spaceHeldRef.current = true;
        setPanMode(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        spaceHeldRef.current = false;
        setPanMode(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Zoom/pan handlers
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setCanvasScale((s) => Math.max(0.25, Math.min(3, +(s + delta).toFixed(2))));
    }
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y };
    }
  }, [canvasPan]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    setCanvasPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
  }, []);

  const handleCanvasMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  return (
    <PanelGroup direction="vertical">
      <Panel defaultSize={75} minSize={20} id="preview">
        <div className="flex flex-col h-full">
          {/* Controls bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
            {!isRunning && !isStarting ? (
              <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={start}>
                <Play className="h-3 w-3" />
                Start
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={stop}>
                <Square className="h-3 w-3" />
                Stop
              </Button>
            )}

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} disabled={!isRunning}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            {/* Prototypes dropdown */}
            <DropdownMenu onOpenChange={(open) => { if (open) loadPrototypes(); }}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={selectedPrototype ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  disabled={!isRunning}
                  title={
                    prototypes.length === 0
                      ? "No prototypes yet — ask the assistant to build one"
                      : "Switch between app and prototypes"
                  }
                >
                  <FlaskConical className="h-3 w-3" />
                  {selectedPrototype || "Prototypes"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => setSelectedPrototype(null)}
                  className="gap-2 text-xs"
                >
                  <Monitor className="h-3.5 w-3.5" />
                  App
                  {selectedPrototype === null && (
                    <span className="text-muted-foreground ml-auto">●</span>
                  )}
                </DropdownMenuItem>
                {prototypes.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    No prototypes yet
                  </DropdownMenuItem>
                ) : (
                  prototypes.map((p) => (
                    <DropdownMenuItem
                      key={p.name}
                      onClick={() => setSelectedPrototype(p.name)}
                      className="gap-2 text-xs"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      {p.name}
                      {selectedPrototype === p.name && (
                        <span className="text-muted-foreground ml-auto">●</span>
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div
                className={`h-2 w-2 rounded-full ${
                  isRunning ? "bg-green-500" : isStarting ? "bg-yellow-500 animate-pulse" : "bg-gray-400"
                }`}
              />
              <span>
                {isRunning && (status.url || status.port)
                  ? status.url
                    ? new URL(status.url).host
                    : `localhost:${status.port}`
                  : status.status}
              </span>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom out" onClick={() => setCanvasScale((s) => Math.max(0.25, +(s - 0.1).toFixed(2)))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground w-8 text-center">{Math.round(canvasScale * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom in" onClick={() => setCanvasScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Reset zoom" onClick={() => { setCanvasScale(1); setCanvasPan({ x: 0, y: 0 }); }}>
                <Maximize className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex-1" />

            {/* Settings popover */}
            {app && onConfigChanged && (
              <PreviewConfigBar app={app} onConfigChanged={onConfigChanged} />
            )}

            {/* Console toggle */}
            <Button
              variant={consoleVisible ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              title="Toggle console"
              onClick={toggleConsole}
            >
              <Terminal className="h-3.5 w-3.5" />
            </Button>

            {/* Layers panel toggle */}
            <Button
              variant={layersPanelVisible ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              title="Layers panel"
              onClick={() => setLayersPanelVisible(!layersPanelVisible)}
              disabled={!isRunning}
            >
              <Layers className="h-3.5 w-3.5" />
            </Button>

            {/* AI Select toggle */}
            <Button
              variant={multiSelectEnabled ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              title="Select components for AI"
              onClick={() => {
                const next = !multiSelectEnabled;
                setMultiSelectEnabled(next);
                if (next && annotatorEnabled) {
                  setAnnotatorEnabled(false);
                  setSelectedElement(null);
                }
                if (!next) {
                  onComponentsSelected?.([]);
                }
              }}
              disabled={!isRunning}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>

            {/* Insert element toggle */}
            <Button
              variant={insertToolbarVisible ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              title="Insert element"
              onClick={() => {
                const next = !insertToolbarVisible;
                setInsertToolbarVisible(next);
                if (next) {
                  setAnnotatorEnabled(false);
                  setMultiSelectEnabled(false);
                  setSelectedElement(null);
                }
              }}
              disabled={!isRunning}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>

            {/* Preview mode toggle */}
            <Button
              variant={previewMode ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              title="Preview mode (P)"
              onClick={() => setPreviewMode(!previewMode)}
              disabled={!isRunning}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>

            {/* Annotator toggle */}
            <Button
              variant={annotatorEnabled ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              title="Visual editing mode"
              onClick={() => {
                const next = !annotatorEnabled;
                setAnnotatorEnabled(next);
                if (next && multiSelectEnabled) {
                  setMultiSelectEnabled(false);
                  onComponentsSelected?.([]);
                }
                if (next) setInsertToolbarVisible(false);
                if (!next) {
                  setSelectedElement(null);
                }
              }}
              disabled={!isRunning}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
            </Button>

            {/* Viewport dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Viewport size">
                  {(() => {
                    const ActiveIcon = VIEWPORT_PRESETS.find((p) => p.width === viewportWidth)?.icon || Monitor;
                    return <ActiveIcon className="h-3.5 w-3.5" />;
                  })()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {VIEWPORT_PRESETS.map((preset) => (
                  <DropdownMenuItem
                    key={preset.label}
                    onClick={() => setViewportWidth(preset.width)}
                    className="gap-2 text-xs"
                  >
                    <preset.icon className="h-3.5 w-3.5" />
                    {preset.label}
                    {preset.width > 0 && <span className="text-muted-foreground ml-auto">{preset.width}px</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* iframe */}
          <div
            className="flex-1 flex items-start justify-center bg-muted/30 overflow-hidden relative"
            onWheel={handleCanvasWheel}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            {isRunning ? (
              <>
                <div style={{
                  transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasScale})`,
                  transformOrigin: "center top",
                  width: viewportWidth > 0 ? `${viewportWidth}px` : "100%",
                  height: "100%",
                }}>
                <iframe
                  ref={iframeRef}
                  src={proxyUrl}
                  className="bg-white border-x border-b"
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                  title="App Preview"
                />
                </div>
                {/* Pan overlay — captures mouse events when Space is held */}
                {panMode && (
                  <div
                    className="absolute inset-0 z-10"
                    style={{ cursor: isPanningRef.current ? "grabbing" : "grab" }}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  />
                )}
                {!previewMode && multiSelectEnabled && (
                  <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
                    <div className="bg-background/90 border rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-lg">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                      Click components to select for AI
                    </div>
                  </div>
                )}
                {!previewMode && annotatorEnabled && (
                  <PreviewAnnotator
                    iframeRef={iframeRef}
                    onSelectElement={handleSelectElement}
                    onClose={handleCloseAnnotator}
                  />
                )}
                {!previewMode && selectedElement && (
                  <VisualEditingToolbar
                    element={selectedElement}
                    iframeRef={iframeRef}
                    onEditWithAI={handleEditWithAI}
                    onSave={handleSaveChanges}
                    onClose={handleCloseToolbar}
                    onOpenFile={onOpenFile}
                  />
                )}
                {insertToolbarVisible && (
                  <InsertElementToolbar
                    iframeRef={iframeRef}
                    onInsert={handleInsertElement}
                    onClose={() => setInsertToolbarVisible(false)}
                  />
                )}
                {layersPanelVisible && (
                  <LayersPanel
                    rpc={layersRpc}
                    selectedDevxId={selectedElement?.devxId}
                    onSelectElement={handleSelectElement}
                    onClose={() => setLayersPanelVisible(false)}
                  />
                )}
                {contextMenu && (
                  <ElementContextMenu
                    position={contextMenu.position}
                    elementName={contextMenu.devxName}
                    canPaste={!!copiedElementHTML}
                    onEditWithAI={() => {
                      // Select the element first, then trigger AI edit
                      const parts = contextMenu.devxId.split(":");
                      const col = parseInt(parts.pop() || "1", 10);
                      const line = parseInt(parts.pop() || "0", 10);
                      const filePath = parts.join(":");
                      const el: SelectedElement = {
                        devxId: contextMenu.devxId,
                        devxName: contextMenu.devxName,
                        tagName: "div",
                        filePath, line, col,
                        boundingRect: { top: 0, left: 0, width: 0, height: 0 },
                      };
                      setSelectedElement(el);
                      onEditWithAI?.(el);
                    }}
                    onEditText={() => {
                      const rpc = createIframeRpc(iframeRef.current);
                      rpc.enableTextEditing(contextMenu.devxId).catch(() => {}).finally(() => rpc.destroy());
                    }}
                    onCopy={async () => {
                      const rpc = createIframeRpc(iframeRef.current);
                      try {
                        const html = await rpc.getElementHTML(contextMenu.devxId);
                        setCopiedElementHTML(html);
                      } finally { rpc.destroy(); }
                    }}
                    onPaste={async () => {
                      if (!copiedElementHTML) return;
                      const rpc = createIframeRpc(iframeRef.current);
                      try {
                        const parentInfo = await rpc.getParentInfo(contextMenu.devxId);
                        if (!parentInfo) return;
                        await rpc.pasteHTML(parentInfo.parentDevxId, parentInfo.index + 1, copiedElementHTML);
                      } finally { rpc.destroy(); }
                    }}
                    onDuplicate={async () => {
                      const rpc = createIframeRpc(iframeRef.current);
                      try {
                        const html = await rpc.getElementHTML(contextMenu.devxId);
                        const parentInfo = await rpc.getParentInfo(contextMenu.devxId);
                        if (!parentInfo) return;
                        await rpc.pasteHTML(parentInfo.parentDevxId, parentInfo.index + 1, html);
                      } finally { rpc.destroy(); }
                    }}
                    onCut={async () => {
                      const rpc = createIframeRpc(iframeRef.current);
                      try {
                        const html = await rpc.getElementHTML(contextMenu.devxId);
                        setCopiedElementHTML(html);
                        await rpc.removeElement(contextMenu.devxId);
                        setSelectedElement(null);
                      } finally { rpc.destroy(); }
                    }}
                    onDelete={async () => {
                      const rpc = createIframeRpc(iframeRef.current);
                      try {
                        const parentInfo = await rpc.getParentInfo(contextMenu.devxId);
                        if (!parentInfo) return;
                        await rpc.removeElement(contextMenu.devxId);
                        setSelectedElement(null);
                      } finally { rpc.destroy(); }
                    }}
                    onGroup={async () => {
                      const rpc = createIframeRpc(iframeRef.current);
                      try { await rpc.groupElement(contextMenu.devxId); } finally { rpc.destroy(); }
                    }}
                    onUngroup={async () => {
                      const rpc = createIframeRpc(iframeRef.current);
                      try { await rpc.ungroupElement(contextMenu.devxId); } finally { rpc.destroy(); }
                    }}
                    onClose={() => setContextMenu(null)}
                  />
                )}
                {pendingChanges && (
                  <VisualEditingChangesDialog
                    changes={pendingChanges}
                    onConfirm={handleConfirmSave}
                    onCancel={handleCancelSave}
                  />
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <div className="text-center space-y-3">
                  <Monitor className="h-12 w-12 mx-auto opacity-30" />
                  <p className="text-sm">
                    {isStarting ? "Starting dev server..." : "Dev server is not running"}
                  </p>
                  {!isStarting && (
                    <Button size="sm" onClick={start}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Start Dev Server
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Panel>
      <PanelResizeHandle className="h-1 bg-border hover:bg-primary/20 cursor-row-resize" />
      <Panel
        ref={consolePanelRef}
        defaultSize={25}
        minSize={10}
        collapsible
        onCollapse={() => setConsoleVisible(false)}
        onExpand={() => setConsoleVisible(true)}
        id="console"
      >
        <ConsoleTab devServer={devServer} />
      </Panel>
    </PanelGroup>
  );
}
