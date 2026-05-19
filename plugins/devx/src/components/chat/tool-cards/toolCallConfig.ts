import {
  Pencil,
  FileText,
  Trash2,
  Search,
  GitBranch,
  Database,
  Terminal,
  ClipboardList,
  Plug,
  Wrench,
  Image,
  type LucideIcon,
} from "lucide-react";

export interface ToolConfig {
  label: string;
  icon: LucideIcon;
  accentColor: string;
}

const toolConfigMap: Record<string, ToolConfig> = {
  // File write tools
  Write: { label: "Write File", icon: Pencil, accentColor: "amber" },
  Edit: { label: "Edit File", icon: Pencil, accentColor: "amber" },
  SearchReplace: { label: "Search & Replace", icon: Pencil, accentColor: "amber" },

  // File read tools
  Read: { label: "Read File", icon: FileText, accentColor: "blue" },
  Glob: { label: "List Files", icon: FileText, accentColor: "blue" },

  // Delete tools
  DeleteFile: { label: "Delete File", icon: Trash2, accentColor: "red" },

  // Code intelligence
  Grep: { label: "Search", icon: Search, accentColor: "blue" },
  CodeSearch: { label: "Code Search", icon: Search, accentColor: "blue" },

  // SQL / DB tools
  ExecuteSQL: { label: "Execute SQL", icon: Database, accentColor: "indigo" },
  DatabaseSchema: { label: "Database Schema", icon: Database, accentColor: "indigo" },
  TableData: { label: "Table Data", icon: Database, accentColor: "indigo" },

  // System tools
  TypeCheck: { label: "Type Check", icon: Terminal, accentColor: "gray" },
  ReadLogs: { label: "Read Logs", icon: Terminal, accentColor: "gray" },

  // Image generation
  GenerateImage: { label: "Generate Image", icon: Image, accentColor: "purple" },

  // Plan tools
  AskUserQuestion: { label: "Planning", icon: ClipboardList, accentColor: "violet" },
  WritePlan: { label: "Write Plan", icon: ClipboardList, accentColor: "violet" },
  ExitPlanMode: { label: "Exit Plan", icon: ClipboardList, accentColor: "violet" },
};

const defaultConfig: ToolConfig = {
  label: "Tool",
  icon: Wrench,
  accentColor: "gray",
};

const gitConfig: ToolConfig = {
  label: "Git",
  icon: GitBranch,
  accentColor: "purple",
};

const mcpConfig: ToolConfig = {
  label: "MCP Tool",
  icon: Plug,
  accentColor: "teal",
};

function formatToolName(name: string): string {
  return name
    .replace(/^(Git|mcp_)/, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getToolConfig(toolName: string): ToolConfig {
  // Exact match
  if (toolConfigMap[toolName]) {
    return toolConfigMap[toolName];
  }

  // Git tools
  if (toolName.startsWith("Git")) {
    return { ...gitConfig, label: formatToolName(toolName) };
  }

  // MCP tools
  if (toolName.startsWith("mcp_")) {
    return { ...mcpConfig, label: formatToolName(toolName) };
  }

  // Unknown tool
  return { ...defaultConfig, label: formatToolName(toolName) };
}

const accentColorMap: Record<string, { border: string; bg: string; text: string }> = {
  amber: { border: "border-l-amber-500", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  blue: { border: "border-l-blue-500", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  red: { border: "border-l-red-500", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
  purple: { border: "border-l-purple-500", bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
  indigo: { border: "border-l-indigo-500", bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400" },
  gray: { border: "border-l-gray-400", bg: "bg-gray-500/10", text: "text-gray-600 dark:text-gray-400" },
  violet: { border: "border-l-violet-500", bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  teal: { border: "border-l-teal-500", bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400" },
};

export function getAccentClasses(accentColor: string) {
  return accentColorMap[accentColor] ?? accentColorMap.gray;
}
