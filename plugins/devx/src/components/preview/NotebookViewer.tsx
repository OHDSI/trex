import { useEffect, useRef, useState, useCallback } from "react";
import { mountRootParcel, type Parcel } from "single-spa";
import { ChevronRight, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotebookViewerProps {
  content: string;
  filePath: string;
  onSave?: (filePath: string, content: string) => Promise<void>;
}

export function NotebookViewer({ content, filePath, onSave }: NotebookViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const parcelRef = useRef<Parcel | null>(null);
  const currentContentRef = useRef(content);
  const originalContentRef = useRef(content);
  const [isModified, setIsModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleContentChange = useCallback((newContent: string) => {
    currentContentRef.current = newContent;
    setIsModified(newContent !== originalContentRef.current);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave || !isModified) return;
    setSaving(true);
    try {
      await onSave(filePath, currentContentRef.current);
      originalContentRef.current = currentContentRef.current;
      setIsModified(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save notebook:", err);
    } finally {
      setSaving(false);
    }
  }, [onSave, filePath, isModified]);

  // Ctrl+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Mount/unmount parcel
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    async function loadAndMount() {
      try {
        // Load notebook CSS (Tailwind utilities for notebook components)
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/plugins/notebook/assets/notebook.css";
        link.dataset.notebookParcel = "true";
        document.head.appendChild(link);

        const parcelUrl = `/plugins/notebook/notebook-parcel.js`;
        const parcelModule = await import(/* @vite-ignore */ parcelUrl);

        if (cancelled) {
          link.remove();
          return;
        }

        parcelRef.current = mountRootParcel(parcelModule, {
          domElement: containerRef.current!,
          content,
          onContentChange: handleContentChange,
          readOnly: !onSave,
        });
      } catch (err) {
        if (!cancelled) setLoadError(String(err));
      }
    }

    loadAndMount();

    return () => {
      cancelled = true;
      // Clean up notebook CSS
      document.querySelector('link[data-notebook-parcel]')?.remove();
      if (parcelRef.current) {
        parcelRef.current.unmount();
        parcelRef.current = null;
      }
    };
  }, [filePath]); // remount on file change

  // Update parcel props when content changes externally
  useEffect(() => {
    if (parcelRef.current?.update) {
      parcelRef.current.update({
        content,
        onContentChange: handleContentChange,
        readOnly: !onSave,
      });
      originalContentRef.current = content;
      currentContentRef.current = content;
      setIsModified(false);
    }
  }, [content]);

  const breadcrumbs = filePath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb bar (matches CodeViewer) */}
      <div className="flex items-center justify-between px-3 py-1 border-b bg-muted/30">
        <div className="flex items-center gap-0.5 text-xs text-muted-foreground min-w-0 overflow-hidden">
          {breadcrumbs.map((segment, i) => (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
              <span
                className={
                  i === breadcrumbs.length - 1
                    ? "font-semibold text-foreground"
                    : ""
                }
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onSave && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs gap-1"
              onClick={handleSave}
              disabled={!isModified || saving}
            >
              {saved ? (
                <>
                  <Check className="h-3 w-3" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="h-3 w-3" />
                  {saving ? "Saving..." : "Save"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Parcel mount point */}
      {loadError ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <p>Failed to load notebook viewer: {loadError}</p>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 overflow-auto" />
      )}
    </div>
  );
}
