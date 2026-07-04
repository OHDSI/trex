// Batch B tests (task-v2-brief.md / task-v2b): imports every batch-B
// wrapper tools/<Name>.ts (db/web/planning/tasks/app-control/kb/playwright/
// cron/messaging/tool-search families, 41 registry entries — see
// task-v2b-report.md for the full list) and verifies, against each
// wrapper's OWN legacy source-of-truth def (the same functions/tools/*.ts
// object the wrapper imports and wraps — not a re-typed copy):
//   - the eve ToolDef brand (__trexTool) is set (loader.ts's contract for
//     every tools/*.ts default export)
//   - needsApproval mirrors the legacy entry's defaultConsent === "ask"
//   - modifiesState and description pass through unchanged
//
// Plus one behavioral smoke per family, exercising execute() end-to-end
// through wrap()'s toDevxCtx adapter with a fake ToolContext — same
// real-filesystem-under-a-scratch-dir precedent as lib/context.test.ts and
// tools_batch_a.test.ts. Families whose legacy impl only does real network
// I/O (web search/fetch/crawl) are documented as constructible-level only —
// no execute() smoke, since a real network call is neither deterministic
// nor appropriate for this test run (no --allow-net egress assumed).
//
// This file lives in lib/, NOT tools/: loader.ts scans EVERY tools/*.ts
// entry under a strict one-file-one-tool contract (default export must be a
// __trexTool-branded defineTool result), so a test file inside tools/ would
// make loadAgent() throw and the whole agent fail to load. lib/ is never
// scanned. The sibling load_agent_dir.test.ts is the regression guard for
// that contract.
import { assert, assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";
import type { ToolContext } from "../../../../core/server/agents/eve-shim/types.ts";

// Wrapped (eve) tools — the thing under test.
import SetChatSummaryTool from "../tools/SetChatSummary.ts";
import TodoWriteTool from "../tools/TodoWrite.ts";
import TypeCheckTool from "../tools/TypeCheck.ts";
import ReadLogsTool from "../tools/ReadLogs.ts";
import ExecuteSQLTool from "../tools/ExecuteSQL.ts";
import AskUserQuestionTool from "../tools/AskUserQuestion.ts";
import WritePlanTool from "../tools/WritePlan.ts";
import ExitPlanModeTool from "../tools/ExitPlanMode.ts";
import EnterPlanModeTool from "../tools/EnterPlanMode.ts";
import WebSearchTool from "../tools/WebSearch.ts";
import WebFetchTool from "../tools/WebFetch.ts";
import WebCrawlTool from "../tools/WebCrawl.ts";
import GenerateImageTool from "../tools/GenerateImage.ts";
import RestartAppTool from "../tools/RestartApp.ts";
import RefreshPreviewTool from "../tools/RefreshPreview.ts";
import DatabaseSchemaTool from "../tools/DatabaseSchema.ts";
import TableDataTool from "../tools/TableData.ts";
import KBListReposTool from "../tools/KBListRepos.ts";
import KBInitTool from "../tools/KBInit.ts";
import KBUpdateTool from "../tools/KBUpdate.ts";
import KBReadTool from "../tools/KBRead.ts";
import KBSearchTool from "../tools/KBSearch.ts";
import KBListFilesTool from "../tools/KBListFiles.ts";
import KBOverviewTool from "../tools/KBOverview.ts";
import KBFindSymbolsTool from "../tools/KBFindSymbols.ts";
import TaskCreateTool from "../tools/TaskCreate.ts";
import TaskGetTool from "../tools/TaskGet.ts";
import TaskListTool from "../tools/TaskList.ts";
import TaskUpdateTool from "../tools/TaskUpdate.ts";
import TaskStopTool from "../tools/TaskStop.ts";
import BrowserNavigateTool from "../tools/BrowserNavigate.ts";
import BrowserClickTool from "../tools/BrowserClick.ts";
import BrowserFillTool from "../tools/BrowserFill.ts";
import BrowserGetTextTool from "../tools/BrowserGetText.ts";
import BrowserScreenshotTool from "../tools/BrowserScreenshot.ts";
import BrowserEvaluateTool from "../tools/BrowserEvaluate.ts";
import CronCreateTool from "../tools/CronCreate.ts";
import CronDeleteTool from "../tools/CronDelete.ts";
import CronListTool from "../tools/CronList.ts";
import SendMessageTool from "../tools/SendMessage.ts";
import ToolSearchTool from "../tools/ToolSearch.ts";

// Legacy defs — the exact same objects each wrapper above imports and wraps.
import { setChatSummaryTool } from "../../functions/tools/set_chat_summary.ts";
import { updateTodosTool } from "../../functions/tools/update_todos.ts";
import { runTypeChecksTool } from "../../functions/tools/run_type_checks.ts";
import { readLogsTool } from "../../functions/tools/read_logs.ts";
import { executeSqlTool } from "../../functions/tools/execute_sql.ts";
import { exitPlanTool, planningQuestionnaireTool, writePlanTool } from "../../functions/tools/plan_tools.ts";
import { enterPlanModeTool } from "../../functions/tools/enter_plan_mode.ts";
import { webSearchTool } from "../../functions/tools/web_search.ts";
import { webFetchTool } from "../../functions/tools/web_fetch.ts";
import { webCrawlTool } from "../../functions/tools/web_crawl.ts";
import { generateImageTool } from "../../functions/tools/generate_image.ts";
import { restartAppTool } from "../../functions/tools/restart_app.ts";
import { refreshAppPreviewTool } from "../../functions/tools/refresh_app_preview.ts";
import { getDatabaseSchemaTool } from "../../functions/tools/get_database_schema.ts";
import { getTableDataTool } from "../../functions/tools/get_table_data.ts";
import {
  kbFindSymbolsTool,
  kbInitTool,
  kbListFilesTool,
  kbListReposTool,
  kbOverviewTool,
  kbReadTool,
  kbSearchTool,
  kbUpdateTool,
} from "../../functions/tools/knowledge_base.ts";
import {
  taskCreateTool,
  taskGetTool,
  taskListTool,
  taskStopTool,
  taskUpdateTool,
} from "../../functions/tools/task_tools.ts";
import {
  browserClickTool,
  browserEvaluateTool,
  browserFillTool,
  browserGetTextTool,
  browserNavigateTool,
  browserScreenshotTool,
} from "../../functions/tools/playwright.ts";
import { cronCreateTool, cronDeleteTool, cronListTool } from "../../functions/tools/cron.ts";
import { sendMessageTool } from "../../functions/tools/send_message.ts";
import { toolSearchTool } from "../../functions/tools/tool_search.ts";

// Redirect workspace.ts's DEFAULT_WORKSPACE_DIR to a scratch dir, same as
// lib/context.test.ts and tools_batch_a.test.ts, so this file never touches
// /tmp/devx-workspaces.
const SCRATCH = await Deno.makeTempDir({ prefix: "devx-agent-tools-batch-b-test-" });
Deno.env.set("DEVX_WORKSPACE_DIR", SCRATCH);
// GenerateImage's smoke depends on this var being unset — clear it
// unconditionally so the test is deterministic regardless of the host shell.
Deno.env.delete("OPENAI_API_KEY");

type FakeCtx = ToolContext & { sql: NonNullable<ToolContext["sql"]> };

function fakeToolContext(overrides: Partial<ToolContext> = {}): FakeCtx {
  return {
    sessionId: "s-1",
    userId: "u-1",
    metadata: { mode: "build", chatId: "c-1" },
    sql: () => Promise.resolve({ rows: [] }),
    ...overrides,
  } as FakeCtx;
}

// ---------------------------------------------------------------------------
// Registration table: every batch-B entry, wrapped tool paired with the
// legacy def it wraps.
// ---------------------------------------------------------------------------
interface LegacyLike {
  description: string;
  defaultConsent: string;
  modifiesState?: boolean;
}

const ENTRIES: Array<{ name: string; wrapped: unknown; legacy: LegacyLike }> = [
  { name: "SetChatSummary", wrapped: SetChatSummaryTool, legacy: setChatSummaryTool },
  { name: "TodoWrite", wrapped: TodoWriteTool, legacy: updateTodosTool },
  { name: "TypeCheck", wrapped: TypeCheckTool, legacy: runTypeChecksTool },
  { name: "ReadLogs", wrapped: ReadLogsTool, legacy: readLogsTool },
  { name: "ExecuteSQL", wrapped: ExecuteSQLTool, legacy: executeSqlTool },
  { name: "AskUserQuestion", wrapped: AskUserQuestionTool, legacy: planningQuestionnaireTool },
  { name: "WritePlan", wrapped: WritePlanTool, legacy: writePlanTool },
  { name: "ExitPlanMode", wrapped: ExitPlanModeTool, legacy: exitPlanTool },
  { name: "EnterPlanMode", wrapped: EnterPlanModeTool, legacy: enterPlanModeTool },
  { name: "WebSearch", wrapped: WebSearchTool, legacy: webSearchTool },
  { name: "WebFetch", wrapped: WebFetchTool, legacy: webFetchTool },
  { name: "WebCrawl", wrapped: WebCrawlTool, legacy: webCrawlTool },
  { name: "GenerateImage", wrapped: GenerateImageTool, legacy: generateImageTool },
  { name: "RestartApp", wrapped: RestartAppTool, legacy: restartAppTool },
  { name: "RefreshPreview", wrapped: RefreshPreviewTool, legacy: refreshAppPreviewTool },
  { name: "DatabaseSchema", wrapped: DatabaseSchemaTool, legacy: getDatabaseSchemaTool },
  { name: "TableData", wrapped: TableDataTool, legacy: getTableDataTool },
  { name: "KBListRepos", wrapped: KBListReposTool, legacy: kbListReposTool },
  { name: "KBInit", wrapped: KBInitTool, legacy: kbInitTool },
  { name: "KBUpdate", wrapped: KBUpdateTool, legacy: kbUpdateTool },
  { name: "KBRead", wrapped: KBReadTool, legacy: kbReadTool },
  { name: "KBSearch", wrapped: KBSearchTool, legacy: kbSearchTool },
  { name: "KBListFiles", wrapped: KBListFilesTool, legacy: kbListFilesTool },
  { name: "KBOverview", wrapped: KBOverviewTool, legacy: kbOverviewTool },
  { name: "KBFindSymbols", wrapped: KBFindSymbolsTool, legacy: kbFindSymbolsTool },
  { name: "TaskCreate", wrapped: TaskCreateTool, legacy: taskCreateTool },
  { name: "TaskGet", wrapped: TaskGetTool, legacy: taskGetTool },
  { name: "TaskList", wrapped: TaskListTool, legacy: taskListTool },
  { name: "TaskUpdate", wrapped: TaskUpdateTool, legacy: taskUpdateTool },
  { name: "TaskStop", wrapped: TaskStopTool, legacy: taskStopTool },
  { name: "BrowserNavigate", wrapped: BrowserNavigateTool, legacy: browserNavigateTool },
  { name: "BrowserClick", wrapped: BrowserClickTool, legacy: browserClickTool },
  { name: "BrowserFill", wrapped: BrowserFillTool, legacy: browserFillTool },
  { name: "BrowserGetText", wrapped: BrowserGetTextTool, legacy: browserGetTextTool },
  { name: "BrowserScreenshot", wrapped: BrowserScreenshotTool, legacy: browserScreenshotTool },
  { name: "BrowserEvaluate", wrapped: BrowserEvaluateTool, legacy: browserEvaluateTool },
  { name: "CronCreate", wrapped: CronCreateTool, legacy: cronCreateTool },
  { name: "CronDelete", wrapped: CronDeleteTool, legacy: cronDeleteTool },
  { name: "CronList", wrapped: CronListTool, legacy: cronListTool },
  { name: "SendMessage", wrapped: SendMessageTool, legacy: sendMessageTool },
  { name: "ToolSearch", wrapped: ToolSearchTool, legacy: toolSearchTool },
];

Deno.test("batch B: exactly 41 registry entries ported, one wrapper file per entry", () => {
  assertEquals(ENTRIES.length, 41);
});

for (const { name, wrapped, legacy } of ENTRIES) {
  Deno.test(`${name}: __trexTool brand is set`, () => {
    assertEquals((wrapped as { __trexTool?: boolean }).__trexTool, true);
  });

  Deno.test(`${name}: needsApproval mirrors legacy defaultConsent === "ask"`, () => {
    assertEquals(
      (wrapped as { needsApproval?: boolean }).needsApproval,
      legacy.defaultConsent === "ask",
    );
  });

  Deno.test(`${name}: modifiesState passes through unchanged from the legacy def`, () => {
    assertEquals((wrapped as { modifiesState?: boolean }).modifiesState, legacy.modifiesState);
  });

  Deno.test(`${name}: description passes through unchanged from the legacy def`, () => {
    assertEquals((wrapped as { description?: string }).description, legacy.description);
  });

  Deno.test(`${name}: execute is present (defineTool requires it unless clientOnly)`, () => {
    assert(typeof (wrapped as { execute?: unknown }).execute === "function");
  });
}

// ---------------------------------------------------------------------------
// Behavioral smokes — one per family, execute() end-to-end via a real
// toDevxCtx (fake ToolContext, real filesystem under SCRATCH). Each smoke
// picks the family member whose legacy impl reaches a deterministic outcome
// without a live Trex worker / real network egress.
// ---------------------------------------------------------------------------

Deno.test("smoke [chat-meta family]: SetChatSummary.execute reaches ctx.sql and returns the summary", async () => {
  const calls: unknown[] = [];
  const ctx = fakeToolContext({
    sql: (q: string, params?: unknown[]) => {
      calls.push([q, params]);
      return Promise.resolve({ rows: [] });
    },
  });
  const result = await (SetChatSummaryTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ summary: "batch b smoke" }, ctx);
  assertEquals(result, 'Chat summary set to: "batch b smoke"');
  assertEquals(calls.length, 1);
});

