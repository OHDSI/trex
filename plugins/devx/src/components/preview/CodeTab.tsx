import { useState, useEffect, useMemo, useCallback } from "react";
import { FileTree, FileTreeActions } from "./FileTree";
import { CodeViewer } from "./CodeViewer";
import { NotebookViewer } from "./NotebookViewer";
import { EditorTabBar } from "./EditorTabBar";
import { QuickOpen } from "./QuickOpen";
import { SearchPanel } from "./SearchPanel";
import { File, Search, Files, Columns2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { filterFileTree } from "@/lib/fileTreeSearch";
import { useEditorTabs } from "@/hooks/useEditorTabs";
import type { useFileTree } from "@/hooks/useFileTree";
import type { Problem } from "@/lib/types";

interface CodeTabProps {
  appId: string | null;
  fileTree: ReturnType<typeof useFileTree>;
  problems?: Problem[];
  onFixPrompt?: (prompt: string) => void;
}

export function CodeTab({ appId, fileTree, problems, onFixPrompt }: CodeTabProps) {
  const {
    tree, loading, selectedFile, fileContent, expanded,
    selectFile, toggleDir, refresh, reloadSelectedFile, saveFile,
    createFile, deleteFile, renameFile, createDir,
  } = fileTree;
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"files" | "search">("files");
  const [splitFile, setSplitFile] = useState<string | null>(null);
  const [splitContent, setSplitContent] = useState<string | null>(null);
  const editorTabs = useEditorTabs(appId);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredTree = useMemo(
    () => filterFileTree(tree, debouncedQuery),
    [tree, debouncedQuery],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      selectFile(filePath);
      editorTabs.openFile(filePath);
    },
    [selectFile, editorTabs.openFile],
  );

  const handleTabSelect = useCallback(
    (filePath: string) => {
      selectFile(filePath);
      editorTabs.setActiveTab(filePath);
    },
    [selectFile, editorTabs.setActiveTab],
  );

  const handleTabClose = useCallback(
    (filePath: string) => {
      editorTabs.closeTab(filePath);
    },
    [editorTabs.closeTab],
  );

  const handleQuickOpenSelect = useCallback(
    (filePath: string) => {
      setShowQuickOpen(false);
      selectFile(filePath);
      editorTabs.openFile(filePath);
    },
    [selectFile, editorTabs.openFile],
  );

  const handleSearchResult = useCallback(
    (filePath: string, _line: number) => {
      selectFile(filePath);
      editorTabs.openFile(filePath);
      // TODO: navigate to line in editor
    },
    [selectFile, editorTabs.openFile],
  );

  const handleSplitOpen = useCallback(() => {
    if (selectedFile && fileContent !== null) {
      setSplitFile(selectedFile);
      setSplitContent(fileContent);
    }
  }, [selectedFile, fileContent]);

  const handleCloseSplit = useCallback(() => {
    setSplitFile(null);
    setSplitContent(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setShowQuickOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setSidebarMode("search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (selectedFile && editorTabs.activeTab !== selectedFile) {
      editorTabs.openFile(selectedFile);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (editorTabs.activeTab && editorTabs.activeTab !== selectedFile) {
      selectFile(editorTabs.activeTab);
    }
  }, [editorTabs.activeTab]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading files...
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <File className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-sm">No files in this app</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full relative">
      {/* Sidebar */}
      <div className="w-1/3 min-w-[160px] max-w-[280px] border-r overflow-auto flex flex-col">
        {/* Sidebar header with mode toggle */}
        <div className="flex items-center justify-between px-2 py-1 border-b">
          <div className="flex items-center gap-0.5">
            <button
              className={`h-6 w-6 flex items-center justify-center rounded text-xs ${sidebarMode === "files" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              onClick={() => setSidebarMode("files")}
              title="Explorer"
            >
              <Files className="h-3.5 w-3.5" />
            </button>
            <button
              className={`h-6 w-6 flex items-center justify-center rounded text-xs ${sidebarMode === "search" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              onClick={() => setSidebarMode("search")}
              title="Search (Ctrl+Shift+F)"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
          {sidebarMode === "files" && (
            <FileTreeActions
              onNewFile={() => createFile?.("untitled")}
              onNewFolder={() => createDir?.("new-folder")}
              onRefresh={() => { refresh(); reloadSelectedFile(); }}
              refreshing={loading}
            />
          )}
        </div>

        {sidebarMode === "files" ? (
          <>
            <div className="px-2 py-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Filter files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-6 text-xs pl-6 pr-2"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <FileTree
                entries={filteredTree}
                selectedFile={selectedFile}
                expanded={expanded}
                onSelectFile={handleSelectFile}
                onToggleDir={toggleDir}
                onCreateFile={createFile}
                onCreateDir={createDir}
                onDeleteFile={deleteFile}
                onRenameFile={renameFile}
                searchQuery={debouncedQuery}
              />
            </div>
          </>
        ) : (
          <SearchPanel
            appId={appId || ""}
            onOpenResult={handleSearchResult}
          />
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center border-b">
          <div className="flex-1 overflow-hidden">
            <EditorTabBar
              tabs={editorTabs.tabs}
              activeTab={editorTabs.activeTab}
              onSelectTab={handleTabSelect}
              onCloseTab={handleTabClose}
            />
          </div>
          {selectedFile && (
            <button
              className={`h-7 w-7 flex items-center justify-center shrink-0 border-l ${splitFile ? "text-primary" : "text-muted-foreground"} hover:bg-muted/50`}
              onClick={splitFile ? handleCloseSplit : handleSplitOpen}
              title={splitFile ? "Close split" : "Split editor"}
            >
              {splitFile ? <X className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <div className={`flex-1 flex overflow-hidden ${splitFile ? "divide-x" : ""}`}>
          {/* Primary pane */}
          <div className={`flex-1 overflow-hidden ${splitFile ? "min-w-0" : ""}`}>
            {selectedFile && fileContent !== null ? (
              selectedFile.endsWith(".ipynb") ? (
                <NotebookViewer
                  content={fileContent}
                  filePath={selectedFile}
                  onSave={saveFile}
                />
              ) : (
                <CodeViewer
                  content={fileContent}
                  filePath={selectedFile}
                  onSave={saveFile}
                  problems={problems}
                  onFixPrompt={onFixPrompt}
                />
              )
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                {editorTabs.tabs.length === 0
                  ? "Select a file to view"
                  : "Loading file..."}
              </div>
            )}
          </div>
          {/* Split pane */}
          {splitFile && splitContent !== null && (
            <div className="flex-1 min-w-0 overflow-hidden">
              {splitFile.endsWith(".ipynb") ? (
                <NotebookViewer
                  content={splitContent}
                  filePath={splitFile}
                  onSave={saveFile}
                />
              ) : (
                <CodeViewer
                  content={splitContent}
                  filePath={splitFile}
                  onSave={saveFile}
                  problems={problems}
                  onFixPrompt={onFixPrompt}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Open overlay */}
      {showQuickOpen && (
        <QuickOpen
          tree={tree}
          onSelect={handleQuickOpenSelect}
          onDismiss={() => setShowQuickOpen(false)}
        />
      )}
    </div>
  );
}
