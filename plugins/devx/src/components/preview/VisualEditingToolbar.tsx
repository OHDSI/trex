import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  X, Type, RotateCcw, Save, Sparkles, Undo2, Redo2, Trash2, Code,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ArrowRight, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SelectedElement, PendingChange, StyleChanges, VisualAction } from "@/lib/visual-editing-types";
import { createIframeRpc, type ComputedStyles, type IframeRpc } from "@/lib/visual-editing-rpc";
import { VisualEditingHistory } from "@/lib/visual-editing-history";
import { ColorPicker } from "./ColorPicker";

interface VisualEditingToolbarProps {
  element: SelectedElement;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onEditWithAI: (element: SelectedElement) => void;
  onSave: (changes: PendingChange[]) => void;
  onClose: () => void;
  onOpenFile?: (path: string) => void;
}

/** Small toggle button for icon groups */
function ToggleBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`h-6 w-6 flex items-center justify-center rounded text-[10px] border transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"
      }`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export function VisualEditingToolbar({
  element,
  iframeRef,
  onEditWithAI,
  onSave,
  onClose,
  onOpenFile,
}: VisualEditingToolbarProps) {
  const [computedStyles, setComputedStyles] = useState<ComputedStyles | null>(null);
  const [definedStyles, setDefinedStyles] = useState<Partial<ComputedStyles>>({});
  const [pendingStyles, setPendingStyles] = useState<StyleChanges>({});
  const [pendingText, setPendingText] = useState<string | undefined>(undefined);
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());

  // Undo/redo history
  const historyRef = useRef(new VisualEditingHistory());
  const [, setHistoryVersion] = useState(0);
  useEffect(() => {
    return historyRef.current.onChange(() => setHistoryVersion((v) => v + 1));
  }, []);
  const history = historyRef.current;

  // RPC connection
  const rpcRef = useRef<IframeRpc | null>(null);
  const rpc = useMemo(() => {
    rpcRef.current?.destroy();
    const instance = createIframeRpc(iframeRef.current);
    rpcRef.current = instance;
    return instance;
  }, [iframeRef.current]);

  useEffect(() => {
    return () => { rpcRef.current?.destroy(); };
  }, []);

  // Fetch styles on mount
  useEffect(() => {
    rpc.getComputedAndDefinedStyles(element.devxId).then((result) => {
      setComputedStyles(result.computed);
      setDefinedStyles(result.defined);
    }).catch(() => {
      rpc.getStyles(element.devxId).then(setComputedStyles).catch(() => {});
    });

    const iframe = iframeRef.current;
    function handleMessage(e: MessageEvent) {
      if (e.source !== iframe?.contentWindow) return;
      if (e.data?.type === "devx-text-finalized" && e.data.devxId === element.devxId) {
        setPendingText(e.data.textContent);
        setChangedFields((prev) => new Set(prev).add("textContent"));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [element.devxId, rpc, iframeRef]);

  const sendStyleUpdate = useCallback(
    (styles: Record<string, string>) => {
      rpc.applyStyles(element.devxId, styles).catch(() => {});
    },
    [element.devxId, rpc],
  );

  const pushStyleChange = useCallback(
    (cssProp: string, value: string) => {
      const original = computedStyles?.[cssProp as keyof ComputedStyles] || "";
      history.push({
        type: "update-style",
        devxId: element.devxId,
        original: { [cssProp]: original },
        updated: { [cssProp]: value },
      });
      sendStyleUpdate({ [cssProp]: value });
    },
    [computedStyles, element.devxId, history, sendStyleUpdate],
  );

  // === Update callbacks ===

  const updateLayout = useCallback(
    (prop: string, value: string) => {
      setPendingStyles((prev) => ({
        ...prev,
        layout: { ...prev.layout, [prop]: value },
      }));
      pushStyleChange(prop, value);
      setChangedFields((prev) => new Set(prev).add(`layout.${prop}`));
    },
    [pushStyleChange],
  );

  const updateSizing = useCallback(
    (prop: string, value: string) => {
      setPendingStyles((prev) => ({
        ...prev,
        sizing: { ...prev.sizing, [prop]: value },
      }));
      pushStyleChange(prop, value);
      setChangedFields((prev) => new Set(prev).add(`sizing.${prop}`));
    },
    [pushStyleChange],
  );

  const updatePosition = useCallback(
    (prop: string, value: string) => {
      setPendingStyles((prev) => ({
        ...prev,
        positioning: { ...prev.positioning, [prop]: value },
      }));
      pushStyleChange(prop, value);
      setChangedFields((prev) => new Set(prev).add(`positioning.${prop}`));
    },
    [pushStyleChange],
  );

  const updateSpacing = useCallback(
    (type: "margin" | "padding", dir: "top" | "right" | "bottom" | "left", value: string) => {
      setPendingStyles((prev) => ({
        ...prev,
        [type]: { ...prev[type], [dir]: value },
      }));
      const cssProp = `${type}${dir.charAt(0).toUpperCase() + dir.slice(1)}`;
      pushStyleChange(cssProp, value);
      setChangedFields((prev) => new Set(prev).add(`${type}.${dir}`));
    },
    [pushStyleChange],
  );

  const updateBorder = useCallback(
    (prop: string, value: string) => {
      setPendingStyles((prev) => ({
        ...prev,
        border: { ...prev.border, [prop]: value },
      }));
      const cssMap: Record<string, string> = {
        width: "borderWidth", radius: "borderRadius", color: "borderColor", style: "borderStyle",
        topLeftRadius: "borderTopLeftRadius", topRightRadius: "borderTopRightRadius",
        bottomRightRadius: "borderBottomRightRadius", bottomLeftRadius: "borderBottomLeftRadius",
      };
      pushStyleChange(cssMap[prop] || prop, value);
      setChangedFields((prev) => new Set(prev).add(`border.${prop}`));
    },
    [pushStyleChange],
  );

  const updateBackground = useCallback(
    (value: string) => {
      setPendingStyles((prev) => ({ ...prev, backgroundColor: value }));
      pushStyleChange("backgroundColor", value);
      setChangedFields((prev) => new Set(prev).add("backgroundColor"));
    },
    [pushStyleChange],
  );

  const updateText = useCallback(
    (prop: string, value: string) => {
      setPendingStyles((prev) => ({
        ...prev,
        text: { ...prev.text, [prop]: value },
      }));
      pushStyleChange(prop, value);
      setChangedFields((prev) => new Set(prev).add(`text.${prop}`));
    },
    [pushStyleChange],
  );

  const updateOpacity = useCallback(
    (value: string) => {
      setPendingStyles((prev) => ({ ...prev, opacity: value }));
      pushStyleChange("opacity", value);
      setChangedFields((prev) => new Set(prev).add("opacity"));
    },
    [pushStyleChange],
  );

  const updateShadow = useCallback(
    (value: string) => {
      setPendingStyles((prev) => ({ ...prev, boxShadow: value }));
      pushStyleChange("boxShadow", value);
      setChangedFields((prev) => new Set(prev).add("boxShadow"));
    },
    [pushStyleChange],
  );

  // === Undo/Redo ===

  const applyAction = useCallback(
    (action: VisualAction) => {
      if (action.type === "update-style") {
        rpc.applyStyles(action.devxId, action.updated).catch(() => {});
      }
    },
    [rpc],
  );

  const handleUndo = useCallback(() => {
    const reversed = history.undo();
    if (reversed) applyAction(reversed);
  }, [history, applyAction]);

  const handleRedo = useCallback(() => {
    const action = history.redo();
    if (action) applyAction(action);
  }, [history, applyAction]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo]);

  // === Delete ===

  const handleDelete = useCallback(async () => {
    try {
      const parentInfo = await rpc.getParentInfo(element.devxId);
      if (!parentInfo) return;
      await rpc.removeElement(element.devxId);
      const parts = parentInfo.parentDevxId.split(":");
      const col = parseInt(parts.pop() || "1", 10);
      const line = parseInt(parts.pop() || "0", 10);
      const filePath = parts.join(":");
      if (filePath && line > 0) {
        onSave([{
          componentId: parentInfo.parentDevxId,
          componentName: "parent",
          filePath,
          line,
          col,
          styles: {},
          removeChild: { index: parentInfo.index },
        }]);
      }
      onClose();
    } catch { /* ignore */ }
  }, [rpc, element.devxId, onSave, onClose]);

  // === Other handlers ===

  const handleEnableTextEdit = useCallback(() => {
    rpc.enableTextEditing(element.devxId).catch(() => {});
  }, [element.devxId, rpc]);

  const handleReset = useCallback(() => {
    rpc.resetStyles(element.devxId).catch(() => {});
    history.clear();
    setPendingStyles({});
    setPendingText(undefined);
    setChangedFields(new Set());
  }, [element.devxId, rpc, history]);

  const handleSave = useCallback(() => {
    const change: PendingChange = {
      componentId: element.devxId,
      componentName: element.devxName,
      filePath: element.filePath,
      line: element.line,
      col: element.col,
      styles: pendingStyles,
      textContent: pendingText,
    };
    onSave([change]);
  }, [element, pendingStyles, pendingText, onSave]);

  // === Helpers ===

  const isDefined = useCallback((cssProp: string): boolean => {
    // Check if user has explicitly changed this property, or if it's defined in source
    for (const field of changedFields) {
      // changedFields stores keys like "layout.display", "border.width", "text.fontSize"
      // Map them back to CSS prop names for comparison
      if (field.endsWith(`.${cssProp}`) || field === cssProp) return true;
    }
    return cssProp in definedStyles;
  }, [definedStyles, changedFields]);

  const inputClass = useCallback((cssProp: string, base: string): string => {
    return isDefined(cssProp) ? base : `${base} italic text-muted-foreground`;
  }, [isDefined]);

  const spacingValue = (type: "margin" | "padding", dir: string): string => {
    const pending = pendingStyles[type];
    if (pending && pending[dir as keyof typeof pending]) {
      return pending[dir as keyof typeof pending]!;
    }
    if (computedStyles) {
      const key = `${type}${dir.charAt(0).toUpperCase() + dir.slice(1)}` as keyof ComputedStyles;
      return computedStyles[key] || "";
    }
    return "";
  };

  const cv = (prop: keyof ComputedStyles): string => computedStyles?.[prop] || "";
  const pv = (group: keyof StyleChanges, prop: string): string => {
    const g = pendingStyles[group];
    if (g && typeof g === "object" && prop in g) return (g as Record<string, string>)[prop] || "";
    return "";
  };

  // Derived state for conditional rendering
  const currentDisplay = pv("layout", "display") || cv("display");
  const isFlexOrGrid = currentDisplay === "flex" || currentDisplay === "inline-flex" || currentDisplay === "grid";
  const isFlex = currentDisplay === "flex" || currentDisplay === "inline-flex";

  const opacityPercent = Math.round(parseFloat(pendingStyles.opacity || cv("opacity") || "1") * 100);

  return (
    <div className="absolute right-2 top-12 z-20 w-64 bg-background border rounded-lg shadow-xl text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-primary truncate">&lt;{element.devxName}&gt;</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="View source code" onClick={() => {
            onOpenFile?.(element.filePath);
          }}>
            <Code className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit with AI" onClick={() => onEditWithAI(element)}>
            <Sparkles className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" title="Delete element" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
        {/* File path */}
        <div className="text-muted-foreground truncate" title={element.filePath}>
          {element.filePath}:{element.line}
        </div>

        {/* === LAYOUT === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Layout</Label>
          <div className="flex gap-1 mt-1">
            {(["block", "flex", "grid", "inline"] as const).map((d) => (
              <ToggleBtn key={d} active={currentDisplay === d} onClick={() => updateLayout("display", d)} title={d}>
                {d === "flex" ? "Flx" : d === "grid" ? "Grd" : d === "inline" ? "Inl" : "Blk"}
              </ToggleBtn>
            ))}
          </div>
          {isFlex && (
            <div className="mt-1.5">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Dir</span>
                <div className="flex gap-1">
                  <ToggleBtn active={(pv("layout", "flexDirection") || cv("flexDirection")) === "row"} onClick={() => updateLayout("flexDirection", "row")} title="Row">
                    <ArrowRight className="h-3 w-3" />
                  </ToggleBtn>
                  <ToggleBtn active={(pv("layout", "flexDirection") || cv("flexDirection")) === "column"} onClick={() => updateLayout("flexDirection", "column")} title="Column">
                    <ArrowDown className="h-3 w-3" />
                  </ToggleBtn>
                </div>
              </div>
            </div>
          )}
          {isFlexOrGrid && (
            <>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Just</span>
                <div className="flex gap-1">
                  {([["flex-start", "Start"], ["center", "Center"], ["flex-end", "End"], ["space-between", "Between"]] as const).map(([v, t]) => (
                    <ToggleBtn key={v} active={(pv("layout", "justifyContent") || cv("justifyContent")) === v} onClick={() => updateLayout("justifyContent", v)} title={t}>
                      {t[0]}
                    </ToggleBtn>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Align</span>
                <div className="flex gap-1">
                  {([["flex-start", "Start"], ["center", "Center"], ["flex-end", "End"], ["stretch", "Stretch"]] as const).map(([v, t]) => (
                    <ToggleBtn key={v} active={(pv("layout", "alignItems") || cv("alignItems")) === v} onClick={() => updateLayout("alignItems", v)} title={t}>
                      {t[0]}
                    </ToggleBtn>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Gap</span>
                <Input
                  className={inputClass("gap", "h-6 text-[10px] px-1 flex-1")}
                  placeholder="0px"
                  value={pv("layout", "gap") || cv("gap")}
                  onChange={(e) => updateLayout("gap", e.target.value)}
                />
              </div>
              {isFlex && (
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-muted-foreground w-10 shrink-0">Wrap</span>
                  <div className="flex gap-1">
                    {(["nowrap", "wrap"] as const).map((v) => (
                      <ToggleBtn key={v} active={(pv("layout", "flexWrap") || cv("flexWrap")) === v} onClick={() => updateLayout("flexWrap", v)} title={v}>
                        {v === "nowrap" ? "No" : "Yes"}
                      </ToggleBtn>
                    ))}
                  </div>
                </div>
              )}
              {currentDisplay === "grid" && (
                <>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0">Cols</span>
                    <Input
                      className={inputClass("gridTemplateColumns", "h-6 text-[10px] px-1 flex-1")}
                      placeholder="3"
                      value={pv("layout", "gridTemplateColumns") || cv("gridTemplateColumns")}
                      onChange={(e) => updateLayout("gridTemplateColumns", e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="text-[10px] text-muted-foreground w-10 shrink-0">Rows</span>
                    <Input
                      className={inputClass("gridTemplateRows", "h-6 text-[10px] px-1 flex-1")}
                      placeholder="auto"
                      value={pv("layout", "gridTemplateRows") || cv("gridTemplateRows")}
                      onChange={(e) => updateLayout("gridTemplateRows", e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* === SIZE === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Size</Label>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">W</span>
              <Input
                className={inputClass("width", "h-6 text-[10px] px-1 flex-1")}
                placeholder="auto"
                value={pv("sizing", "width") || cv("width")}
                onChange={(e) => updateSizing("width", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">H</span>
              <Input
                className={inputClass("height", "h-6 text-[10px] px-1 flex-1")}
                placeholder="auto"
                value={pv("sizing", "height") || cv("height")}
                onChange={(e) => updateSizing("height", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <Input
              className={inputClass("minWidth", "h-6 text-[10px] px-1")}
              placeholder="Min W"
              value={pv("sizing", "minWidth") || cv("minWidth")}
              onChange={(e) => updateSizing("minWidth", e.target.value)}
            />
            <Input
              className={inputClass("maxWidth", "h-6 text-[10px] px-1")}
              placeholder="Max W"
              value={pv("sizing", "maxWidth") || cv("maxWidth")}
              onChange={(e) => updateSizing("maxWidth", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background"
              value={pv("sizing", "aspectRatio") || cv("aspectRatio") || "auto"}
              onChange={(e) => updateSizing("aspectRatio", e.target.value)}
            >
              <option value="auto">Aspect: Auto</option>
              <option value="1 / 1">Square</option>
              <option value="16 / 9">16:9</option>
              <option value="4 / 3">4:3</option>
            </select>
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background"
              value={pv("sizing", "objectFit") || cv("objectFit") || "fill"}
              onChange={(e) => updateSizing("objectFit", e.target.value)}
            >
              <option value="fill">Fit: Fill</option>
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="none">None</option>
              <option value="scale-down">Scale Down</option>
            </select>
          </div>
        </div>

        {/* === POSITION === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Position</Label>
          <div className="flex gap-1 mt-1">
            {(["static", "relative", "absolute", "fixed"] as const).map((p) => (
              <ToggleBtn
                key={p}
                active={(pv("positioning", "position") || cv("position")) === p}
                onClick={() => updatePosition("position", p)}
                title={p}
              >
                {p === "static" ? "Sta" : p === "relative" ? "Rel" : p === "absolute" ? "Abs" : "Fix"}
              </ToggleBtn>
            ))}
          </div>
          {(pv("positioning", "position") || cv("position") || "static") !== "static" && (
            <>
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">T</span>
                  <Input
                    className={inputClass("top", "h-6 text-[10px] px-1 flex-1")}
                    placeholder="auto"
                    value={pv("positioning", "top") || cv("top")}
                    onChange={(e) => updatePosition("top", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">R</span>
                  <Input
                    className={inputClass("right", "h-6 text-[10px] px-1 flex-1")}
                    placeholder="auto"
                    value={pv("positioning", "right") || cv("right")}
                    onChange={(e) => updatePosition("right", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">B</span>
                  <Input
                    className={inputClass("bottom", "h-6 text-[10px] px-1 flex-1")}
                    placeholder="auto"
                    value={pv("positioning", "bottom") || cv("bottom")}
                    onChange={(e) => updatePosition("bottom", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">L</span>
                  <Input
                    className={inputClass("left", "h-6 text-[10px] px-1 flex-1")}
                    placeholder="auto"
                    value={pv("positioning", "left") || cv("left")}
                    onChange={(e) => updatePosition("left", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[10px] text-muted-foreground">Z</span>
              <Input
                className={inputClass("zIndex", "h-6 text-[10px] px-1 flex-1")}
                placeholder="auto"
                value={pv("positioning", "zIndex") || cv("zIndex")}
                onChange={(e) => updatePosition("zIndex", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 flex-1">
              <span className="text-[10px] text-muted-foreground shrink-0">OF</span>
              <select
                className="h-6 text-[10px] px-0.5 border rounded bg-background flex-1"
                value={pv("positioning", "overflow") || cv("overflow") || "visible"}
                onChange={(e) => updatePosition("overflow", e.target.value)}
              >
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
                <option value="auto">Auto</option>
                <option value="scroll">Scroll</option>
              </select>
            </div>
          </div>
        </div>

        {/* === SPACING: Margin === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Margin</Label>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {(["top", "right", "bottom", "left"] as const).map((dir) => (
              <Input
                key={dir}
                className={inputClass(`margin${dir.charAt(0).toUpperCase() + dir.slice(1)}`, "h-6 text-[10px] px-1 text-center")}
                placeholder={dir[0].toUpperCase()}
                value={spacingValue("margin", dir)}
                onChange={(e) => updateSpacing("margin", dir, e.target.value)}
              />
            ))}
          </div>
        </div>

        {/* === SPACING: Padding === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Padding</Label>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {(["top", "right", "bottom", "left"] as const).map((dir) => (
              <Input
                key={dir}
                className={inputClass(`padding${dir.charAt(0).toUpperCase() + dir.slice(1)}`, "h-6 text-[10px] px-1 text-center")}
                placeholder={dir[0].toUpperCase()}
                value={spacingValue("padding", dir)}
                onChange={(e) => updateSpacing("padding", dir, e.target.value)}
              />
            ))}
          </div>
        </div>

        {/* === BORDER === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Border</Label>
          <div className="grid grid-cols-3 gap-1 mt-1">
            <Input
              className={inputClass("borderWidth", "h-6 text-[10px] px-1")}
              placeholder="Width"
              value={pendingStyles.border?.width || cv("borderWidth")}
              onChange={(e) => updateBorder("width", e.target.value)}
            />
            <Input
              className={inputClass("borderRadius", "h-6 text-[10px] px-1")}
              placeholder="Radius"
              value={pendingStyles.border?.radius || cv("borderRadius")}
              onChange={(e) => updateBorder("radius", e.target.value)}
            />
            <ColorPicker
              value={pendingStyles.border?.color || "#000000"}
              onChange={(v) => updateBorder("color", v)}
            />
          </div>
          {/* Border style */}
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-muted-foreground w-10 shrink-0">Style</span>
            <div className="flex gap-1">
              {(["solid", "dashed", "dotted", "none"] as const).map((s) => (
                <ToggleBtn key={s} active={(pendingStyles.border?.style || cv("borderStyle")) === s} onClick={() => updateBorder("style", s)} title={s}>
                  {s[0].toUpperCase()}
                </ToggleBtn>
              ))}
            </div>
          </div>
          {/* Per-corner radius */}
          <div className="grid grid-cols-4 gap-1 mt-1.5">
            {([["topLeftRadius", "TL", "borderTopLeftRadius"], ["topRightRadius", "TR", "borderTopRightRadius"], ["bottomLeftRadius", "BL", "borderBottomLeftRadius"], ["bottomRightRadius", "BR", "borderBottomRightRadius"]] as const).map(([prop, label, cssProp]) => (
              <Input
                key={prop}
                className={inputClass(cssProp, "h-6 text-[10px] px-1 text-center")}
                placeholder={label}
                value={pendingStyles.border?.[prop] || cv(cssProp as keyof ComputedStyles)}
                onChange={(e) => updateBorder(prop, e.target.value)}
              />
            ))}
          </div>
        </div>

        {/* === BACKGROUND === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Background</Label>
          <div className="flex items-center gap-1 mt-1">
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background w-16 shrink-0"
              value={pendingStyles.background?.type || "solid"}
              onChange={(e) => setPendingStyles((prev) => ({ ...prev, background: { ...prev.background, type: e.target.value as "solid" | "gradient" } }))}
            >
              <option value="solid">Solid</option>
              <option value="gradient">Grad</option>
            </select>
            {(!pendingStyles.background?.type || pendingStyles.background?.type === "solid") && (
              <ColorPicker
                value={pendingStyles.backgroundColor || cv("backgroundColor") || "#ffffff"}
                onChange={updateBackground}
                className="flex-1"
              />
            )}
          </div>
          {pendingStyles.background?.type === "gradient" && (
            <div className="space-y-1.5 mt-1.5">
              <select
                className="h-6 text-[10px] px-1 border rounded bg-background w-full"
                value={pendingStyles.background?.gradientDirection || "to right"}
                onChange={(e) => {
                  setPendingStyles((prev) => ({ ...prev, background: { ...prev.background, type: "gradient", gradientDirection: e.target.value } }));
                  setChangedFields((prev) => new Set(prev).add("background.gradientDirection"));
                }}
              >
                <option value="to right">To Right</option>
                <option value="to left">To Left</option>
                <option value="to bottom">To Bottom</option>
                <option value="to top">To Top</option>
                <option value="to bottom right">To Bottom Right</option>
                <option value="to top right">To Top Right</option>
              </select>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">From</span>
                <ColorPicker
                  value={pendingStyles.background?.gradientFrom || "#3b82f6"}
                  onChange={(v) => {
                    setPendingStyles((prev) => ({ ...prev, background: { ...prev.background, type: "gradient", gradientFrom: v } }));
                    setChangedFields((prev) => new Set(prev).add("background.gradientFrom"));
                  }}
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">To</span>
                <ColorPicker
                  value={pendingStyles.background?.gradientTo || "#a855f7"}
                  onChange={(v) => {
                    setPendingStyles((prev) => ({ ...prev, background: { ...prev.background, type: "gradient", gradientTo: v } }));
                    setChangedFields((prev) => new Set(prev).add("background.gradientTo"));
                  }}
                  className="flex-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* === EFFECTS === */}
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Effects</Label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground shrink-0">Opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={opacityPercent}
              onChange={(e) => updateOpacity(String(parseInt(e.target.value) / 100))}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-[10px] w-7 text-right">{opacityPercent}%</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-muted-foreground shrink-0">Shadow</span>
            <select
              className="h-6 text-[10px] px-1 border rounded bg-background flex-1"
              value={pendingStyles.boxShadow || "none"}
              onChange={(e) => updateShadow(e.target.value)}
            >
              <option value="none">None</option>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">X-Large</option>
              <option value="2xl">2X-Large</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
          {pendingStyles.boxShadow === "custom" && (
            <div className="grid grid-cols-5 gap-1 mt-1.5">
              {([["shadowX", "X"], ["shadowY", "Y"], ["shadowBlur", "Bl"], ["shadowSpread", "Sp"]] as const).map(([key, label]) => (
                <Input
                  key={key}
                  className="h-6 text-[10px] px-1 text-center"
                  placeholder={label}
                  onChange={(e) => {
                    const vals = {
                      shadowX: (document.getElementById("__devx-sx") as HTMLInputElement)?.value || "0",
                      shadowY: (document.getElementById("__devx-sy") as HTMLInputElement)?.value || "2",
                      shadowBlur: (document.getElementById("__devx-sb") as HTMLInputElement)?.value || "4",
                      shadowSpread: (document.getElementById("__devx-ss") as HTMLInputElement)?.value || "0",
                      [key]: e.target.value,
                    };
                    const cssVal = `${vals.shadowX}px ${vals.shadowY}px ${vals.shadowBlur}px ${vals.shadowSpread}px rgba(0,0,0,0.25)`;
                    pushStyleChange("boxShadow", cssVal);
                    setChangedFields((prev) => new Set(prev).add("boxShadow"));
                  }}
                  id={`__devx-s${label[0].toLowerCase()}`}
                />
              ))}
              <span className="text-[10px] text-muted-foreground flex items-center justify-center">px</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1 mt-1.5">
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background"
              value={pendingStyles.effects?.cursor || cv("cursor") || "default"}
              onChange={(e) => { setPendingStyles((prev) => ({ ...prev, effects: { ...prev.effects, cursor: e.target.value } })); pushStyleChange("cursor", e.target.value); setChangedFields((prev) => new Set(prev).add("effects.cursor")); }}
            >
              <option value="default">Cursor: Default</option>
              <option value="pointer">Pointer</option>
              <option value="move">Move</option>
              <option value="text">Text</option>
              <option value="grab">Grab</option>
              <option value="not-allowed">Not Allowed</option>
            </select>
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background"
              value={pendingStyles.effects?.visibility || cv("visibility") || "visible"}
              onChange={(e) => { setPendingStyles((prev) => ({ ...prev, effects: { ...prev.effects, visibility: e.target.value } })); pushStyleChange("visibility", e.target.value); setChangedFields((prev) => new Set(prev).add("effects.visibility")); }}
            >
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
        </div>

        {/* === TEXT === */}
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase text-muted-foreground">Text</Label>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Edit text content" onClick={handleEnableTextEdit}>
              <Type className="h-3 w-3" />
            </Button>
          </div>
          {/* Font family */}
          <select
            className={inputClass("fontFamily", "h-6 text-[10px] px-1 border rounded bg-background w-full mt-1")}
            value={pv("text", "fontFamily") || cv("fontFamily")?.split(",")[0]?.trim()?.replace(/['"]/g, "") || "sans-serif"}
            onChange={(e) => updateText("fontFamily", e.target.value)}
          >
            <option value="Inter">Inter</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Verdana">Verdana</option>
            <option value="system-ui">System UI</option>
            <option value="sans-serif">Sans Serif</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
          </select>
          <div className="grid grid-cols-3 gap-1 mt-1">
            <Input
              className={inputClass("fontSize", "h-6 text-[10px] px-1")}
              placeholder="Size"
              value={pv("text", "fontSize") || cv("fontSize")}
              onChange={(e) => updateText("fontSize", e.target.value)}
            />
            <select
              className={inputClass("fontWeight", "h-6 text-[10px] px-0.5 border rounded bg-background")}
              value={pv("text", "fontWeight") || cv("fontWeight") || "400"}
              onChange={(e) => updateText("fontWeight", e.target.value)}
            >
              <option value="100">Thin</option>
              <option value="300">Light</option>
              <option value="400">Normal</option>
              <option value="500">Medium</option>
              <option value="600">Semi</option>
              <option value="700">Bold</option>
              <option value="900">Black</option>
            </select>
            <ColorPicker
              value={pv("text", "color") || "#000000"}
              onChange={(v) => updateText("color", v)}
            />
          </div>

          {/* Text Align */}
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-muted-foreground w-10 shrink-0">Align</span>
            <div className="flex gap-1">
              {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ["justify", AlignJustify]] as const).map(([v, Icon]) => (
                <ToggleBtn key={v} active={(pv("text", "textAlign") || cv("textAlign")) === v} onClick={() => updateText("textAlign", v)} title={v}>
                  <Icon className="h-3 w-3" />
                </ToggleBtn>
              ))}
            </div>
          </div>

          {/* Line Height + Letter Spacing */}
          <div className="grid grid-cols-2 gap-1 mt-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">LH</span>
              <Input
                className={inputClass("lineHeight", "h-6 text-[10px] px-1 flex-1")}
                placeholder="1.5"
                value={pv("text", "lineHeight") || cv("lineHeight")}
                onChange={(e) => updateText("lineHeight", e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">LS</span>
              <Input
                className={inputClass("letterSpacing", "h-6 text-[10px] px-1 flex-1")}
                placeholder="0em"
                value={pv("text", "letterSpacing") || cv("letterSpacing")}
                onChange={(e) => updateText("letterSpacing", e.target.value)}
              />
            </div>
          </div>

          {/* Text Decoration */}
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-muted-foreground w-10 shrink-0">Decor</span>
            <div className="flex gap-1">
              {([["underline", "U"], ["line-through", "S"], ["none", "\u2014"]] as const).map(([v, label]) => (
                <ToggleBtn key={v} active={(pv("text", "textDecoration") || cv("textDecoration") || "").includes(v === "none" ? "none" : v)} onClick={() => updateText("textDecoration", v)} title={v}>
                  {label}
                </ToggleBtn>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground ml-1 shrink-0">Case</span>
            <div className="flex gap-1">
              {([["uppercase", "AA"], ["capitalize", "Aa"], ["lowercase", "aa"]] as const).map(([v, label]) => (
                <ToggleBtn key={v} active={(pv("text", "textTransform") || cv("textTransform")) === v} onClick={() => updateText("textTransform", v)} title={v}>
                  {label}
                </ToggleBtn>
              ))}
            </div>
          </div>

          {/* White-space + Word-break */}
          <div className="grid grid-cols-2 gap-1 mt-1.5">
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background"
              value={pv("text", "whiteSpace") || cv("whiteSpace") || "normal"}
              onChange={(e) => updateText("whiteSpace", e.target.value)}
            >
              <option value="normal">Wrap: Normal</option>
              <option value="nowrap">No Wrap</option>
              <option value="pre">Pre</option>
              <option value="pre-wrap">Pre Wrap</option>
            </select>
            <select
              className="h-6 text-[10px] px-0.5 border rounded bg-background"
              value={pv("text", "wordBreak") || cv("wordBreak") || "normal"}
              onChange={(e) => updateText("wordBreak", e.target.value)}
            >
              <option value="normal">Break: Normal</option>
              <option value="break-all">Break All</option>
              <option value="keep-all">Keep All</option>
            </select>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/50">
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={handleReset}>
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleUndo} disabled={!history.canUndo()} title="Undo (Ctrl+Z)">
            <Undo2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleRedo} disabled={!history.canRedo()} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          {changedFields.size > 0 && (
            <span className="text-[10px] text-muted-foreground">{changedFields.size}</span>
          )}
          <Button size="sm" className="h-6 text-[10px] gap-1" onClick={handleSave} disabled={changedFields.size === 0}>
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
