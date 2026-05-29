import { File, Folder, FolderOpen } from "lucide-react";

const EXT_COLORS: Record<string, string> = {
  ts: "text-blue-500",
  tsx: "text-blue-500",
  js: "text-yellow-500",
  jsx: "text-yellow-500",
  mjs: "text-yellow-500",
  cjs: "text-yellow-500",
  css: "text-purple-500",
  scss: "text-pink-500",
  html: "text-orange-500",
  json: "text-green-500",
  md: "text-gray-400",
  mdx: "text-gray-400",
  py: "text-teal-500",
  rs: "text-orange-600",
  go: "text-cyan-500",
  sql: "text-blue-400",
  yaml: "text-red-400",
  yml: "text-red-400",
  toml: "text-gray-500",
  svg: "text-amber-500",
  png: "text-green-400",
  jpg: "text-green-400",
  gif: "text-green-400",
  env: "text-yellow-600",
  sh: "text-green-600",
  dockerfile: "text-blue-400",
  ipynb: "text-orange-500",
};

interface FileIconProps {
  name: string;
  isDirectory?: boolean;
  isExpanded?: boolean;
  className?: string;
}

export function FileIcon({ name, isDirectory, isExpanded, className = "h-3.5 w-3.5 shrink-0" }: FileIconProps) {
  if (isDirectory) {
    return isExpanded
      ? <FolderOpen className={`${className} text-blue-500`} />
      : <Folder className={`${className} text-blue-500`} />;
  }

  const ext = name.split(".").pop()?.toLowerCase() || "";
  const lowerName = name.toLowerCase();

  // Special filenames
  if (lowerName === "dockerfile") return <File className={`${className} text-blue-400`} />;
  if (lowerName.startsWith(".env")) return <File className={`${className} text-yellow-600`} />;
  if (lowerName === "package.json") return <File className={`${className} text-green-500`} />;
  if (lowerName === "tsconfig.json") return <File className={`${className} text-blue-500`} />;

  const color = EXT_COLORS[ext];
  return <File className={`${className} ${color || "opacity-50"}`} />;
}
