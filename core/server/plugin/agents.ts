// The `agents` plugin type (spec 006): each declared agent runs as an
// edge-runtime worker whose servicePath is the core-shipped runtime service
// (core/server/agents/service). Routing/auth/SSE piping reuse the function
// plugin proxy (_addFunction).
import type { Express } from "express";
import { _addFunction } from "./function.ts";
import { PLUGINS_BASE_PATH } from "../config.ts";

export interface AgentEntry {
  name: string;
  dir: string;
}

export function normalizeAgentsValue(value: unknown): AgentEntry[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((e) => {
    const entry = e as { name?: string; dir?: string };
    if (!entry?.name || !/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name)) {
      throw new Error(`agents: each entry needs a name ([a-zA-Z0-9_-]), got ${JSON.stringify(e)}`);
    }
    return { name: entry.name, dir: entry.dir ?? "agent" };
  });
}

// Env vars forwarded from the host into agent workers when set.
const PASSTHROUGH_ENV = [
  "DATABASE_URL", "TREX_AGENTS_DEFAULT_MODEL",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL",
  "GOOGLE_GENERATIVE_AI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION",
];

export async function buildAgentWorkerConfig(
  pluginDir: string,
  entry: AgentEntry,
  pluginFullName: string,
): Promise<{ source: string; servicePath: string; importMapPath: string; env: Record<string, string> }> {
  const agentDir = `${pluginDir}/${entry.dir}`;
  // Fail registration early with a clear message rather than at first request.
  // Presence-only check: the loader (agents/loader.ts) accepts instructions.md
  // OR instructions.edn and owns full parsing/precedence at worker start.
  try {
    await Deno.stat(`${agentDir}/instructions.md`);
  } catch {
    try {
      await Deno.stat(`${agentDir}/instructions.edn`);
    } catch {
      throw new Error(`agents: ${agentDir}/instructions.md (or instructions.edn) is required but missing (plugin ${pluginFullName})`);
    }
  }

  const shimBase = new URL("../agents/eve-shim/", import.meta.url);
  const imports: Record<string, string> = {
    "eve": new URL("mod.ts", shimBase).href,
    "eve/tools": new URL("tools.ts", shimBase).href,
    "eve/evals": new URL("evals.ts", shimBase).href,
    "ai": "npm:ai@^6",
    "@ai-sdk/anthropic": "npm:@ai-sdk/anthropic@latest",
    "@ai-sdk/openai": "npm:@ai-sdk/openai@latest",
    "@ai-sdk/google": "npm:@ai-sdk/google@latest",
    "@ai-sdk/amazon-bedrock": "npm:@ai-sdk/amazon-bedrock@^4.0.115",
    "zod": "npm:zod@^4",
    "pg": "npm:pg",
    "edn-data": "npm:edn-data@^1",
  };
  // Agent-provided deno.json imports win (e.g. extra npm deps for tools).
  try {
    const own = JSON.parse(await Deno.readTextFile(`${agentDir}/deno.json`));
    Object.assign(imports, own.imports ?? {});
  } catch { /* optional */ }

  const tmp = await Deno.makeTempDir({ prefix: "trex-agents-" });
  const importMapPath = `${tmp}/import_map.json`;
  await Deno.writeTextFile(importMapPath, JSON.stringify({ imports }, null, 2));

  const env: Record<string, string> = {
    TREX_AGENT_DIR: agentDir,
    TREX_AGENT_NAME: entry.name,
    TREX_PLUGIN_NAME: pluginFullName,
  };
  for (const k of PASSTHROUGH_ENV) {
    const v = Deno.env.get(k);
    if (v) env[k] = v;
  }

  return {
    source: `/${entry.name}`,
    servicePath: new URL("../agents/service", import.meta.url).pathname,
    importMapPath,
    env,
  };
}

export async function addAgentsPlugin(
  app: Express,
  value: unknown,
  dir: string,
  name: string,
): Promise<void> {
  for (const entry of normalizeAgentsValue(value)) {
    const cfg = await buildAgentWorkerConfig(dir, entry, name);
    console.log(`add agent ${entry.name} @ ${cfg.env.TREX_AGENT_DIR}`);
    // _addFunction computes servicePath as `${dir}${fncfg.function}` and the
    // mounted URL from `source` + plugin scope; TREX_AGENT_BASE tells the
    // worker its mount point so it can strip the prefix.
    const scope = name.startsWith("@") ? `/${name.slice(1, name.indexOf("/"))}` : "";
    const basePath = name.startsWith("@trex/")
      ? `${PLUGINS_BASE_PATH}${scope}${cfg.source}`
      : cfg.source;
    _addFunction(
      app,
      cfg.source,
      cfg.servicePath,
      cfg.importMapPath,
      { function: `/agents/${entry.name}`, allowHostFsAccess: true },
      dir,
      name,
      { _shared: { ...cfg.env, TREX_AGENT_BASE: basePath } },
    );
  }
}

// Registered once by plugin.ts when the first agents-type plugin appears.
export function agentsCoreMigrationTarget() {
  return {
    name: "agents-core",
    path: new URL("../agents/migrations", import.meta.url).pathname,
    schema: "agents",
    database: "_config",
  };
}
