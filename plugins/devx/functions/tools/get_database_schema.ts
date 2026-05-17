// @ts-nocheck - Deno edge function
import type { ToolDefinition, AgentContext } from "./types.ts";

export const getDatabaseSchemaTool: ToolDefinition = {
  name: "DatabaseSchema",
  description: "Get the database schema for the current app. Returns tables, columns, and their types.",
  modifiesState: false,
  defaultConsent: "always",
  parameters: {
    type: "object",
    properties: {
      app_id: { type: "string", description: "The app ID to get schema for" },
    },
    required: ["app_id"],
  },
  async execute(args, ctx) {
    try {
      // Get the app's database schema
      const dbResult = await ctx.sql(
        `SELECT schema_name FROM devx.app_databases WHERE app_id = $1`,
        [args.app_id],
      );
      if (dbResult.rows.length === 0) {
        return "No database found for this app. Use execute_sql to create tables first.";
      }
      const schemaName = dbResult.rows[0].schema_name;

      // Get all tables
      const tables = await ctx.sql(
        `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
        [schemaName],
      );

      if (tables.rows.length === 0) {
        return `Database schema '${schemaName}' exists but has no tables.`;
      }

      // Get columns for each table
      const result: string[] = [`Database Schema: ${schemaName}\n`];
      for (const table of tables.rows) {
        const columns = await ctx.sql(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [schemaName, table.table_name],
        );
        result.push(`Table: ${table.table_name} (${table.table_type})`);
        for (const col of columns.rows) {
          const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
          const def = col.column_default ? ` DEFAULT ${col.column_default}` : "";
          result.push(`  ${col.column_name}: ${col.data_type} ${nullable}${def}`);
        }
        result.push("");
      }
      return result.join("\n");
    } catch (err) {
      return `Schema introspection error: ${err.message}`;
    }
  },
};
