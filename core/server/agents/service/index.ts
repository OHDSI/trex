// Edge-runtime worker entry for an agents-type plugin. One worker per agent;
// the control server proxies all HTTP for the agent's base path here.
import pg from "pg";
import { loadAgent } from "../loader.ts";
import { createStore } from "./store.ts";
import { createHandler } from "./handler.ts";

const agentDir = Deno.env.get("TREX_AGENT_DIR");
if (!agentDir) throw new Error("agents: TREX_AGENT_DIR not set");

const pool = new pg.Pool({ connectionString: Deno.env.get("DATABASE_URL") });
const agent = await loadAgent(agentDir);
const handler = createHandler({
  agent,
  store: createStore((sql, params) => pool.query(sql, params as never)),
  plugin: Deno.env.get("TREX_PLUGIN_NAME") || "unknown",
  agentName: Deno.env.get("TREX_AGENT_NAME") || "agent",
  basePath: Deno.env.get("TREX_AGENT_BASE") || "",
});

Deno.serve((req) => handler(req));
