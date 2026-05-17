// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";

export const executeSqlTool: ToolDefinition<{ sql: string }> = {
  name: "ExecuteSQL",
  description:
    "Execute SQL against the app's database schema on Trex. The app must have a database created first.",
  parameters: {
    type: "object",
    properties: {
      sql: { type: "string", description: "SQL statement to execute" },
    },
    required: ["sql"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    return `Execute SQL: ${args.sql.slice(0, 120)}`;
  },

  async execute(args, ctx) {
    // Look up app's schema
    const dbResult = await ctx.sql(
      `SELECT schema_name FROM devx.app_databases
       WHERE app_id = (SELECT id FROM devx.apps WHERE id IN (
         SELECT app_id FROM devx.chats WHERE id = $1
       )) LIMIT 1`,
      [ctx.chatId],
    );
    if (dbResult.rows.length === 0) {
      throw new Error("No database found for this app. Create one first via the app settings.");
    }

    const schemaName = dbResult.rows[0].schema_name;

    // Validate schema name strictly
    if (!/^devx_app_[a-zA-Z0-9_]+$/.test(schemaName)) {
      throw new Error("Invalid schema name");
    }

    // Use set_config with is_local=true for transaction-scoped search_path
    await ctx.sql(`SELECT set_config('search_path', $1 || ', public', true)`, [schemaName]);
    const result = await ctx.sql(args.sql, []);
    const rows = result.rows;

    if (!rows || rows.length === 0) {
      return "Query executed successfully. No rows returned.";
    }

    // Format as table
    const cols = Object.keys(rows[0]);
    const header = cols.join(" | ");
    const separator = cols.map((c) => "-".repeat(c.length)).join("-+-");
    const body = rows
      .slice(0, 100)
      .map((row) => cols.map((c) => String(row[c] ?? "NULL")).join(" | "))
      .join("\n");

    const truncated = rows.length > 100 ? `\n\n(showing 100 of ${rows.length} rows)` : "";
    return `${header}\n${separator}\n${body}${truncated}`;
  },
};
