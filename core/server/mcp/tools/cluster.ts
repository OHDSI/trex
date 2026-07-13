import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

declare const Trex: any;

import { escapeSql } from "../../lib/sql.ts";

export function registerClusterTools(server: McpServer) {
  server.tool(
    "cluster-list-nodes",
    "List all nodes in the trexsql distributed cluster. Returns each node's ID, name, gossip address, data node flag, and current status (alive/suspect/dead). Use this to inspect cluster topology and health.",
    {},
    async () => {
      try {
        const conn = new Trex.TrexDB("memory");
        const result = await conn.execute("SELECT * FROM trex_db_nodes()", []);
        const rows = result?.rows || result || [];
        const nodes = rows.map((r: any) => ({
          nodeId: r.node_id || r[0] || "",
          nodeName: r.node_name || r[1] || "",
          gossipAddr: r.gossip_addr || r[2] || "",
          dataNode: r.data_node || r[3] || "",
          status: r.status || r[4] || "",
        }));
        return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "cluster-list-services",
    "List all services running across the trexsql cluster. Shows each service's node, name, host, port, status, uptime, and configuration. Services include Flight SQL servers, pgwire endpoints, ETL workers, and other extension-provided services.",
    {},
    async () => {
      try {
        const conn = new Trex.TrexDB("memory");
        const result = await conn.execute("SELECT * FROM trex_db_services()", []);
        const rows = result?.rows || result || [];
        const services = rows.map((r: any) => ({
          nodeName: r.node_name || r[0] || "",
          serviceName: r.service_name || r[1] || "",
          host: r.host || r[2] || "",
          port: r.port || r[3] || "",
          status: r.status || r[4] || "",
          uptimeSeconds: r.uptime_seconds || r[5] || "",
          config: r.config || r[6] || null,
        }));
        return { content: [{ type: "text", text: JSON.stringify(services, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "cluster-get-status",
    "Get high-level cluster status: total nodes, active queries, queued queries, and memory utilization percentage. Use this for a quick health check of the distributed trexsql cluster.",
    {},
    async () => {
      try {
        const conn = new Trex.TrexDB("memory");
        const result = await conn.execute("SELECT * FROM trex_db_cluster_status()", []);
        const rows = result?.rows || result || [];
        if (rows.length === 0) {
          return { content: [{ type: "text", text: "No cluster status available (single-node mode or cluster not initialized)" }] };
        }
        const r = rows[0];
        const status = {
          totalNodes: r.total_nodes || r[0] || "",
          activeQueries: r.active_queries || r[1] || "",
          queuedQueries: r.queued_queries || r[2] || "",
          memoryUtilizationPct: r.memory_utilization_pct || r[3] || "",
        };
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "cluster-start-service",
    "Start a service on the trexsql cluster. The extension parameter identifies which extension provides the service (e.g. 'pgwire', 'flight'). The config parameter is a JSON string with service-specific configuration (host, port, etc.).",
    {
      extension: z.string().describe("Extension name that provides the service (e.g. 'pgwire', 'flight')"),
      config: z.string().describe("JSON configuration string for the service"),
    },
    async ({ extension, config }) => {
      try {
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT trex_db_start_service('${escapeSql(extension)}', '${escapeSql(config)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const message = rows[0]?.[0] || rows[0]?.trex_db_start_service || "Service started";
        return { content: [{ type: "text", text: message }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "cluster-stop-service",
    "Stop a running service on the trexsql cluster. Identify the service by its extension name.",
    {
      extension: z.string().describe("Extension name of the service to stop"),
    },
    async ({ extension }) => {
      try {
        const conn = new Trex.TrexDB("memory");
        const sql = `SELECT trex_db_stop_service('${escapeSql(extension)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const message = rows[0]?.[0] || rows[0]?.trex_db_stop_service || "Service stopped";
        return { content: [{ type: "text", text: message }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "cluster-restart-service",
    "Restart a service on the trexsql cluster: stops it (ignoring errors if it wasn't running) then starts it with the given config. Use this to apply a new configuration to a running service.",
    {
      extension: z.string().describe("Extension name that provides the service (e.g. 'pgwire', 'flight')"),
      config: z.string().describe("JSON configuration string for the service"),
    },
    async ({ extension, config }) => {
      try {
        const conn = new Trex.TrexDB("memory");
        try {
          await conn.execute(`SELECT trex_db_stop_service('${escapeSql(extension)}')`, []);
        } catch {
          // Service may not be running — starting is still valid.
        }
        const sql = `SELECT trex_db_start_service('${escapeSql(extension)}', '${escapeSql(config)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const message = rows[0]?.[0] || rows[0]?.trex_db_start_service || "Service restarted";
        return { content: [{ type: "text", text: message }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "cluster-load-extension",
    "Load a DuckDB/trexsql extension into the engine (equivalent to LOAD '<name>'). Use this to make an installed extension's functions available. Returns a confirmation message on success.",
    {
      extensionName: z.string().describe("Extension name to load, e.g. 'httpfs', 'spatial'"),
    },
    async ({ extensionName }) => {
      try {
        const conn = new Trex.TrexDB("memory");
        await conn.execute(`LOAD '${escapeSql(extensionName)}'`, []);
        return { content: [{ type: "text", text: `Extension '${extensionName}' loaded` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    },
  );
}
