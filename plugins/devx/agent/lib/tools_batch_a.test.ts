// Batch A tests (task-v2-brief.md / task-v2a): imports every batch-A
// wrapper tools/<Name>.ts (fs/workspace/bash/git/github families, 25
// registry entries — see task-v2a-report.md for the full list and the
// worktree family-ambiguity call) and verifies, against each wrapper's OWN
// legacy source-of-truth def (the same functions/tools/*.ts object the
// wrapper imports and wraps — not a re-typed copy):
//   - the eve ToolDef brand (__trexTool) is set (loader.ts's contract for
//     every tools/*.ts default export)
//   - needsApproval mirrors the legacy entry's defaultConsent === "ask"
//   - modifiesState and description pass through unchanged
//
// Plus one behavioral smoke per family, exercising execute() end-to-end
// through wrap()'s toDevxCtx adapter with a fake ToolContext — same
// real-filesystem-under-a-scratch-dir precedent as lib/context.test.ts
// (ensureWorkspace is NOT mocked). The bash/workspace/git/github legacy
// implementations reach into globalThis.Trex.databaseManager() (devx's
// DuckDB-backed runtime, only present inside a running Trex worker), which
// is absent in a plain `deno test` process. Rather than mocking that global,
// these smokes assert the SAME deterministic failure the legacy AI-SDK loop
// would observe running outside a worker — proving the wrapper correctly
// threads args/ctx all the way to the real legacy impl and stops exactly at
// the Trex-runtime boundary, not before it.
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
import BashTool from "../tools/Bash.ts";
import WriteTool from "../tools/Write.ts";
import EditTool from "../tools/Edit.ts";
import SearchReplaceTool from "../tools/SearchReplace.ts";
import DeleteFileTool from "../tools/DeleteFile.ts";
import CopyFileTool from "../tools/CopyFile.ts";
import RenameFileTool from "../tools/RenameFile.ts";
import AddDependencyTool from "../tools/AddDependency.ts";
import ReadTool from "../tools/Read.ts";
import GlobTool from "../tools/Glob.ts";
import GrepTool from "../tools/Grep.ts";
import CodeSearchTool from "../tools/CodeSearch.ts";
import GitInitTool from "../tools/GitInit.ts";
import GitCommitTool from "../tools/GitCommit.ts";
import GitStatusTool from "../tools/GitStatus.ts";
import GitLogTool from "../tools/GitLog.ts";
import GitDiffTool from "../tools/GitDiff.ts";
import GitBranchListTool from "../tools/GitBranchList.ts";
import GitBranchCreateTool from "../tools/GitBranchCreate.ts";
import GitBranchSwitchTool from "../tools/GitBranchSwitch.ts";
import GitRevertTool from "../tools/GitRevert.ts";
import GitPushTool from "../tools/GitPush.ts";
import GitPullTool from "../tools/GitPull.ts";
import EnterWorktreeTool from "../tools/EnterWorktree.ts";
import ExitWorktreeTool from "../tools/ExitWorktree.ts";

// Legacy defs — the exact same objects each wrapper above imports and wraps.
import { bashTool } from "../../functions/tools/bash.ts";
import { writeFileTool } from "../../functions/tools/write_file.ts";
import { editFileTool } from "../../functions/tools/edit_file.ts";
import { searchReplaceTool } from "../../functions/tools/search_replace.ts";
import { deleteFileTool } from "../../functions/tools/delete_file.ts";
import { copyFileTool } from "../../functions/tools/copy_file.ts";
import { renameFileTool } from "../../functions/tools/rename_file.ts";
import { addDependencyTool } from "../../functions/tools/add_dependency.ts";
import { readFileTool } from "../../functions/tools/read_file.ts";
import { listFilesTool } from "../../functions/tools/list_files.ts";
import { grepTool } from "../../functions/tools/grep.ts";
import { codeSearchTool } from "../../functions/tools/code_search.ts";
import {
  gitInitTool, gitCommitTool, gitStatusTool, gitLogTool, gitDiffTool,
  gitBranchListTool, gitBranchCreateTool, gitBranchSwitchTool, gitRevertTool,
} from "../../functions/tools/git.ts";
import { gitPushTool, gitPullTool } from "../../functions/tools/github.ts";
import { enterWorktreeTool, exitWorktreeTool } from "../../functions/tools/worktree.ts";

// Redirect workspace.ts's DEFAULT_WORKSPACE_DIR to a scratch dir, same as
// lib/context.test.ts, so this file never touches /tmp/devx-workspaces.
const SCRATCH = await Deno.makeTempDir({ prefix: "devx-agent-tools-batch-a-test-" });
Deno.env.set("DEVX_WORKSPACE_DIR", SCRATCH);

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
// Registration table: every batch-A entry, wrapped tool paired with the
// legacy def it wraps.
// ---------------------------------------------------------------------------
interface LegacyLike {
  description: string;
  defaultConsent: string;
  modifiesState?: boolean;
}

