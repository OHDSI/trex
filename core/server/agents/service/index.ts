// Edge-runtime worker entry for an agents-type plugin. One worker per agent;
// the control server proxies all HTTP for the agent's base path here.
// npm: specifier on purpose — a bare "pg" entry in core/server's import map
// would remap existing production imports of "pg" (e.g. plugin/function.ts's
// dynamic import resolving via node_modules), which is off-limits. The worker
// resolves npm: specifiers natively, same convention as devx functions.
import pg from "npm:pg@^8";
import { loadAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import { createHandler } from "./handler.ts";

const agentDir = Deno.env.get("TREX_AGENT_DIR");
if (!agentDir) throw new Error("agents: TREX_AGENT_DIR not set");

const pool = new pg.Pool({ connectionString: Deno.env.get("DATABASE_URL") });
// Shared with the store AND handed to createHandler as `sql` so a
// resolveModel/buildInstructions hook's `hookCtx.sql` runs against the same
// pool the rest of the worker uses (H1) — not a second connection.
const query = (sql: string, params?: unknown[]) => pool.query(sql, params as never);
const agent = await loadAgent(agentDir);
const handler = createHandler({
  agent,
  store: createStore(query),
  plugin: Deno.env.get("TREX_PLUGIN_NAME") || "unknown",
  agentName: Deno.env.get("TREX_AGENT_NAME") || "agent",
  basePath: Deno.env.get("TREX_AGENT_BASE") || "",
  sql: query,
});

Deno.serve((req) => handler(req));
