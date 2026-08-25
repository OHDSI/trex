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
//
// Never add a tool named in agent.ts's PLAN_MODE_TOOLS either, for the same
// class of reason. Plan mode allowlists a deliberately small tool set;
// deferral runs AFTER filterTools (toolset.ts Step 4 then Step 6), so a tool
// that is both allowlisted and deferred is dropped from plan mode entirely.
// The eight KB* tools and CronList were in both lists, which cost plan mode
// its whole knowledge-base surface -- and ToolSearch could not recover it
// within the turn, because activation only takes effect on the NEXT turn
// (handler.ts reads activated tools once, before runTurn). They are
// deferred no longer. deferred_tools.test.ts asserts the two lists stay
// disjoint.
export const DEFERRED_TOOLS: string[] = [
  "CronCreate", "CronDelete",
  "FigmaListFrames", "FigmaPullMockups",
  "BrowserNavigate", "BrowserClick", "BrowserFill",
  "BrowserGetText", "BrowserScreenshot", "BrowserEvaluate",
  "ExecuteSQL", "TableData", "DatabaseSchema",
  "GenerateImage", "WebCrawl", "AddDependency",
];