const ENTRIES: Array<{ name: string; wrapped: unknown; legacy: LegacyLike }> = [
  { name: "Bash", wrapped: BashTool, legacy: bashTool },
  { name: "Write", wrapped: WriteTool, legacy: writeFileTool },
  { name: "Edit", wrapped: EditTool, legacy: editFileTool },
  { name: "SearchReplace", wrapped: SearchReplaceTool, legacy: searchReplaceTool },
  { name: "DeleteFile", wrapped: DeleteFileTool, legacy: deleteFileTool },
  { name: "CopyFile", wrapped: CopyFileTool, legacy: copyFileTool },
  { name: "RenameFile", wrapped: RenameFileTool, legacy: renameFileTool },
  { name: "AddDependency", wrapped: AddDependencyTool, legacy: addDependencyTool },
  { name: "Read", wrapped: ReadTool, legacy: readFileTool },
  { name: "Glob", wrapped: GlobTool, legacy: listFilesTool },
  { name: "Grep", wrapped: GrepTool, legacy: grepTool },
  { name: "CodeSearch", wrapped: CodeSearchTool, legacy: codeSearchTool },
  { name: "GitInit", wrapped: GitInitTool, legacy: gitInitTool },
  { name: "GitCommit", wrapped: GitCommitTool, legacy: gitCommitTool },
  { name: "GitStatus", wrapped: GitStatusTool, legacy: gitStatusTool },
  { name: "GitLog", wrapped: GitLogTool, legacy: gitLogTool },
  { name: "GitDiff", wrapped: GitDiffTool, legacy: gitDiffTool },
  { name: "GitBranchList", wrapped: GitBranchListTool, legacy: gitBranchListTool },
  { name: "GitBranchCreate", wrapped: GitBranchCreateTool, legacy: gitBranchCreateTool },
  { name: "GitBranchSwitch", wrapped: GitBranchSwitchTool, legacy: gitBranchSwitchTool },
  { name: "GitRevert", wrapped: GitRevertTool, legacy: gitRevertTool },
  { name: "GitPush", wrapped: GitPushTool, legacy: gitPushTool },
  { name: "GitPull", wrapped: GitPullTool, legacy: gitPullTool },
  { name: "EnterWorktree", wrapped: EnterWorktreeTool, legacy: enterWorktreeTool },
  { name: "ExitWorktree", wrapped: ExitWorktreeTool, legacy: exitWorktreeTool },
];

Deno.test("batch A: exactly 25 registry entries ported, one wrapper file per entry", () => {
  assertEquals(ENTRIES.length, 25);
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
// toDevxCtx (fake ToolContext, real filesystem under SCRATCH).
// ---------------------------------------------------------------------------

Deno.test("smoke [file ops family]: Write then Read round-trips file content in the real workspace", async () => {
  const ctx = fakeToolContext({ userId: "fs-user" });
  const writeResult = await (WriteTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ path: "hello.txt", content: "hello batch a" }, ctx);
  assertMatch(String(writeResult), /hello\.txt/);

  const readResult = await (ReadTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ path: "hello.txt" }, ctx);
  assertEquals(readResult, "hello batch a");
});

Deno.test("smoke [bash family]: Bash.execute reaches the legacy duckdb() boundary and degrades gracefully outside a Trex worker", async () => {
  const ctx = fakeToolContext({ userId: "bash-user" });
  const result = await (BashTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
    .execute({ command: "echo hi" }, ctx);
  // No globalThis.Trex in this test process -> duckdb() throws "DuckDB not
  // available"; bashTool's own try/catch turns that into a returned string
  // instead of a throw — proving args/ctx wiring reached the real impl.
  assertMatch(String(result), /Error executing command:.*DuckDB not available/s);
});

Deno.test("smoke [workspace family]: AddDependency.execute reaches the legacy duckdb() boundary", async () => {
  const ctx = fakeToolContext({ userId: "dep-user" });
  await assertRejects(
    () =>
      (AddDependencyTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> })
        .execute({ packages: ["left-pad"] }, ctx),
    Error,
    "DuckDB not available",
  );
});

Deno.test("smoke [git family]: GitInit.execute reaches the legacy gitOps->duckdb() boundary", async () => {
  const ctx = fakeToolContext({ userId: "git-user" });
  await assertRejects(
    () => (GitInitTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> }).execute({}, ctx),
    Error,
    "DuckDB not available",
  );
});

Deno.test("smoke [github family]: GitPush.execute reaches the legacy ctx.sql() token lookup and fails cleanly with no integration row", async () => {
  const ctx = fakeToolContext({ userId: "gh-user", sql: () => Promise.resolve({ rows: [] }) });
  await assertRejects(
    () => (GitPushTool as { execute: (i: unknown, c: FakeCtx) => Promise<unknown> }).execute({}, ctx),
    Error,
    "GitHub not connected",
  );
});