Deno.test("smoke [system family]: ReadLogs.execute finds no log file in a fresh real workspace and says so", async () => {
  const ctx = fakeToolContext({ userId: "logs-user" });
  const result = await (ReadLogsTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({}, ctx);
  assertEquals(result, "No log file found. Specify a path explicitly.");
});

Deno.test("smoke [db family]: ExecuteSQL.execute rejects when no app database is registered (ctx.sql boundary, no duckdb needed)", async () => {
  const ctx = fakeToolContext();
  await assertRejects(
    () => (ExecuteSQLTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> }).execute({ sql: "select 1" }, ctx),
    Error,
    "No database found for this app",
  );
});

Deno.test("smoke [plan-mode family]: EnterPlanMode.execute sends mode_change and returns the fixed message", async () => {
  const emitted: Array<[string, unknown]> = [];
  const ctx = fakeToolContext({ emit: (name, data) => emitted.push([name, data]) });
  const result = await (EnterPlanModeTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({}, ctx);
  assertMatch(String(result), /Switched to plan mode/);
  assertEquals(emitted, [["mode_change", { type: "mode_change", mode: "plan" }]]);
});

// Web family (WebSearch/WebFetch/WebCrawl): the legacy impls make a real
// `fetch()` call with no injectable transport seam — there is no
// deterministic execute() outcome without live network egress, which this
// test suite does not assume. Constructible-level only: covered by the
// brand/consent/modifiesState/description/execute-presence loop above.

Deno.test("smoke [image family]: GenerateImage.execute reports the missing OPENAI_API_KEY deterministically (no network attempted)", async () => {
  const ctx = fakeToolContext();
  const result = await (GenerateImageTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ prompt: "a red circle", filename: "circle.png" }, ctx);
  assertEquals(result, "Error: OPENAI_API_KEY environment variable not set. Cannot generate images.");
});

