// Task 16: the tail of less-common devx tools withheld from the initial
// request until ToolSearch reveals them (core's service/context/toolsplit.ts
// -- see core/server/agents/COMPAT.md's "Context management" divergence
// entry). A SHARED constant, not duplicated between agent.ts (which reads it
// into defineAgent's `context.deferredTools`) and tools/ToolSearch.ts (which
// reads it to know which legacy TOOL_DEFINITIONS entries are valid
// ToolSearch candidates) -- importing agent.ts's own, much heavier, module
// graph (provider auth, coder-context assembly, skill hooks, ...) from a
// single tools/*.ts file just for this one array would be a needless
// coupling that also risks a real import cycle down the line.
//
// Never add a tool from the always-on set here: Read, Write, Edit,
// SearchReplace, Bash, Grep, Glob, CodeSearch, GitStatus, GitDiff, GitCommit,
// the Task* tools, Skill, Agent, AskUserQuestion, TodoWrite, ToolSearch
// itself. Deferring ToolSearch would make the deferred set permanently
// unreachable -- see toolset.ts's Step 6 comment.
export const DEFERRED_TOOLS: string[] = [
  "KBListRepos", "KBInit", "KBUpdate", "KBRead", "KBSearch",
  "KBListFiles", "KBOverview", "KBFindSymbols",
  "CronCreate", "CronDelete", "CronList",
  "FigmaListFrames", "FigmaPullMockups",
  "BrowserNavigate", "BrowserClick", "BrowserFill",
  "BrowserGetText", "BrowserScreenshot", "BrowserEvaluate",
  "ExecuteSQL", "TableData", "DatabaseSchema",
  "GenerateImage", "WebCrawl", "AddDependency",
];
