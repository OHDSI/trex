// The `agents` plugin type (spec 006): each declared agent runs as an
// edge-runtime worker whose servicePath is the core-shipped runtime service
// (core/server/agents/service). Routing/auth/SSE piping reuse the function
// plugin proxy (_addFunction).
import type { Express } from "express";
import { _addFunction, isTrustedPluginScope, substituteEnvVarsInObject, TRUSTED_PLUGIN_SCOPES } from "./function.ts";
import { PLUGINS_BASE_PATH } from "../config.ts";
import { type AgentMemoryLink, generateMemoryArtifacts, parseMemoryLinks } from "./agent-memory.ts";

export interface AgentEntry {
  name: string;
  dir: string;
  env?: Record<string, string>;
  memory?: AgentMemoryLink[];
}

export function normalizeAgentsValue(value: unknown): AgentEntry[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((e) => {
    const entry = e as { name?: string; dir?: string; env?: unknown; memory?: unknown };
    if (!entry?.name || !/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name)) {
      throw new Error(`agents: each entry needs a name ([a-zA-Z0-9_-]), got ${JSON.stringify(e)}`);
    }
    const result: AgentEntry = { name: entry.name, dir: entry.dir ?? "agent" };
    if (entry.env && typeof entry.env === "object" && !Array.isArray(entry.env)) {
      result.env = entry.env as Record<string, string>;
    }
    if (entry.memory !== undefined) {
      result.memory = parseMemoryLinks(entry.memory);
    }
    return result;
  });
}

// Env vars forwarded from the host into agent workers when set.
const PASSTHROUGH_ENV = [
  "DATABASE_URL", "TREX_AGENTS_DEFAULT_MODEL",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL",
  "GOOGLE_GENERATIVE_AI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION",
];

// Resolve the on-disk agents runtime dir (core/server/agents). import.meta.url
// is NOT a reliable disk path here: in the packaged image the main service
// executes from a build-time compile graph whose file URLs
// (file:///var/tmp/sb-compile-…) don't exist at runtime. Try meta-relative
// first (source checkouts, tests), then cwd-relative (packaged image — same
// convention as index.ts's shinylive path).
export async function resolveAgentsRuntimeDir(): Promise<string> {
  const candidates = [
    new URL("../agents/", import.meta.url).pathname,
    `${Deno.cwd()}/core/server/agents/`,
  ];
  for (const c of candidates) {
    try {
      await Deno.stat(`${c}service/index.ts`);
      return c;
    } catch { /* try next candidate */ }
  }
  throw new Error(
    `agents: cannot locate the agents runtime dir (tried ${candidates.join(", ")})`,
  );
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    const s = `${src}/${entry.name}`;
    const d = `${dest}/${entry.name}`;
    // Deno.stat follows symlinks, so linked files/dirs are copied as content.
    const info = entry.isSymlink ? await Deno.stat(s) : entry;
    if (info.isDirectory) await copyDirRecursive(s, d);
    else if (info.isFile) await Deno.copyFile(s, d);
  }
}

