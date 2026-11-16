import { defineTool } from "eve/tools";
import { assertRunInSession, getCodingSystems, latestRunForSession, pendingRows, runProgress } from "../lib/runs.ts";
import { type Ctx, guarded, requireSession, requireSql, ToolError } from "../lib/ctx.ts";

export default defineTool({
  description:
    "Fetch the next pending rows of a mapping run, with the saved coding-system briefings and progress. " +
    "Omit run_id to resume the latest run in this session (use this when the user says 'continue').",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "Rows to fetch (default 20)." },
    },
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const sql = requireSql(ctx);
      const { run_id, limit } = input as { run_id?: string; limit?: number };
      const sessionId = requireSession(ctx);
      const runId = run_id ?? await latestRunForSession(sql, sessionId);
      if (!runId) throw new ToolError("no mapping run in this session; call start_run first");
      await assertRunInSession(sql, runId, sessionId);
      return {
        run_id: runId,
        rows: await pendingRows(sql, runId, limit ?? 20),
        coding_systems: await getCodingSystems(sql, runId),
        progress: await runProgress(sql, runId),
      };
    }),
});
