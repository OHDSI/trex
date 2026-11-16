import { defineTool } from "eve/tools";
import { assertRunInSession, saveCodingSystems } from "../lib/runs.ts";
import { type Ctx, guarded, requireSession, requireSql } from "../lib/ctx.ts";

export default defineTool({
  description:
    "Save the coding-system briefing for one institution (source_data_identifier) of a run, so every later row " +
    "and turn can reuse it. Saving again replaces the earlier briefing.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string" },
      source_data_identifier: { type: "string" },
      briefing: {
        type: "object",
        description: "{ systems: [{ name, country, language, publisher, catalog_url, applies_to_rows, prefix_taxonomy, crosswalks_available, notes }], per_row_enrichment?: [...] }",
      },
    },
    required: ["run_id", "source_data_identifier", "briefing"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const { run_id, source_data_identifier, briefing } = input as {
        run_id: string;
        source_data_identifier: string;
        briefing: unknown;
      };
      const sql = requireSql(ctx);
      await assertRunInSession(sql, run_id, requireSession(ctx));
      await saveCodingSystems(sql, run_id, source_data_identifier, briefing);
      return { saved: true };
    }),
});