Deno.test("smoke [app-control family]: RefreshPreview.execute sends app_command/refresh and returns the fixed message", async () => {
  const emitted: Array<[string, unknown]> = [];
  const ctx = fakeToolContext({ emit: (name, data) => emitted.push([name, data]) });
  const result = await (RefreshPreviewTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({}, ctx);
  assertMatch(String(result), /Preview refresh signal sent/);
  assertEquals(emitted, [["app_command", { type: "app_command", command: "refresh" }]]);
});

Deno.test("smoke [knowledge-base family]: KBListRepos.execute lists categories from the real (uncloned) KB filesystem", async () => {
  const ctx = fakeToolContext();
  const result = await (KBListReposTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ category: "atlas" }, ctx);
  assertMatch(String(result), /## atlas — OHDSI Atlas platform and backend/);
  assertMatch(String(result), /webapi — Backend REST API for Atlas/);
});

Deno.test("smoke [task-mgmt family]: TaskList.execute reaches ctx.sql and reports no tasks", async () => {
  const ctx = fakeToolContext();
  const result = await (TaskListTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({}, ctx);
  assertEquals(result, "No tasks found for this conversation.");
});

Deno.test("smoke [playwright family]: BrowserNavigate.execute reaches the legacy duckdb() boundary via the real helper script path", async () => {
  const ctx = fakeToolContext({ userId: "pw-user" });
  const result = await (BrowserNavigateTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ url: "http://localhost:1" }, ctx);
  // getHelperPath() resolves the real playwright_helper.js on disk (no Docker
  // path present, falls back to import.meta.url resolution); runPlaywright's
  // own try/catch then turns the missing-globalThis.Trex duckdb() failure
  // into a returned {ok:false} rather than a throw, same degrade-gracefully
  // shape as the bash/git family smokes in tools_batch_a.test.ts.
  assertMatch(String(result), /Navigation failed:.*(DuckDB not available|Playwright execution failed)/s);
});

Deno.test("smoke [cron family]: CronList.execute reaches ctx.sql and reports no scheduled tasks", async () => {
  const ctx = fakeToolContext();
  const result = await (CronListTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({}, ctx);
  assertEquals(result, "No scheduled tasks found.");
});

Deno.test("smoke [messaging family]: SendMessage.execute is a deterministic no-op stub", async () => {
  const ctx = fakeToolContext();
  const result = await (SendMessageTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ to: "teammate", message: "hi" }, ctx);
  assertEquals(result, "Message sent to teammate: hi");
});

Deno.test("smoke [tool-search family]: ToolSearch.execute matches against the real (full, unfiltered) legacy TOOL_DEFINITIONS list", async () => {
  const ctx = fakeToolContext();
  const result = await (ToolSearchTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ query: "bash" }, ctx);
  assertMatch(String(result), /\*\*Bash\*\*/);
});
