import { useCallback, useEffect, useState } from "react";
import { Plus, X, Square, Type, MousePointerClick, Image, Link, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

const ELEMENT_TYPES = [
  { tagName: "div", label: "Div", icon: Square, classes: "p-4 bg-gray-100", text: "" },
  { tagName: "p", label: "Text", icon: Type, classes: "text-base", text: "New text" },
  { tagName: "button", label: "Button", icon: MousePointerClick, classes: "px-4 py-2 bg-blue-500 text-white rounded", text: "Button" },
  { tagName: "img", label: "Image", icon: Image, classes: "w-full h-auto", text: "" },
  { tagName: "span", label: "Span", icon: Minus, classes: "", text: "Text" },
  { tagName: "a", label: "Link", icon: Link, classes: "text-blue-500 underline", text: "Link" },
] as const;

interface InsertElementToolbarProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onInsert: (parentDevxId: string, index: number, tagName: string, classes: string, text: string) => void;
  onClose: () => void;
}

export function InsertElementToolbar({ iframeRef, onInsert, onClose }: InsertElementToolbarProps) {
  const [selectedType, setSelectedType] = useState<typeof ELEMENT_TYPES[number] | null>(null);
  const [selectingTarget, setSelectingTarget] = useState(false);

  // When a type is selected, activate insert mode in iframe
  const handleSelectType = useCallback((type: typeof ELEMENT_TYPES[number]) => {
    setSelectedType(type);
    setSelectingTarget(true);
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "activate-devx-insert-mode" }, "*");
    }
  }, [iframeRef]);

  // Listen for target selection from iframe
  useEffect(() => {
    if (!selectingTarget || !selectedType) return;
    const iframe = iframeRef.current;

    function handleMessage(e: MessageEvent) {
      if (e.source !== iframe?.contentWindow) return;
      if (e.data?.type === "devx-insert-target-selected") {
        onInsert(
          e.data.parentDevxId,
          e.data.index,
          selectedType!.tagName,
          selectedType!.classes,
          selectedType!.text,
        );
        setSelectingTarget(false);
        setSelectedType(null);
      }
      if (e.data?.type === "devx-insert-cancelled") {
        setSelectingTarget(false);
        setSelectedType(null);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      try {
        iframe?.contentWindow?.postMessage({ type: "deactivate-devx-insert-mode" }, "*");
      } catch { /* iframe may be gone */ }
    };
  }, [selectingTarget, selectedType, iframeRef, onInsert]);

  const handleClose = useCallback(() => {
    if (selectingTarget) {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: "deactivate-devx-insert-mode" }, "*");
      }
    }
    setSelectingTarget(false);
    setSelectedType(null);
    onClose();
  }, [selectingTarget, iframeRef, onClose]);

  return (
    <div className="absolute left-2 top-12 z-20 bg-background border rounded-lg shadow-xl text-xs overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-1.5">
          <Plus className="h-3 w-3 text-green-500" />
          <span className="font-medium">
            {selectingTarget ? "Click a container" : "Insert Element"}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      {!selectingTarget && (
        <div className="grid grid-cols-3 gap-1 p-2">
          {ELEMENT_TYPES.map((type) => (
            <Button
              key={type.tagName}
              variant="ghost"
              className="h-12 flex-col gap-1 text-[10px]"
              onClick={() => handleSelectType(type)}
            >
              <type.icon className="h-4 w-4" />
              {type.label}
            </Button>
          ))}
        </div>
      )}
      {selectingTarget && (
        <div className="px-3 py-2 text-muted-foreground">
          Click on a container element to insert a <span className="font-medium text-foreground">&lt;{selectedType?.tagName}&gt;</span> inside it.
        </div>
      )}
    </div>
  );
}
