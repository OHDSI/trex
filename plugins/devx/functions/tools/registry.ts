// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { setChatSummaryTool } from "./set_chat_summary.ts";
import { updateTodosTool } from "./update_todos.ts";
// Shell
import { bashTool } from "./bash.ts";
// File operations
import { writeFileTool } from "./write_file.ts";
import { editFileTool } from "./edit_file.ts";
import { searchReplaceTool } from "./search_replace.ts";
import { deleteFileTool } from "./delete_file.ts";
import { copyFileTool } from "./copy_file.ts";
import { renameFileTool } from "./rename_file.ts";
import { addDependencyTool } from "./add_dependency.ts";
// Code intelligence
import { readFileTool } from "./read_file.ts";
import { listFilesTool } from "./list_files.ts";
import { grepTool } from "./grep.ts";
import { codeSearchTool } from "./code_search.ts";
// System
import { runTypeChecksTool } from "./run_type_checks.ts";
import { readLogsTool } from "./read_logs.ts";
// Git
import {
  gitInitTool, gitCommitTool, gitStatusTool, gitLogTool, gitDiffTool,
  gitBranchListTool, gitBranchCreateTool, gitBranchSwitchTool, gitRevertTool,
} from "./git.ts";
// GitHub
import { gitPushTool, gitPullTool } from "./github.ts";
// Trex
import { executeSqlTool } from "./execute_sql.ts";
// Plan mode
import { planningQuestionnaireTool, writePlanTool, exitPlanTool } from "./plan_tools.ts";
// Context compaction
import { compactContextTool } from "./compact_context.ts";
// Web tools
import { webSearchTool } from "./web_search.ts";
import { webFetchTool } from "./web_fetch.ts";
import { webCrawlTool } from "./web_crawl.ts";
// Image generation
import { generateImageTool } from "./generate_image.ts";
// App commands
import { restartAppTool } from "./restart_app.ts";
import { refreshAppPreviewTool } from "./refresh_app_preview.ts";
// Database introspection
import { getDatabaseSchemaTool } from "./get_database_schema.ts";
import { getTableDataTool } from "./get_table_data.ts";
// Knowledge base
import {
  kbListReposTool, kbInitTool, kbUpdateTool, kbReadTool, kbSearchTool,
  kbListFilesTool, kbOverviewTool, kbFindSymbolsTool,
} from "./knowledge_base.ts";
// Subagents
import { spawnAgentTool } from "./spawn_agent.ts";
// Task management
import {
  taskCreateTool, taskGetTool, taskListTool, taskUpdateTool, taskStopTool,
} from "./task_tools.ts";
// Playwright browser tools
import {
  browserNavigateTool, browserClickTool, browserFillTool,
  browserGetTextTool, browserScreenshotTool, browserEvaluateTool,
} from "./playwright.ts";
// Enter plan mode
import { enterPlanModeTool } from "./enter_plan_mode.ts";
// Worktree
import { enterWorktreeTool, exitWorktreeTool } from "./worktree.ts";
// Cron
import { cronCreateTool, cronDeleteTool, cronListTool } from "./cron.ts";
// Messaging
import { sendMessageTool } from "./send_message.ts";
// Skills
import { skillTool } from "./skill_tool.ts";
// Tool search
import { toolSearchTool } from "./tool_search.ts";

/** All registered tools */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  setChatSummaryTool,
  updateTodosTool,
  // Shell
  bashTool,
  // File operations
  writeFileTool,
  editFileTool,
  searchReplaceTool,
  deleteFileTool,
  copyFileTool,
  renameFileTool,
  addDependencyTool,
  // Code intelligence
  readFileTool,
  listFilesTool,
  grepTool,
  codeSearchTool,
  // System
  runTypeChecksTool,
  readLogsTool,
  // Git
  gitInitTool,
  gitCommitTool,
  gitStatusTool,
  gitLogTool,
  gitDiffTool,
  gitBranchListTool,
  gitBranchCreateTool,
  gitBranchSwitchTool,
  gitRevertTool,
  // GitHub
  gitPushTool,
  gitPullTool,
  // Trex
  executeSqlTool,
  // Plan mode
  planningQuestionnaireTool,
  writePlanTool,
  exitPlanTool,
  // Context compaction
  compactContextTool,
  // Web tools
  webSearchTool,
  webFetchTool,
  webCrawlTool,
  // Image generation
  generateImageTool,
  // App commands
  restartAppTool,
  refreshAppPreviewTool,
  // Database introspection
  getDatabaseSchemaTool,
  getTableDataTool,
  // Knowledge base
  kbListReposTool,
  kbInitTool,
  kbUpdateTool,
  kbReadTool,
  kbSearchTool,
  kbListFilesTool,
  kbOverviewTool,
  kbFindSymbolsTool,
  // Subagents
  spawnAgentTool,
  // Task management
  taskCreateTool,
  taskGetTool,
  taskListTool,
  taskUpdateTool,
  taskStopTool,
  // Playwright browser tools
  browserNavigateTool,
  browserClickTool,
  browserFillTool,
  browserGetTextTool,
  browserScreenshotTool,
  browserEvaluateTool,
  // Enter plan mode
  enterPlanModeTool,
  // Worktree
  enterWorktreeTool,
  exitWorktreeTool,
  // Cron
  cronCreateTool,
  cronDeleteTool,
  cronListTool,
  // Messaging
  sendMessageTool,
  // Skills
  skillTool,
  // Tool search
  toolSearchTool,
];

/**
 * Build a tool set filtered by chat mode, user consent, and optional allowlist.
 * Returns an object suitable for the AI SDK's `tools` parameter.
 *
 * @param allowedTools - Optional allowlist from a command or agent definition.
 *   When provided, only tools in this list are included (after mode filtering).
 */
export function buildToolSet(
  mode: string,
  consents: Record<string, string>,
  allowedTools?: string[] | null,
) {
  const tools: Record<string, any> = {};
  const allowSet = allowedTools ? new Set(allowedTools) : null;

  for (const tool of TOOL_DEFINITIONS) {
    // Skip tools the user has set to "never"
    const userConsent = consents[tool.name];
    if (userConsent === "never") continue;

    // In ask mode, skip state-modifying tools
    if (mode === "ask" && tool.modifiesState) continue;

    // Plan mode: only read-only tools + plan-specific tools
    const PLAN_MODE_TOOLS = new Set([
      "Read", "Glob", "Grep", "CodeSearch",
      "GitStatus", "GitLog", "GitBranchList",
      "AskUserQuestion", "WritePlan", "ExitPlanMode",
      "KBListRepos", "KBInit", "KBUpdate", "KBRead", "KBSearch",
      "KBListFiles", "KBOverview", "KBFindSymbols",
      "TaskGet", "TaskList",
      "CronList", "ToolSearch",
    ]);
    if (mode === "plan" && !PLAN_MODE_TOOLS.has(tool.name)) continue;

    // Build mode doesn't use tools (uses raw streaming)
    if (mode === "build") continue;

    // Apply command/agent allowlist filter
    if (allowSet && !allowSet.has(tool.name)) continue;

    tools[tool.name] = {
      description: tool.description,
      parameters: tool.parameters,
    };
  }

  return tools;
}

/** Get a tool definition by name */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}
