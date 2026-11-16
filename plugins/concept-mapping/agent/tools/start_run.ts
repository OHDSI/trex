import { defineTool } from "eve/tools";
import { extractCsv, parseSourceCsv } from "../lib/csv.ts";
import { createRun, type QueryFn } from "../lib/runs.ts";
import { type Ctx, guarded, requireSession, requireSql } from "../lib/ctx.ts";

/** All text in a stored turn message, whatever its shape (string, {content}, {parts:[{text}]}). */
function messageText(m: unknown): string {
  if (typeof m === "string") return m;
  if (Array.isArray(m)) return m.map(messageText).join("\n");
  if (m && typeof m === "object") {
    const o = m as Record<string, unknown>;
    return ["text", "content", "parts", "message"].filter((k) => k in o).map((k) => messageText(o[k])).join("\n");
  }
  return "";
}

/** The CSV in this session's most recent user message that contains one. */
async function csvFromSession(sql: QueryFn, sessionId: string): Promise<string | null> {
  const { rows } = await sql(
    "SELECT message FROM agents.turns WHERE session_id::text = $1 ORDER BY seq DESC LIMIT 10",
    [sessionId],
  );
  for (const r of rows as Array<{ message: unknown }>) {
    const m = typeof r.message === "string" ? safeJson(r.message) : r.message;
    const csv = extractCsv(messageText(m));
    if (csv) return csv;
  }
  return null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export default defineTool({
  description:
    "Start a mapping run from a source CSV (columns: source_data_identifier, source_code, original_source_name, source_name). " +
    "Call it WITHOUT `csv` when the user put the CSV in their message: the tool reads it from the message exactly, so " +
    "nothing is lost in copying. Pass `csv` only for CSV text that is not in a user message. Stores every row as pending " +
    "and returns the run id, row count and rows per institution; nothing is stored if the CSV has errors.",
  inputSchema: {
    type: "object",
    properties: { csv: { type: "string", description: "Only if the CSV is not in the user's message." } },
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const sql = requireSql(ctx);
      const sessionId = requireSession(ctx);
      let text = (input as { csv?: string }).csv;
      if (!text?.trim()) {
        text = await csvFromSession(sql, sessionId).catch(() => null) ?? undefined;
        if (!text) return { errors: ["no CSV with a source_data_identifier header found in the recent user messages"] };
      }
      const { rows, errors } = parseSourceCsv(text);
      if (errors.length || rows.length === 0) return { errors: errors.length ? errors : ["no data rows"] };
      const runId = await createRun(sql, sessionId, ctx?.userId, rows);
      const institutions: Record<string, number> = {};
      for (const r of rows) institutions[r.sourceDataIdentifier] = (institutions[r.sourceDataIdentifier] ?? 0) + 1;
      return { run_id: runId, rows: rows.length, institutions, errors: [] };
    }),
});
