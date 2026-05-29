import { useState, useEffect, useCallback, useRef } from "react";
import type { FileTreeEntry } from "@/lib/types";
import * as api from "@/lib/api";

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf", "eot",
  "mp3", "mp4", "webm", "webp", "avif", "pdf", "zip", "tar", "gz",
]);

export function useFileTree(appId: string | null) {
  const [tree, setTree] = useState<FileTreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Cache: path → content. Cleared on appId change.
  const contentCache = useRef<Map<string, string>>(new Map());

  const refresh = useCallback(async () => {
    if (!appId) {
      setTree([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getFileTree(appId);
      setTree(data);
      // Auto-expand src/ directory if present
      const srcDir = data.find((e) => e.type === "directory" && e.name === "src");
      if (srcDir) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(srcDir.path);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to load file tree:", err);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    contentCache.current.clear();
    refresh();
    setSelectedFile(null);
    setFileContent(null);
    setExpanded(new Set());
  }, [refresh]);

  const selectFile = useCallback(
    async (filePath: string) => {
      if (!appId) return;
      setSelectedFile(filePath);
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      if (BINARY_EXTENSIONS.has(ext)) {
        setFileContent("Binary file — cannot be displayed");
        return;
      }
      // Return cached content instantly
      const cached = contentCache.current.get(filePath);
      if (cached !== undefined) {
        setFileContent(cached);
        return;
      }
      try {
        const content = await api.getFileContent(appId, filePath);
        contentCache.current.set(filePath, content);
        setFileContent(content);
      } catch (err) {
        console.error("Failed to load file:", err);
        setFileContent(`Error loading file: ${err}`);
      }
    },
    [appId],
  );

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const saveFile = useCallback(
    async (filePath: string, content: string) => {
      if (!appId) throw new Error("No app selected");
      await api.saveFileContent(appId, filePath, content);
      // Update cache with saved content
      contentCache.current.set(filePath, content);
      setFileContent(content);
    },
    [appId],
  );

  const reloadSelectedFile = useCallback(async () => {
    if (selectedFile && appId) {
      const ext = selectedFile.split(".").pop()?.toLowerCase() || "";
      if (BINARY_EXTENSIONS.has(ext)) return;
      try {
        const content = await api.getFileContent(appId, selectedFile);
        contentCache.current.set(selectedFile, content);
        setFileContent(content);
      } catch (err) {
        console.error("Failed to reload file:", err);
      }
    }
  }, [appId, selectedFile]);

  const createFile = useCallback(
    async (filePath: string) => {
      if (!appId) return;
      await api.createFile(appId, filePath);
      await refresh();
      await selectFile(filePath);
    },
    [appId, refresh, selectFile],
  );

  const deleteFile = useCallback(
    async (filePath: string) => {
      if (!appId) return;
      await api.deleteFile(appId, filePath);
      contentCache.current.delete(filePath);
      if (selectedFile === filePath) {
        setSelectedFile(null);
        setFileContent(null);
      }
      await refresh();
    },
    [appId, refresh, selectedFile],
  );

  const renameFile = useCallback(
    async (from: string, to: string) => {
      if (!appId) return;
      await api.renameFile(appId, from, to);
      contentCache.current.delete(from);
      if (selectedFile === from) {
        setSelectedFile(to);
      }
      await refresh();
    },
    [appId, refresh, selectedFile],
  );

  const createDir = useCallback(
    async (dirPath: string) => {
      if (!appId) return;
      await api.createDir(appId, dirPath);
      await refresh();
      setExpanded((prev) => new Set([...prev, dirPath]));
    },
    [appId, refresh],
  );

  return {
    tree, loading, selectedFile, fileContent, expanded,
    selectFile, toggleDir, refresh, reloadSelectedFile, saveFile,
    createFile, deleteFile, renameFile, createDir,
  };
}
