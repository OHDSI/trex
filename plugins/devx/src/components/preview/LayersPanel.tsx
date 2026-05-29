import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, Layers, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IframeRpc, DomTreeNode } from "@/lib/visual-editing-rpc";
import type { SelectedElement } from "@/lib/visual-editing-types";

interface LayersPanelProps {
  rpc: IframeRpc;
  selectedDevxId?: string;
  onSelectElement: (element: SelectedElement) => void;
  onClose: () => void;
}

function parseDevxId(devxId: string): { filePath: string; line: number; col: number } {
  const lastColon = devxId.lastIndexOf(":");
  const secondLastColon = devxId.lastIndexOf(":", lastColon - 1);
  if (secondLastColon === -1) return { filePath: devxId, line: 0, col: 0 };
  return {
    filePath: devxId.substring(0, secondLastColon),
    line: parseInt(devxId.substring(secondLastColon + 1, lastColon), 10) || 0,
    col: parseInt(devxId.substring(lastColon + 1), 10) || 0,
  };
}

function TreeNode({
  node,
  depth,
  selectedDevxId,
  onSelect,
  onToggleVisibility,
  defaultExpanded,
}: {
  node: DomTreeNode;
  depth: number;
  selectedDevxId?: string;
  onSelect: (node: DomTreeNode) => void;
  onToggleVisibility: (devxId: string, hidden: boolean) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hidden, setHidden] = useState(false);
  const isSelected = node.devxId === selectedDevxId;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={`flex items-center h-6 cursor-pointer hover:bg-muted/50 text-[11px] group ${
          isSelected ? "bg-primary/15 text-primary font-medium" : ""
        } ${hidden ? "opacity-40" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (node.devxId) onSelect(node);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className={`truncate flex-1 ${node.devxId ? "" : "text-muted-foreground"}`}>
          {node.name}
        </span>
        <span className="text-[9px] text-muted-foreground ml-1 shrink-0">
          {node.tagName !== node.name.toLowerCase() ? node.tagName : ""}
        </span>
        {node.devxId && (
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 ml-1"
            title={hidden ? "Show" : "Hide"}
            onClick={(e) => {
              e.stopPropagation();
              const next = !hidden;
              setHidden(next);
              onToggleVisibility(node.devxId!, next);
            }}
          >
            {hidden ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
          </button>
        )}
      </div>
      {expanded &&
        node.children.map((child, i) => (
          <TreeNode
            key={child.devxId || `${depth}-${i}`}
            node={child}
            depth={depth + 1}
            selectedDevxId={selectedDevxId}
            onSelect={onSelect}
            onToggleVisibility={onToggleVisibility}
            defaultExpanded={depth < 1}
          />
        ))}
    </>
  );
}

export function LayersPanel({ rpc, selectedDevxId, onSelectElement, onClose }: LayersPanelProps) {
  const [tree, setTree] = useState<DomTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTree = useCallback(() => {
    setLoading(true);
    rpc.getDomTree().then((nodes) => {
      setTree(nodes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [rpc]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const handleToggleVisibility = useCallback(
    (devxId: string, hidden: boolean) => {
      rpc.applyStyles(devxId, { visibility: hidden ? "hidden" : "visible" }).catch(() => {});
    },
    [rpc],
  );

  const handleSelect = useCallback(
    (node: DomTreeNode) => {
      if (!node.devxId) return;
      const { filePath, line, col } = parseDevxId(node.devxId);
      onSelectElement({
        devxId: node.devxId,
        devxName: node.name,
        tagName: node.tagName,
        filePath,
        line,
        col,
        boundingRect: { top: 0, left: 0, width: 0, height: 0 },
      });
    },
    [onSelectElement],
  );

  return (
    <div className="absolute left-2 top-12 z-20 w-52 bg-background border rounded-lg shadow-xl text-xs overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3" />
          <span className="font-medium">Layers</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            title="Refresh"
            onClick={loadTree}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="max-h-[50vh] overflow-y-auto py-1">
        {loading && <div className="px-3 py-2 text-muted-foreground">Loading...</div>}
        {!loading && tree.length === 0 && (
          <div className="px-3 py-2 text-muted-foreground">No components found</div>
        )}
        {tree.map((node, i) => (
          <TreeNode
            key={node.devxId || `root-${i}`}
            node={node}
            depth={0}
            selectedDevxId={selectedDevxId}
            onSelect={handleSelect}
            onToggleVisibility={handleToggleVisibility}
            defaultExpanded={true}
          />
        ))}
      </div>
    </div>
  );
}
