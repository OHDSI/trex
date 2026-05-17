// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";

export const getTableDataTool: ToolDefinition = {
  name: "TableData",
  description: "Preview data from a table in the app's database. Returns up to 50 rows.",
  modifiesState: false,
  defaultConsent: "always",
  parameters: {
    type: "object",
    properties: {
      app_id: { type: "string", description: "The app ID" },
      table_name: { type: "string", description: "The table name to query" },
      limit: { type: "number", description: "Max rows to return (default 50, max 50)" },
    },
    required: ["app_id", "table_name"],
  },
  async execute(args, ctx) {
    const limit = Math.min(args.limit || 50, 50);
    try {
      const dbResult = await ctx.sql(
        `SELECT schema_name FROM devx.app_databases WHERE app_id = $1`,
        [args.app_id],
      );
      if (dbResult.rows.length === 0) {
        return "No database found for this app.";
      }
      const schemaName = dbResult.rows[0].schema_name;

      // Validate table name to prevent SQL injection
      const tableName = args.table_name.replace(/[^a-zA-Z0-9_]/g, '');

      // Validate table exists in the schema
      const tableCheck = await ctx.sql(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schemaName, tableName],
      );
      if (tableCheck.rows.length === 0) {
        return `Table '${tableName}' not found in schema '${schemaName}'.`;
      }

      const data = await ctx.sql(
        `SELECT * FROM ${schemaName}.${tableName} LIMIT ${limit}`,
        [],
      );

      if (data.rows.length === 0) {
        return `Table '${tableName}' is empty.`;
      }

      // Format as readable table
      const headers = Object.keys(data.rows[0]);
      const rows = data.rows.map(r => headers.map(h => String(r[h] ?? "NULL")).join(" | "));
      return `${headers.join(" | ")}\n${"---".repeat(headers.length)}\n${rows.join("\n")}\n\n(${data.rows.length} rows)`;
    } catch (err) {
      return `Query error: ${err.message}`;
    }
  },
};
