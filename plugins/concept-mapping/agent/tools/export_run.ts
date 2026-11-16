import { defineTool } from "eve/tools";
import { assertRunInSession, exportRun, runProgress } from "../lib/runs.ts";
import { type Ctx, guarded, requireSession, requireSql } from "../lib/ctx.ts";

const PREVIEW_LINES = 5;

export default defineTool({
  description:
    "Export a mapping run as a submission CSV. Rows without a saved result are included with empty target columns " +
    "and listed in `unfinished`; rows marked unmapped are listed in `unmapped` with their reason. The CSV is delivered to the user once, as a `run_export` event; you get a short preview unless include_csv is true.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string" },
      include_csv: { type: "boolean", description: "Also return the full CSV to you (only if the user asks to see it in chat)." },
    },
    required: ["run_id"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const sql = requireSql(ctx);
      const { run_id, include_csv } = input as { run_id: string; include_csv?: boolean };
      await assertRunInSession(sql, run_id, requireSession(ctx));
      const { csv, unfinished, unmapped } = await exportRun(sql, run_id);
      ctx?.emit?.("run_export", { runId: run_id, csv });
      const result = { run_id, progress: await runProgress(sql, run_id), unfinished, unmapped };
      // The CSV reaches the user once, as the run_export event. Keep it out of
      // the model context unless explicitly requested (it can be large).
      return include_csv
        ? { ...result, csv }
        : { ...result, csv_delivered_as_event: true, preview: csv.trimEnd().split("\n").slice(0, PREVIEW_LINES + 1).join("\n") };
    }),
});
