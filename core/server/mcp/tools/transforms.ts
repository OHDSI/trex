import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getTransformPlugins,
  registerTransformEndpoints,
  upsertTransformDeployment,
} from "../../plugin/transform.ts";

declare const Trex: any;

import { escapeSql } from "../../lib/sql.ts";

// Transform plugins are dbt-style ELT projects bundled with a plugin. The
// engine functions (trex_transform_*) take the on-disk project path plus a
// fully-qualified `<db>.<schema>` destination; the source is passed as a bare
// schema name via the `source_schema` named argument. This mirrors the
// GraphQL transform* resolvers so MCP and the dashboard stay in lockstep.
function resolveProjectPath(pluginName: string): string {
  const plugin = getTransformPlugins().find((p) => p.pluginName === pluginName);
  if (!plugin) {
    throw new Error(`Transform plugin '${pluginName}' not found`);
  }
  return plugin.projectPath;
}

export function registerTransformTools(server: McpServer) {
  server.tool(
    "transform-list-projects",
    "List all transform (dbt-style ELT) projects provided by installed plugins. Each entry has the pluginName (used as the identifier for the other transform-* tools) and the on-disk projectPath. Use this first to discover what transform projects exist.",
    {},
    async () => {
      try {
        const projects = getTransformPlugins();
        return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "transform-compile",
    "Compile a transform project's models without running them. Returns each model's name, materialization strategy, execution order, and compile status. Use this to validate a project and inspect the model DAG before planning or running.",
    {
      pluginName: z.string().describe("Transform plugin name (from transform-list-projects)"),
    },
    async ({ pluginName }) => {
      try {
        const projectPath = resolveProjectPath(pluginName);
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT * FROM trex_transform_compile('${escapeSql(projectPath)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const models = rows.map((r: any) => ({
          name: r.name || r[0] || "",
          materialized: r.materialized || r[1] || "",
          order: parseInt(r.order ?? r[3] ?? "0", 10),
          status: r.status || r[4] || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(models, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "transform-plan",
    "Dry-run a transform project against a destination: show what each model WOULD do (create/update/skip) and why, without mutating anything. Prefer this before transform-run. destDb+destSchema name the target catalog/schema; sourceSchema is the schema the models read from.",
    {
      pluginName: z.string().describe("Transform plugin name (from transform-list-projects)"),
      destDb: z.string().describe("Destination database/catalog name"),
      destSchema: z.string().describe("Destination schema name"),
      sourceSchema: z.string().describe("Source schema the models read from"),
    },
    async ({ pluginName, destDb, destSchema, sourceSchema }) => {
      try {
        const projectPath = resolveProjectPath(pluginName);
        const dest = `${destDb}.${destSchema}`;
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT * FROM trex_transform_plan('${escapeSql(projectPath)}', '${escapeSql(dest)}', source_schema := '${escapeSql(sourceSchema)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const plan = rows.map((r: any) => ({
          name: r.name || r[0] || "",
          action: r.action || r[1] || "",
          materialized: r.materialized || r[2] || "",
          reason: r.reason || r[3] || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "transform-run",
    "Execute a transform project against a destination, materializing its models. This MUTATES the destination schema — run transform-plan first. On success it also registers the transform's REST/read endpoints and records the deployment. destDb+destSchema name the target; sourceSchema is the read schema.",
    {
      pluginName: z.string().describe("Transform plugin name (from transform-list-projects)"),
      destDb: z.string().describe("Destination database/catalog name"),
      destSchema: z.string().describe("Destination schema name"),
      sourceSchema: z.string().describe("Source schema the models read from"),
    },
    async ({ pluginName, destDb, destSchema, sourceSchema }) => {
      try {
        const projectPath = resolveProjectPath(pluginName);
        const dest = `${destDb}.${destSchema}`;
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT * FROM trex_transform_run('${escapeSql(projectPath)}', '${escapeSql(dest)}', source_schema := '${escapeSql(sourceSchema)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const runResults = rows.map((r: any) => ({
          name: r.name || r[0] || "",
          action: r.action || r[1] || "",
          materialized: r.materialized || r[2] || "",
          durationMs: String(r.duration_ms ?? r[3] ?? "0"),
          message: r.message || r[4] || "",
        }));

        // Best-effort: expose the freshly materialized models and record the
        // deployment. Endpoint registration failing must not fail the run.
        try {
          await registerTransformEndpoints(pluginName, destDb, destSchema);
          await upsertTransformDeployment(pluginName, destDb, destSchema);
        } catch (endpointErr: any) {
          console.error("Transform endpoint registration error:", endpointErr);
        }

        return { content: [{ type: "text", text: JSON.stringify(runResults, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "transform-seed",
    "Load a transform project's seed data (CSV seeds) into the destination schema. Returns each seed's name, action, row count, and message.",
    {
      pluginName: z.string().describe("Transform plugin name (from transform-list-projects)"),
      destDb: z.string().describe("Destination database/catalog name"),
      destSchema: z.string().describe("Destination schema name"),
    },
    async ({ pluginName, destDb, destSchema }) => {
      try {
        const projectPath = resolveProjectPath(pluginName);
        const dest = `${destDb}.${destSchema}`;
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT * FROM trex_transform_seed('${escapeSql(projectPath)}', '${escapeSql(dest)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const seeds = rows.map((r: any) => ({
          name: r.name || r[0] || "",
          action: r.action || r[1] || "",
          rows: r.rows || r[2] || "",
          message: r.message || r[3] || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(seeds, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "transform-test",
    "Run a transform project's data tests against a destination. Returns each test's name, pass/fail status, and how many rows it returned (non-zero usually means failure). destDb+destSchema name the target; sourceSchema is the read schema.",
    {
      pluginName: z.string().describe("Transform plugin name (from transform-list-projects)"),
      destDb: z.string().describe("Destination database/catalog name"),
      destSchema: z.string().describe("Destination schema name"),
      sourceSchema: z.string().describe("Source schema the models read from"),
    },
    async ({ pluginName, destDb, destSchema, sourceSchema }) => {
      try {
        const projectPath = resolveProjectPath(pluginName);
        const dest = `${destDb}.${destSchema}`;
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT * FROM trex_transform_test('${escapeSql(projectPath)}', '${escapeSql(dest)}', source_schema := '${escapeSql(sourceSchema)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const tests = rows.map((r: any) => ({
          name: r.name || r[0] || "",
          status: r.status || r[1] || "",
          rowsReturned: r.rows_returned || r[2] || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(tests, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "transform-freshness",
    "Check source-data freshness for a transform project's destination: for each source, the max loaded_at timestamp, age in hours, and whether it breaches the warn/error thresholds. Use this to verify upstream data is current before running transforms.",
    {
      pluginName: z.string().describe("Transform plugin name (from transform-list-projects)"),
      destDb: z.string().describe("Destination database/catalog name"),
      destSchema: z.string().describe("Destination schema name"),
    },
    async ({ pluginName, destDb, destSchema }) => {
      try {
        const projectPath = resolveProjectPath(pluginName);
        const dest = `${destDb}.${destSchema}`;
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT * FROM trex_transform_freshness('${escapeSql(projectPath)}', '${escapeSql(dest)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const freshness = rows.map((r: any) => ({
          name: r.name || r[0] || "",
          status: r.status || r[1] || "",
          maxLoadedAt: r.max_loaded_at || r[2] || "",
          ageHours: parseFloat(r.age_hours ?? r[3] ?? "0"),
          warnAfter: r.warn_after || r[4] || "",
          errorAfter: r.error_after || r[5] || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(freshness, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