export async function buildAgentWorkerConfig(
  pluginDir: string,
  entry: AgentEntry,
  pluginFullName: string,
): Promise<{ source: string; servicePath: string; importMapPath: string; env: Record<string, string> }> {
  const agentDir = `${pluginDir}/${entry.dir}`;
  // Fail registration early with a clear message rather than at first request.
  // Presence-only check: the loader (agents/loader.ts) accepts instructions.md
  // OR instructions.edn and owns full parsing/precedence at worker start.
  // NotFound falls through to the next check/the "missing" error below;
  // anything else (permissions, I/O) is a real failure and must surface
  // with its own cause rather than being swallowed into a misleading
  // "missing" message — matches loader.ts's readEdn/instructions.md handling.
  try {
    await Deno.stat(`${agentDir}/instructions.md`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw new Error(`agents: failed to stat ${agentDir}/instructions.md: ${e instanceof Error ? e.message : e} (plugin ${pluginFullName})`);
    }
    try {
      await Deno.stat(`${agentDir}/instructions.edn`);
    } catch (e2) {
      if (!(e2 instanceof Deno.errors.NotFound)) {
        throw new Error(`agents: failed to stat ${agentDir}/instructions.edn: ${e2 instanceof Error ? e2.message : e2} (plugin ${pluginFullName})`);
      }
      throw new Error(`agents: ${agentDir}/instructions.md (or instructions.edn) is required but missing (plugin ${pluginFullName})`);
    }
  }

  // The worker's module loader only resolves file: specifiers under its own
  // servicePath (plus npm:/jsr:/remote specifiers) — out-of-tree file://
  // imports fail in the packaged image, statically at graph creation and
  // dynamically at module evaluation, regardless of fs permissions
  // (allowHostFsAccess governs runtime I/O like Deno.readTextFile, not
  // module resolution). So stage everything the worker imports inside the
  // servicePath: the core agents runtime (self-contained — relative imports
  // and bare specifiers only) and the agent's own dir (loader.ts
  // dynamic-imports agent.ts/tools/hooks from TREX_AGENT_DIR). Boot-time
  // snapshot semantics are unchanged: the pool reuses the first worker per
  // servicePath anyway, so live edits to a dev-mounted plugin already
  // required re-registration to take effect.
  const tmp = await Deno.makeTempDir({ prefix: "trex-agents-" });
  const runtimeSrc = await resolveAgentsRuntimeDir();
  for (const sub of ["service", "eve-shim"]) {
    await copyDirRecursive(`${runtimeSrc}${sub}`, `${tmp}/agents/${sub}`);
  }
  await Deno.copyFile(`${runtimeSrc}loader.ts`, `${tmp}/agents/loader.ts`);
  const stagedAgentDir = `${tmp}/agent`;
  await copyDirRecursive(agentDir, stagedAgentDir);

  // Linked-memory tools/skills (agent-linked-memory design, Task 3):
  // generated straight into the staged copy, never the plugin's own agent
  // dir on disk — same "everything the worker imports lives inside
  // servicePath" rule as the rest of this function. Validation that each
  // link names a DECLARED `trex.memory` plugin happens one level up, in
  // addAgentsPlugin, before this function is ever called for that entry.
  if (entry.memory?.length) {
    await generateMemoryArtifacts(stagedAgentDir, entry.memory);
  }

  const shimBase = `file://${tmp}/agents/eve-shim/`;
  const imports: Record<string, string> = {
    "eve": `${shimBase}mod.ts`,
    "eve/tools": `${shimBase}tools.ts`,
    "eve/evals": `${shimBase}evals.ts`,
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

  const importMapPath = `${tmp}/import_map.json`;
  await Deno.writeTextFile(importMapPath, JSON.stringify({ imports }, null, 2));
  // The worker's static graph builder resolves bare specifiers from the
  // servicePath's deno.json, not from the importMapPath worker option (that
  // one only kicks in at runtime) — without this, graph creation fails with
  // `Import "edn-data" not a dependency` on the staged loader.ts.
  await Deno.writeTextFile(`${tmp}/deno.json`, JSON.stringify({ imports }, null, 2));

  // The runtime's worker pool keys workers by servicePath and reuses the
  // FIRST worker created for a given path (env vars and the import map are
  // creation-time only, baked in at worker start) — see
  // trex-runtime/crates/base's servicePath-keyed pool. If every agent
  // shared the core service dir as servicePath, every agent after the
  // first would silently run with the first agent's TREX_AGENT_DIR/env.
  // Give each agent its own servicePath (this temp dir, holding its
  // import_map.json and the staged runtime + agent code) whose index.ts
  // imports the staged service entrypoint — everything the graph needs is
  // in-tree.
  await Deno.writeTextFile(`${tmp}/index.ts`, `import "./agents/service/index.ts";\n`);

  const env: Record<string, string> = {};

  // Passthrough env vars from the host (if set)
  for (const k of PASSTHROUGH_ENV) {
    const v = Deno.env.get(k);
    if (v) env[k] = v;
  }

  // Entry-specific env (substituted), can override passthrough
  const entryEnv = substituteEnvVarsInObject(entry.env ?? {});
  Object.assign(env, entryEnv);

  // Reserved keys must not be overridden. TREX_AGENT_DIR points at the
  // staged copy: the worker can only import modules under its servicePath
  // (see above), and loader.ts dynamic-imports agent code from this dir.
  const reserved: Record<string, string> = {
    TREX_AGENT_DIR: stagedAgentDir,
    TREX_AGENT_NAME: entry.name,
    TREX_PLUGIN_NAME: pluginFullName,
  };
  Object.assign(env, reserved);

  // Linked-memory env — only injected when the agent actually declares
  // links, and set AFTER entry-specific env so a plugin manifest can't
  // clobber them (same non-overridable treatment as `reserved` above).
  //  - GBRAIN_MEMORY_TOKEN: the bearer token the generated tools
  //    (agent-memory.ts's renderMemoryTool) send to the memory worker's
  //    internal MCP endpoint. Read from the same host env var
  //    memory/gbrain-worker/mount.ts's buildMemoryWorkerConfig reads for the
  //    worker side, so both ends agree on the token.
  //  - MEMORY_MCP_URL: the internal memory-service base the generated tool
  //    fetches `${MEMORY_MCP_URL}/memory/<name>/mcp` against. RUNTIME-GATED:
  //    the actual agent-worker -> memory-worker reachability (bypassing the
  //    Express session layer, see mount.ts's module doc comment on
  //    fnmap/Trex.tokioChannel) can't be exercised here (trex-runtime
  //    submodule not checked out) — this only wires a configurable address
  //    (GBRAIN_MEMORY_INTERNAL_URL) with a sane localhost default so the
  //    generated tool has something to call once that path is verified.
  //  - TREX_AGENT_MEMORIES: comma-joined linked memory names, so agent code
  //    can enumerate its links without re-parsing the manifest.
  if (entry.memory?.length) {
    env.GBRAIN_MEMORY_TOKEN = Deno.env.get("GBRAIN_MEMORY_TOKEN") ?? "";
    env.MEMORY_MCP_URL = Deno.env.get("GBRAIN_MEMORY_INTERNAL_URL") ?? "http://127.0.0.1:8000";
    env.TREX_AGENT_MEMORIES = entry.memory.map((l) => l.name).join(",");
  }

  return {
    source: `/${entry.name}`,
    servicePath: tmp,
    importMapPath,
    env,
  };
}

// _addFunction (function.ts) only applies [authContext, pluginAuthz] to
// plugins under a trusted scope (TRUSTED_PLUGIN_SCOPES: @trex, @ohdsi) —
// d2e/legacy function plugins authenticate themselves inside the worker using
// the forwarded Logto header, which an agents worker doesn't do. Until
// worker-side auth exists for agents, anything outside a trusted scope would
// mount a completely unauthenticated HTTP surface (session create, chat, tool
// execution).
export function isTrustedScopeAgentsPlugin(name: string): boolean {
  return isTrustedPluginScope(name);
}

// Pure — returns the subset of an agent's memory links whose name is NOT in
// the declared-memory allow-list (see plugin.ts's DECLARED_MEMORY_NAMES,
// populated in a pre-pass across every plugin's package.json before any
// plugin is dispatched, since agents (orderRank 4) load before memory (5)
// yet the two can live in different plugins scanned in either order).
// Exported standalone so it's testable without driving addAgentsPlugin's
// full Express-app path.
export function unknownMemoryLinks(
  links: AgentMemoryLink[] | undefined,
  declaredMemoryNames: ReadonlySet<string>,
): AgentMemoryLink[] {
  return (links ?? []).filter((l) => !declaredMemoryNames.has(l.name));
}

export async function addAgentsPlugin(
  app: Express,
  value: unknown,
  dir: string,
  name: string,
  declaredMemoryNames: ReadonlySet<string> = new Set(),
): Promise<void> {
  if (!isTrustedScopeAgentsPlugin(name)) {
    // Log and skip, don't throw: one misconfigured/malicious plugin must
    // not take down boot for every other plugin.
    console.error(`agents: plugin ${name} skipped — agents plugins must be published under a trusted scope (${TRUSTED_PLUGIN_SCOPES.join(", ")}) (auth requirement)`);
    return;
  }
  for (const entry of normalizeAgentsValue(value)) {
    // Mirrors the trusted-scope guard above, but per-agent rather than
    // per-plugin: an unknown linked memory means this ONE agent is
    // misconfigured, not the whole plugin — skip just this entry (before any
    // filesystem work in buildAgentWorkerConfig) and keep registering the
    // plugin's other agents.
    const badLinks = unknownMemoryLinks(entry.memory, declaredMemoryNames);
    if (badLinks.length > 0) {
      for (const l of badLinks) {
        console.error(
          `agents: agent ${entry.name} (plugin ${name}) links unknown memory "${l.name}" — not declared by any trex.memory plugin; skipping agent`,
        );
      }
      continue;
    }
    const cfg = await buildAgentWorkerConfig(dir, entry, name);
    console.log(`add agent ${entry.name} @ ${cfg.env.TREX_AGENT_DIR}`);
    // _addFunction computes servicePath as `${dir}${fncfg.function}` and the
    // mounted URL from `source` + plugin scope; TREX_AGENT_BASE tells the
    // worker its mount point so it can strip the prefix. Always the
    // trusted-scope mount — the guard above rejects everything else.
    const scope = `/${name.slice(1, name.indexOf("/"))}`;
    const basePath = `${PLUGINS_BASE_PATH}${scope}${cfg.source}`;
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
// Async because the migrations dir must be resolved from disk, not from
// import.meta.url — see resolveAgentsRuntimeDir (in the packaged image the
// meta URL points into a build-time compile graph that doesn't exist at
// runtime, so the migration runner failed with "Directory not found").
export async function agentsCoreMigrationTarget() {
  return {
    name: "agents-core",
    path: `${await resolveAgentsRuntimeDir()}migrations`,
    schema: "agents",
    database: "_config",
  };
}
