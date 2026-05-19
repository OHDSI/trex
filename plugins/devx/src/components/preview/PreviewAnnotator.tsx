import { useEffect, useCallback } from "react";
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SelectedElement } from "@/lib/visual-editing-types";

interface PreviewAnnotatorProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onSelectElement: (element: SelectedElement) => void;
  onClose: () => void;
}

function parseDevxId(devxId: string): { filePath: string; line: number; col: number } {
  // Format: "src/components/Button.tsx:15:4"
  const lastColon = devxId.lastIndexOf(":");
  const secondLastColon = devxId.lastIndexOf(":", lastColon - 1);
  if (secondLastColon === -1) {
    return { filePath: devxId, line: 0, col: 0 };
  }
  return {
    filePath: devxId.substring(0, secondLastColon),
    line: parseInt(devxId.substring(secondLastColon + 1, lastColon), 10) || 0,
    col: parseInt(devxId.substring(lastColon + 1), 10) || 0,
  };
}

export function PreviewAnnotator({ iframeRef, onSelectElement, onClose }: PreviewAnnotatorProps) {
  // Activate selector in iframe on mount
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Capture contentWindow at activation time for cleanup
    const contentWindow = iframe.contentWindow;

    // Small delay to ensure bridge scripts are loaded
    const timer = setTimeout(() => {
      contentWindow.postMessage(
        { type: "activate-devx-component-selector" },
        "*",
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      try {
        contentWindow.postMessage(
          { type: "deactivate-devx-component-selector" },
          "*",
        );
      } catch {
        // contentWindow may be destroyed if iframe navigated
      }
    };
  }, [iframeRef]);

  // Listen for selection messages from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data?.type) return;
      // Only accept messages from our iframe
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data.type === "devx-component-selected") {
        const { filePath, line, col } = parseDevxId(e.data.devxId);
        onSelectElement({
          devxId: e.data.devxId,
          devxName: e.data.devxName,
          tagName: e.data.tagName,
          filePath,
          line,
          col,
          boundingRect: e.data.boundingRect,
        });
      }

      if (e.data.type === "devx-selector-closed") {
        onClose();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSelectElement, onClose]);

  const handleClose = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "deactivate-devx-component-selector" },
        "*",
      );
    }
    onClose();
  }, [iframeRef, onClose]);

  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
      <div className="bg-background/90 border rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 shadow-lg">
        <MousePointer2 className="h-3.5 w-3.5 text-primary" />
        Click an element to inspect it
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 bg-background/90 border shadow-lg"
        onClick={handleClose}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
