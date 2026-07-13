import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pool } from "../../db.ts";

export function registerObservabilityTools(server: McpServer) {
  server.tool(
    "event-log-list",
    "List platform event-log entries (trexdb.event_log) newest-first. Filter by level and/or paginate with `before` (return entries with id < before). Each entry has id, eventType, level, message, and createdAt. Use this to inspect recent platform activity, warnings, and errors.",
    {
      level: z.string().optional().describe("Filter by level, e.g. 'info', 'warn', 'error'."),
      limit: z.number().optional().describe("Max entries to return (1-500, default 100)."),
      before: z.string().optional().describe("Return entries with id less than this (for pagination)."),
    },
    async ({ level, limit, before }) => {
      try {
        const cappedLimit = Math.min(Math.max(limit || 100, 1), 500);
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (level) {
          conditions.push(`level = $${paramIdx++}`);
          params.push(level);
        }
        if (before) {
          conditions.push(`id < $${paramIdx++}`);
          params.push(before);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(cappedLimit);

        const result = await pool.query(
          `SELECT id, event_type, level, message, created_at FROM trexdb.event_log ${where} ORDER BY id DESC LIMIT $${paramIdx}`,
          params,
        );

        const entries = result.rows.map((r: any) => ({
          id: String(r.id),
          eventType: r.event_type,
          level: r.level,
          message: r.message,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        }));

        return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
