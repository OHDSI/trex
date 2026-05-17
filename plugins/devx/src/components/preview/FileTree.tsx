import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, FilePlus, FolderPlus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { FileIcon } from "./FileIcon";
import type { FileTreeEntry } from "@/lib/types";

interface FileTreeProps {
  entries: FileTreeEntry[];
  selectedFile: string | null;
  expanded: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  onCreateFile?: (path: string) => Promise<void>;
  onCreateDir?: (path: string) => Promise<void>;
  onDeleteFile?: (path: string) => Promise<void>;
  onRenameFile?: (from: string, to: string) => Promise<void>;
  depth?: number;
  searchQuery?: string;
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300/50 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// Inline input for creating/renaming
function InlineInput({ defaultValue, onSubmit, onCancel }: {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      defaultValue={defaultValue}
      className="w-full bg-background border border-primary rounded px-1 py-0 text-xs outline-none"
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit((e.target as HTMLInputElement).value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => {
        const val = e.target.value.trim();
        if (val && val !== defaultValue) onSubmit(val);
        else onCancel();
      }}
    />
  );
}

// Context menu
function ContextMenu({ x, y, isDir, onNewFile, onNewFolder, onRename, onDelete, onClose }: {
  x: number;
  y: number;
  isDir: boolean;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [onClose]);

  const items = [];
  if (isDir) {
    items.push(
      { icon: FilePlus, label: "New File", action: onNewFile },
      { icon: FolderPlus, label: "New Folder", action: onNewFolder },
    );
  }
  items.push(
    { icon: Pencil, label: "Rename", action: onRename },
    { icon: Trash2, label: "Delete", action: onDelete, danger: true },
  );

  return (
    <div
      className="fixed z-50 bg-popover border rounded-md shadow-lg py-1 min-w-[140px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
            (item as { danger?: boolean }).danger ? "text-destructive" : ""
          }`}
          onClick={() => { item.action?.(); onClose(); }}
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function FileTree({
  entries,
  selectedFile,
  expanded,
  onSelectFile,
  onToggleDir,
  onCreateFile,
  onCreateDir,
  onDeleteFile,
  onRenameFile,
  depth = 0,
  searchQuery,
}: FileTreeProps) {
  const isSearching = !!searchQuery?.trim();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileTreeEntry } | null>(null);
  const [inlineInput, setInlineInput] = useState<{ type: "new-file" | "new-folder" | "rename"; parentPath: string; entryPath?: string; name?: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleContextMenu = (e: React.MouseEvent, entry: FileTreeEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  return (
    <div>
      {/* Context menu */}
      {contextMenu && depth === 0 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isDir={contextMenu.entry.type === "directory"}
          onNewFile={() => setInlineInput({ type: "new-file", parentPath: contextMenu.entry.type === "directory" ? contextMenu.entry.path : contextMenu.entry.path.substring(0, contextMenu.entry.path.lastIndexOf("/")) })}
          onNewFolder={() => setInlineInput({ type: "new-folder", parentPath: contextMenu.entry.type === "directory" ? contextMenu.entry.path : contextMenu.entry.path.substring(0, contextMenu.entry.path.lastIndexOf("/")) })}
          onRename={() => setInlineInput({ type: "rename", parentPath: contextMenu.entry.path.substring(0, contextMenu.entry.path.lastIndexOf("/")), entryPath: contextMenu.entry.path, name: contextMenu.entry.name })}
          onDelete={async () => { if (confirm(`Delete "${contextMenu.entry.name}"?`)) await onDeleteFile?.(contextMenu.entry.path); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {entries.map((entry) => {
        const isExpanded = isSearching || expanded.has(entry.path);
        const isRenaming = inlineInput?.type === "rename" && inlineInput.entryPath === entry.path;

        return (
          <div key={entry.path}>
            <button
              className={`flex items-center gap-1 w-full text-left px-2 py-0.5 text-xs hover:bg-muted/60 transition-colors ${
                selectedFile === entry.path ? "bg-primary/10 text-primary" : ""
              } ${dropTarget === entry.path && entry.type === "directory" ? "bg-primary/20 ring-1 ring-primary/40" : ""}`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", entry.path);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (entry.type === "directory") {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget(entry.path);
                }
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={async (e) => {
                e.preventDefault();
                setDropTarget(null);
                const fromPath = e.dataTransfer.getData("text/plain");
                if (!fromPath || fromPath === entry.path) return;
                if (entry.type !== "directory") return;
                const fileName = fromPath.split("/").pop() || fromPath;
                const toPath = `${entry.path}/${fileName}`;
                await onRenameFile?.(fromPath, toPath);
              }}
              onClick={() => {
                if (entry.type === "directory") onToggleDir(entry.path);
                else onSelectFile(entry.path);
              }}
              onContextMenu={(e) => handleContextMenu(e, entry)}
            >
              {entry.type === "directory" ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                  )}
                  <FileIcon name={entry.name} isDirectory isExpanded={isExpanded} />
                </>
              ) : (
                <>
                  <span className="w-3 shrink-0" />
                  <FileIcon name={entry.name} />
                </>
              )}
              {isRenaming ? (
                <InlineInput
                  defaultValue={entry.name}
                  onSubmit={async (newName) => {
                    const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
                    const newPath = parentDir ? `${parentDir}/${newName}` : newName;
                    await onRenameFile?.(entry.path, newPath);
                    setInlineInput(null);
                  }}
                  onCancel={() => setInlineInput(null)}
                />
              ) : (
                <span className="truncate">
                  {searchQuery ? highlightMatch(entry.name, searchQuery) : entry.name}
                </span>
              )}
            </button>

            {entry.type === "directory" && isExpanded && (
              <>
                {/* Inline input for new file/folder inside this directory */}
                {inlineInput && (inlineInput.type === "new-file" || inlineInput.type === "new-folder") && inlineInput.parentPath === entry.path && (
                  <div
                    className="flex items-center gap-1 px-2 py-0.5"
                    style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                  >
                    <span className="w-3 shrink-0" />
                    <FileIcon name={inlineInput.type === "new-folder" ? "folder" : "file"} isDirectory={inlineInput.type === "new-folder"} />
                    <InlineInput
                      defaultValue=""
                      onSubmit={async (name) => {
                        const fullPath = `${entry.path}/${name}`;
                        if (inlineInput.type === "new-folder") await onCreateDir?.(fullPath);
                        else await onCreateFile?.(fullPath);
                        setInlineInput(null);
                      }}
                      onCancel={() => setInlineInput(null)}
                    />
                  </div>
                )}
                {entry.children && (
                  <FileTree
                    entries={entry.children}
                    selectedFile={selectedFile}
                    expanded={expanded}
                    onSelectFile={onSelectFile}
                    onToggleDir={onToggleDir}
                    onCreateFile={onCreateFile}
                    onCreateDir={onCreateDir}
                    onDeleteFile={onDeleteFile}
                    onRenameFile={onRenameFile}
                    depth={depth + 1}
                    searchQuery={searchQuery}
                  />
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Inline input for root-level new file/folder */}
      {depth === 0 && inlineInput && (inlineInput.type === "new-file" || inlineInput.type === "new-folder") && inlineInput.parentPath === "" && (
        <div className="flex items-center gap-1 px-2 py-0.5" style={{ paddingLeft: "8px" }}>
          <span className="w-3 shrink-0" />
          <FileIcon name={inlineInput.type === "new-folder" ? "folder" : "file"} isDirectory={inlineInput.type === "new-folder"} />
          <InlineInput
            defaultValue=""
            onSubmit={async (name) => {
              if (inlineInput.type === "new-folder") await onCreateDir?.(name);
              else await onCreateFile?.(name);
              setInlineInput(null);
            }}
            onCancel={() => setInlineInput(null)}
          />
        </div>
      )}
    </div>
  );
}

// Header with new file/folder buttons (used by CodeTab)
export function FileTreeActions({
  onNewFile,
  onNewFolder,
  onRefresh,
  refreshing,
}: {
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={onNewFile} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted" title="New File">
        <FilePlus className="h-3 w-3 text-muted-foreground" />
      </button>
      <button onClick={onNewFolder} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted" title="New Folder">
        <FolderPlus className="h-3 w-3 text-muted-foreground" />
      </button>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-50"
          title="Refresh file tree"
        >
          <RefreshCw className={`h-3 w-3 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}
