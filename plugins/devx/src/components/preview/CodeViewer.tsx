import { useState, useEffect, useCallback, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor, languages } from "monaco-editor";
import { Save, Check, ChevronRight, Map, WrapText, Eye, Code } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { getLanguageFromPath } from "@/lib/monaco-setup";
import type { Problem } from "@/lib/types";

// Import setup side-effects (themes, TS config)
import "@/lib/monaco-setup";

interface CodeViewerProps {
  content: string;
  filePath: string;
  onSave?: (filePath: string, content: string) => Promise<void>;
  problems?: Problem[];
  onFixPrompt?: (prompt: string) => void;
}

export function CodeViewer({ content, filePath, onSave, problems, onFixPrompt }: CodeViewerProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const currentValueRef = useRef(content);
  const originalValueRef = useRef(content);
  const [isModified, setIsModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const language = getLanguageFromPath(filePath);
  const isMarkdown = language === "markdown";

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Sync content from external changes (AI writes file, file tree reload)
  useEffect(() => {
    // If user has unsaved edits and content changed externally, show conflict banner
    if (isModified && content !== originalValueRef.current) {
      setExternalChange(true);
      originalValueRef.current = content;
      return;
    }
    originalValueRef.current = content;
    currentValueRef.current = content;
    setIsModified(false);
    setSaved(false);
    setExternalChange(false);
    // Update the editor model if it's a different value
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model && model.getValue() !== content) {
        model.setValue(content);
      }
    }
  }, [content, filePath]);

  const handleSave = useCallback(async () => {
    if (!onSave || !isModified) return;
    setSaving(true);
    try {
      await onSave(filePath, currentValueRef.current);
      originalValueRef.current = currentValueRef.current;
      setIsModified(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save file:", err);
    } finally {
      setSaving(false);
    }
  }, [onSave, filePath, isModified]);

  // Store handleSave in a ref so the Monaco keybinding always has the latest
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const onFixPromptRef = useRef(onFixPrompt);
  onFixPromptRef.current = onFixPrompt;
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Ctrl+S / Cmd+S to save
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => handleSaveRef.current(),
      );

      // "Fix with AI" code action
      monaco.languages.registerCodeActionProvider("*", {
        provideCodeActions(_model: MonacoEditor.ITextModel, _range: unknown, context: languages.CodeActionContext) {
          const markers = context.markers;
          if (markers.length === 0 || !onFixPromptRef.current)
            return { actions: [], dispose() {} };
          return {
            actions: markers.map((m) => ({
              title: `Fix with AI: ${m.message.substring(0, 60)}`,
              kind: "quickfix",
              diagnostics: [m],
              command: {
                id: "devx.fixWithAI",
                title: "Fix with AI",
                arguments: [m.message, _model.uri.path, m.startLineNumber],
              },
            })),
            dispose() {},
          };
        },
      });

      // Register the command handler
      editor.addAction({
        id: "devx.fixWithAI",
        label: "Fix with AI",
        run: (_ed, ...args) => {
          const [message, path, line] = args as [string, string, number];
          onFixPromptRef.current?.(
            `Fix this issue in ${path}:${line}: ${message}`,
          );
        },
      });

      // Focus the editor
      editor.focus();
    },
    [],
  );

  // Update diagnostics markers when problems change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const fileProblems = (problems || []).filter(
      (p) => p.file === filePath || filePath.endsWith(p.file),
    );

    monaco.editor.setModelMarkers(
      model,
      "type-check",
      fileProblems.map((p) => ({
        startLineNumber: p.line,
        startColumn: p.col,
        endLineNumber: p.line,
        endColumn: p.col + 30,
        message: p.message,
        severity:
          p.severity === "error"
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
      })),
    );
  }, [problems, filePath]);

  const handleChange = useCallback((value: string | undefined) => {
    const v = value ?? "";
    currentValueRef.current = v;
    setIsModified(v !== originalValueRef.current);
  }, []);

  const toggleMinimap = useCallback(() => {
    setMinimapEnabled((prev) => {
      const next = !prev;
      editorRef.current?.updateOptions({ minimap: { enabled: next } });
      return next;
    });
  }, []);

  const toggleWordWrap = useCallback(() => {
    setWordWrap((prev) => {
      const next = !prev;
      editorRef.current?.updateOptions({ wordWrap: next ? "on" : "off" });
      return next;
    });
  }, []);

  const breadcrumbs = filePath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb bar */}
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
          {isMarkdown && (
            <Button
              size="sm"
              variant="ghost"
              className={`h-6 w-6 p-0 ${showPreview ? "text-foreground" : "text-muted-foreground"}`}
              onClick={() => setShowPreview((v) => !v)}
              title={showPreview ? "Show editor" : "Preview markdown"}
            >
              {showPreview ? <Code className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className={`h-6 w-6 p-0 ${wordWrap ? "text-foreground" : "text-muted-foreground"}`}
            onClick={toggleWordWrap}
            title="Toggle word wrap"
          >
            <WrapText className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={`h-6 w-6 p-0 ${minimapEnabled ? "text-foreground" : "text-muted-foreground"}`}
            onClick={toggleMinimap}
            title="Toggle minimap"
          >
            <Map className="h-3 w-3" />
          </Button>
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

      {/* External change banner */}
      {externalChange && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 text-xs">
          <span className="text-yellow-700 dark:text-yellow-400">File changed externally.</span>
          <div className="flex gap-2">
            <button
              className="text-yellow-700 dark:text-yellow-400 hover:underline font-medium"
              onClick={() => {
                // Reload from external content
                currentValueRef.current = content;
                setIsModified(false);
                setExternalChange(false);
                const editor = editorRef.current;
                if (editor) {
                  const model = editor.getModel();
                  if (model) model.setValue(content);
                }
              }}
            >
              Reload
            </button>
            <button
              className="text-muted-foreground hover:underline"
              onClick={() => setExternalChange(false)}
            >
              Keep mine
            </button>
          </div>
        </div>
      )}

      {/* Markdown Preview or Monaco Editor */}
      {isMarkdown && showPreview ? (
        <div className="flex-1 overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {currentValueRef.current}
          </ReactMarkdown>
        </div>
      ) : (
      <div className="flex-1 overflow-hidden">
        <Editor
          path={filePath}
          language={language}
          defaultValue={content}
          theme={isDark ? "devx-dark" : "devx-light"}
          onMount={handleEditorMount}
          onChange={handleChange}
          loading={
            <div className="p-4 text-xs text-muted-foreground">
              Loading editor...
            </div>
          }
          options={{
            fontSize: 13,
            fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
            minimap: { enabled: minimapEnabled },
            wordWrap: "on",
            automaticLayout: true,
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            folding: true,
            renderLineHighlight: "line",
            tabSize: 2,
            insertSpaces: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            readOnly: !onSave,
            padding: { top: 8 },
          }}
        />
      </div>
      )}
    </div>
  );
}
