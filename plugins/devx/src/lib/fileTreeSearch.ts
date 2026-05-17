import type { FileTreeEntry } from "./types";

export function filterFileTree(entries: FileTreeEntry[], query: string): FileTreeEntry[] {
  if (!query.trim()) return entries;
  const lowerQuery = query.toLowerCase();

  return entries.reduce<FileTreeEntry[]>((acc, entry) => {
    if (entry.type === "file") {
      if (entry.name.toLowerCase().includes(lowerQuery) || entry.path.toLowerCase().includes(lowerQuery)) {
        acc.push(entry);
      }
    } else {
      // Directory: recursively filter children
      const filteredChildren = entry.children ? filterFileTree(entry.children, query) : [];
      if (filteredChildren.length > 0 || entry.name.toLowerCase().includes(lowerQuery)) {
        acc.push({ ...entry, children: filteredChildren });
      }
    }
    return acc;
  }, []);
}
