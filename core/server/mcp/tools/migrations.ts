import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Plugins } from "../../plugin/plugin.ts";

declare const Trex: any;
declare const Deno: any;

import { escapeSql } from "../../lib/sql.ts";

type MigrationTarget = { name: string; path: string; schema: string; database: string };

// Core schema plus every plugin that declared a `migrations` config. The
// GraphQL runPluginMigrations mutation covers plugin targets the same way, so
// MCP must too — otherwise plugin migrations (e.g. devx) are invisible/unrun.
function collectTargets(pluginName?: string): MigrationTarget[] {
  const targets: MigrationTarget[] = [];
  const schemaDir = Deno.env.get("SCHEMA_DIR");
  if (schemaDir && (!pluginName || pluginName === "core")) {
    targets.push({ name: "core", path: schemaDir, schema: "trexdb", database: "_config" });
  }
  for (const t of Plugins.migrationTargets) {
    if (pluginName && t.name !== pluginName) continue;
    targets.push({ name: t.name, path: t.path, schema: t.schema, database: t.database });
  }
  return targets;
}

export function registerMigrationTools(server: McpServer) {
  server.tool(
    "migration-list",
    "List migration status for the core trex schema and for every plugin that ships migrations (e.g. devx). Each summary shows the target's schema/database, applied/pending counts, and per-migration version, name, status, applied timestamp, and checksum. Use this to check for pending migrations before running them.",
    {
      pluginName: z.string().optional().describe("Only report this target ('core' or a plugin name). Omit for all."),
    },
    async ({ pluginName }) => {
      try {
        const conn = new Trex.TrexDB("memory");
        const summaries: any[] = [];

        for (const target of collectTargets(pluginName)) {
          try {
            const sql = `SELECT version, name, status, applied_on, checksum FROM trex_migration_status_schema('${escapeSql(target.path)}', '${escapeSql(target.schema)}', '${escapeSql(target.database)}')`;
            const result = await conn.execute(sql, []);
            const rows = result?.rows || result || [];
            const migrations = rows.map((r: any) => ({
              version: parseInt(r.version ?? r[0] ?? "0", 10),
              name: r.name || r[1] || "",
              status: r.status || r[2] || "",
              appliedOn: r.applied_on || r[3] || null,
              checksum: r.checksum || r[4] || null,
            }));
            const appliedCount = migrations.filter((m: any) => m.status === "applied").length;
            const pendingCount = migrations.filter((m: any) => m.status === "pending").length;
            summaries.push({
              pluginName: target.name,
              schema: target.schema,
              database: target.database,
              appliedCount,
              pendingCount,
              migrations,
            });
          } catch (err: any) {
            summaries.push({ pluginName: target.name, error: err.message });
          }
        }

        if (summaries.length === 0) {
          return { content: [{ type: "text", text: "No migration targets configured (SCHEMA_DIR unset and no plugin migrations)." }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "migration-run",
    "Run pending migrations for the core trex schema and for plugins that ship migrations. Pass pluginName to restrict to a single target ('core' or a plugin name); omit to run all. Returns each migration that was processed with its target, version, name, and status.",
    {
      pluginName: z.string().optional().describe("Only run this target ('core' or a plugin name). Omit to run all."),
    },
    async ({ pluginName }) => {
      try {
        const conn = new Trex.TrexDB("memory");
        const allResults: any[] = [];

        for (const target of collectTargets(pluginName)) {
          const sql = `SELECT version, name, status FROM trex_migration_run_schema('${escapeSql(target.path)}', '${escapeSql(target.schema)}', '${escapeSql(target.database)}')`;
          const result = await conn.execute(sql, []);
          const rows = result?.rows || result || [];
          for (const r of rows) {
            allResults.push({
              plugin: target.name,
              version: parseInt(r.version ?? r[0] ?? "0", 10),
              name: r.name || r[1] || "",
              status: r.status || r[2] || "",
            });
          }
        }

        if (allResults.length === 0) {
          return { content: [{ type: "text", text: "No pending migrations to run." }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(allResults, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
