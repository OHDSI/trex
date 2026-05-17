import { useState, useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { getLanguageFromPath } from "@/lib/monaco-setup";
import "@/lib/monaco-setup";

interface DiffViewerProps {
  original: string;
  modified: string;
  filePath: string;
  onAccept?: () => void;
  onReject?: () => void;
}

export function DiffViewer({ original, modified, filePath, onAccept, onReject }: DiffViewerProps) {
  const language = getLanguageFromPath(filePath);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <span className="text-xs font-medium">{fileName} — Diff</span>
        {(onAccept || onReject) && (
          <div className="flex items-center gap-1.5">
            {onReject && (
              <button
                className="px-2 py-0.5 text-xs rounded border hover:bg-muted transition-colors text-muted-foreground"
                onClick={onReject}
              >
                Discard
              </button>
            )}
            {onAccept && (
              <button
                className="px-2 py-0.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={onAccept}
              >
                Accept
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          theme={isDark ? "devx-dark" : "devx-light"}
          options={{
            readOnly: true,
            renderSideBySide: true,
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8 },
          }}
          loading={
            <div className="p-4 text-xs text-muted-foreground">Loading diff...</div>
          }
        />
      </div>
    </div>
  );
}
