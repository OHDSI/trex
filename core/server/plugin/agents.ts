// The `agents` plugin type (spec 006): each declared agent runs as an
// edge-runtime worker whose servicePath is the core-shipped runtime service
// (core/server/agents/service). Routing/auth/SSE piping reuse the function
// plugin proxy (_addFunction).
import type { Express } from "express";
import { _addFunction, isTrustedPluginScope, substituteEnvVarsInObject, TRUSTED_PLUGIN_SCOPES } from "./function.ts";
import { PLUGINS_BASE_PATH } from "../config.ts";

export interface AgentEntry {
  name: string;
  dir: string;
  env?: Record<string, string>;
}

export function normalizeAgentsValue(value: unknown): AgentEntry[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((e) => {
    const entry = e as { name?: string; dir?: string; env?: unknown };
    if (!entry?.name || !/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name)) {
      throw new Error(`agents: each entry needs a name ([a-zA-Z0-9_-]), got ${JSON.stringify(e)}`);
    }
    const result: AgentEntry = { name: entry.name, dir: entry.dir ?? "agent" };
    if (entry.env && typeof entry.env === "object" && !Array.isArray(entry.env)) {
      result.env = entry.env as Record<string, string>;
    }
    return result;
  });
}

// Env vars forwarded from the host into agent workers when set.
const PASSTHROUGH_ENV = [
  "DATABASE_URL", "TREX_AGENTS_DEFAULT_MODEL",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL",
  "GOOGLE_GENERATIVE_AI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_REGION",
  // OAuth broker (task-7): the worker needs the root key to unwrap the DEK
  // (token encryption-at-rest) and derive the signed-state HMAC secret. Absent
  // → the broker stays unwired and oauth connections are skipped (see
  // service/index.ts) — every non-oauth agent still boots.
  "TREX_ROOT_KEY",
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

// `skipNames`, when given, is applied only at THIS call's own level (never
// forwarded into the recursive calls for subdirectories) — it exists so
// callers can exclude specific top-level entries (see the `evals` exclusion
// below) without accidentally skipping a same-named dir nested deeper in the
// tree.
async function copyDirRecursive(src: string, dest: string, skipNames?: ReadonlySet<string>): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    if (skipNames?.has(entry.name)) continue;
    const s = `${src}/${entry.name}`;
    const d = `${dest}/${entry.name}`;
    // Deno.stat follows symlinks, so linked files/dirs are copied as content.
    const info = entry.isSymlink ? await Deno.stat(s) : entry;
    if (info.isDirectory) await copyDirRecursive(s, d);
    else if (info.isFile) await Deno.copyFile(s, d);
  }
}

// Authoring-time-only top-level entries under an agent dir that must never
// be staged into a worker's servicePath: an eval suite (e.g.
// plugins/devx/agent/evals/) is eve's own local dev/test harness — its own
// node_modules (@ai-sdk/amazon-bedrock, eve, etc., ~100MB) and .eve run
// artifacts have no runtime purpose and would otherwise be copied into every
// staged worker on every registration.
const AGENT_DIR_STAGING_EXCLUDES = new Set(["evals"]);

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
  await copyDirRecursive(agentDir, stagedAgentDir, AGENT_DIR_STAGING_EXCLUDES);

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

// Auth carve-out for channel routes (task-4). A channel route lives at
// {basePath}/eve/v1/<channelId>/... and is authenticated by the adapter's own
// platform-signature verify() inside the worker — NOT by a trex JWT — so it
// must bypass authContext/pluginAuthz at the proxy, which would otherwise 401
// an unauthenticated platform webhook (Discord/Slack/…). The session/chat/
// health/info routes are deliberately EXCLUDED from the exemption (negative
// lookahead) so their proxy auth is unchanged — weakening those would be a
// serious bug. Passed to _addFunction as fncfg.authExemptPattern.
//
// The `eve` channel is a SPECIAL case in the reserved set: it is the built-in
// WEB channel (adapters/eve.ts), trusted browser traffic that — unlike a
// platform webhook — carries NO platform signature. Instead it authenticates
// via the trex JWT exactly like the native session API (spec §5: eve-web =
// "trex JWT (existing)"). So `eve` MUST stay reserved (auth-enforced): leaving
// it exempt would let anyone create sessions, spend model tokens, run tools,
// and read other users' session streams (IDOR) with no credential.
//
// INVARIANT: the reserved set below (session|health|info|eve) MUST stay in sync
// with handler.ts's authenticated `/eve/v1/*` route set PLUS the built-in
// JWT-authed `eve` web channel. If a new AUTHED `/eve/v1/<seg>` route (or a new
// JWT-authed built-in channel) is ever added, `<seg>` MUST be added to this
// lookahead — otherwise `/eve/v1/<seg>` becomes auth-exempt (an unauthenticated
// hole). A channel named like a reserved word (e.g. a `sessionx` or
// `eventbridge` channel) is unaffected: the lookahead only excludes the exact
// segments, boundaried by `/` or end.
//
// The OAuth consent routes (task-7) at `/eve/v1/oauth/<connector>/{start,
// callback}` are DELIBERATELY NOT in the reserved set: they are auth-exempt on
// purpose (a provider's browser redirect carries no trex JWT) and are gated by
// the signed `state` verified inside the handlers (connections/oauth/routes.ts)
// — exactly like a channel route is gated by its adapter's signature verify.
// `oauth` must therefore stay OUT of the lookahead.
export function channelAuthExemptPattern(basePath: string): RegExp {
  const esc = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}/eve/v1/(?!(?:session|health|info|eve)(?:/|$))[^/]+`);
}

export async function addAgentsPlugin(
  app: Express,
  value: unknown,
  dir: string,
  name: string,
): Promise<void> {
  if (!isTrustedScopeAgentsPlugin(name)) {
    // Log and skip, don't throw: one misconfigured/malicious plugin must
    // not take down boot for every other plugin.
    console.error(`agents: plugin ${name} skipped — agents plugins must be published under a trusted scope (${TRUSTED_PLUGIN_SCOPES.join(", ")}) (auth requirement)`);
    return;
  }
  for (const entry of normalizeAgentsValue(value)) {
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
      {
        function: `/agents/${entry.name}`,
        allowHostFsAccess: true,
        // Channel subpaths ({basePath}/eve/v1/<channelId>/*) bypass proxy auth;
        // the worker enforces adapter signature verification instead. session/
        // chat/health/info keep authContext+pluginAuthz. See the pattern's doc.
        authExemptPattern: channelAuthExemptPattern(basePath),
      },
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
